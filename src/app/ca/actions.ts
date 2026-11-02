"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { actorOf, audit } from "@/lib/audit";
import { requireAdmin, requireCA } from "@/lib/auth";
import { businessLabel, gstRegLabel, isGstRegType, parseBusinessTypes, serializeBusinessTypes } from "@/lib/business";
import { db } from "@/lib/db";
import { parseDayEntry, persistDay, type InvoiceEntry, type PaymentEntry } from "@/lib/day-entry";
import { mappingSummary, parseMapping } from "@/lib/hsn";
import { GST_PORTAL_HSN_URL, downloadFromGstPortal, importHsnWorkbook, type ImportSummary } from "@/lib/hsn-import";

// Every action here is written to the audit log. The only one that changes a
// merchant's sales figures is caEditDay, which requires a reason the merchant sees.

export type FormState = { ok: boolean; message: string } | null;

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

// ---------- HSN mapping ----------

export async function mapItem(itemId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireCA();
  const parsed = await parseMapping(form);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  const item = await db.item.findUnique({ where: { id: itemId }, include: { merchant: true } });
  if (!item) return { ok: false, message: "Item not found." };

  await db.$transaction(async (tx) => {
    await tx.item.update({
      where: { id: itemId },
      data: { hsnCode: parsed.hsn, gstRate: parsed.rate, mappedById: user.id, mappedAt: new Date() },
    });
    await audit(tx, {
      actor: actorOf(user),
      action: "ITEM_MAPPED",
      merchant: item.merchant,
      summary: mappingSummary(item.name, item.hsnCode, item.gstRate, parsed.hsn, parsed.rate),
      details: { itemId, from: { hsn: item.hsnCode, rate: item.gstRate }, to: { hsn: parsed.hsn, rate: parsed.rate } },
    });
  });
  revalidatePath("/ca", "layout");
  revalidatePath("/merchant", "layout");
  return { ok: true, message: "Saved" };
}

export async function setMerchantHsnAccess(merchantId: string, canMapHsn: boolean) {
  const user = await requireAdmin();
  await db.$transaction(async (tx) => {
    const merchant = await tx.merchant.update({ where: { id: merchantId }, data: { canMapHsn } });
    await audit(tx, {
      actor: actorOf(user), action: "HSN_ACCESS", merchant,
      summary: canMapHsn ? "Merchant allowed to map HSN codes" : "Merchant HSN mapping turned off",
      details: { canMapHsn },
    });
  });
  revalidatePath("/ca", "layout");
  revalidatePath("/merchant", "layout");
}

// ---------- HSN master (admin only) ----------

async function logImport(user: { id: string; name: string; role: string }, source: string, s: ImportSummary) {
  await db.$transaction((tx) => audit(tx, {
    actor: actorOf(user), action: "HSN_IMPORTED",
    summary: `${s.goodsCount} HSN + ${s.servicesCount} SAC codes from ${source}`,
    details: { source, ...s },
  }));
}

export async function importHsnFromPortal(): Promise<FormState> {
  const user = await requireAdmin();
  try {
    const s = await importHsnWorkbook(db, await downloadFromGstPortal(), GST_PORTAL_HSN_URL, user.name);
    await logImport(user, "GST portal", s);
    revalidatePath("/ca", "layout");
    return { ok: true, message: `Loaded ${s.goodsCount} HSN and ${s.servicesCount} SAC codes from the GST portal.` };
  } catch (e) {
    return { ok: false, message: `Couldn't load from the GST portal: ${e instanceof Error ? e.message : e}` };
  }
}

export async function importHsnFromUpload(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose the HSN_SAC.xlsx file." };
  if (file.size > 20 * 1024 * 1024) return { ok: false, message: "File is too large." };
  try {
    const s = await importHsnWorkbook(db, await file.arrayBuffer(), `Upload: ${file.name}`, user.name);
    await logImport(user, `uploaded file ${file.name}`, s);
    revalidatePath("/ca", "layout");
    return { ok: true, message: `Loaded ${s.goodsCount} HSN and ${s.servicesCount} SAC codes from ${file.name}.` };
  } catch (e) {
    return { ok: false, message: `Couldn't read the file: ${e instanceof Error ? e.message : e}` };
  }
}

// ---------- CA corrections to a merchant's invoices ----------

/**
 * Lets a CA user correct a day's invoices. A reason is required. It reaches the
 * merchant as a remark together with the list of changes, the changed invoices
 * are marked "Changed by CA" on the merchant's screen, and the edit is logged.
 */
export async function caEditDay(
  merchantId: string, date: string, invoices: InvoiceEntry[], payments: PaymentEntry[], _submit: boolean, reason: string,
): Promise<{ ok: boolean; message: string }> {
  const user = await requireCA();
  const why = reason.trim();
  if (why.length < 5) return { ok: false, message: "Write the reason for this change (the merchant will see it)." };
  if (why.length > 1000) return { ok: false, message: "Keep the reason under 1000 characters." };

  const day = await db.saleDay.findUnique({ where: { merchantId_date: { merchantId, date } }, include: { merchant: true } });
  if (!day) return { ok: false, message: "This day has no entries to correct." };
  const data = parseDayEntry(invoices, payments);
  if ("error" in data) return { ok: false, message: data.error };

  let changed = true;
  await db.$transaction(async (tx) => {
    const { snapshot, changes } = await persistDay(tx, {
      merchantId, saleDayId: day.id, data, actor: user, revisionAction: "CA_EDIT",
    });
    if (changes.length === 1 && changes[0] === "No changes") { changed = false; throw new NoChanges(); }
    const remark = await tx.remark.create({
      data: {
        merchantId, saleDayId: day.id, authorId: user.id, authorName: user.name,
        text: `Your CA changed this day's entries.\nReason: ${why}\nChanges:\n${changes.map((c) => `• ${c}`).join("\n")}`,
      },
    });
    await audit(tx, {
      actor: actorOf(user), action: "CA_EDITED_DAY", merchant: day.merchant, saleDate: date,
      summary: `Reason: ${why}`, details: { changes, snapshot, remarkId: remark.id },
    });
  }).catch((e) => { if (!(e instanceof NoChanges)) throw e; });
  if (!changed) return { ok: false, message: "Nothing was changed." };

  revalidatePath("/ca", "layout");
  revalidatePath("/merchant", "layout");
  return { ok: true, message: "Changes saved. The merchant can see them and your reason." };
}

class NoChanges extends Error {}

// ---------- Remarks to merchants ----------

export async function addRemark(merchantId: string, saleDayId: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireCA();
  const text = String(form.get("text") ?? "").trim();
  if (!text) return { ok: false, message: "Write a remark first." };
  if (text.length > 2000) return { ok: false, message: "Keep remarks under 2000 characters." };

  const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
  const day = saleDayId ? await db.saleDay.findUnique({ where: { id: saleDayId } }) : null;
  if (!merchant || (saleDayId && (!day || day.merchantId !== merchantId))) return { ok: false, message: "Not found." };

  await db.$transaction(async (tx) => {
    const remark = await tx.remark.create({
      data: { merchantId, saleDayId, authorId: user.id, authorName: user.name, text },
    });
    await audit(tx, {
      actor: actorOf(user), action: "REMARK_ADDED", merchant, saleDate: day?.date ?? null,
      summary: text, details: { remarkId: remark.id },
    });
  });
  revalidatePath("/ca", "layout");
  revalidatePath("/merchant", "layout");
  return { ok: true, message: "Remark sent to the merchant." };
}

// ---------- Day locking ----------

export async function setDayLocked(dayId: string, locked: boolean) {
  const user = await requireCA();
  const day = await db.$transaction(async (tx) => {
    const day = await tx.saleDay.update({
      where: { id: dayId },
      data: locked
        ? { locked: true, lockedById: user.id, lockedAt: new Date() }
        : { locked: false, lockedById: null, lockedAt: null },
      include: { merchant: true },
    });
    await audit(tx, {
      actor: actorOf(user), action: locked ? "DAY_LOCKED" : "DAY_UNLOCKED", merchant: day.merchant, saleDate: day.date,
      summary: locked ? "Day locked; merchant can no longer edit it" : "Day unlocked; merchant can edit it again",
    });
    return day;
  });
  revalidatePath("/ca", "layout");
  revalidatePath(`/merchant/day/${day.date}`);
}

// ---------- Merchants (admin only) ----------

export async function createMerchant(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const businessName = String(form.get("businessName") ?? "").trim();
  const gstin = String(form.get("gstin") ?? "").trim().toUpperCase();
  const phone = String(form.get("phone") ?? "").trim();
  const contactName = String(form.get("contactName") ?? "").trim();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");

  if (!businessName) return { ok: false, message: "Business name is required." };
  if (gstin && !GSTIN_RE.test(gstin)) return { ok: false, message: "GSTIN format looks wrong." };
  if (!contactName) return { ok: false, message: "Contact person name is required." };
  const business = readBusinessFields(form, gstin);
  if ("error" in business) return { ok: false, message: business.error };
  const err = validateCredentials(username, password);
  if (err) return { ok: false, message: err };
  if (await db.user.findUnique({ where: { username } })) return { ok: false, message: "That username is taken." };
  const passwordHash = await bcrypt.hash(password, 10);

  await db.$transaction(async (tx) => {
    const merchant = await tx.merchant.create({
      data: {
        businessName,
        gstin: gstin || null,
        phone: phone || null,
        ...business,
        users: { create: { name: contactName, username, role: "MERCHANT", passwordHash } },
      },
    });
    await audit(tx, {
      actor: actorOf(user), action: "MERCHANT_CREATED", merchant,
      summary: `Created with login ${username}`,
      details: describeMerchant(merchant),
    });
  });
  revalidatePath("/ca", "layout");
  return { ok: true, message: `Merchant created. Login: ${username}` };
}

export async function updateMerchant(merchantId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const businessName = String(form.get("businessName") ?? "").trim();
  const gstin = String(form.get("gstin") ?? "").trim().toUpperCase();
  const phone = String(form.get("phone") ?? "").trim();

  if (!businessName) return { ok: false, message: "Business name is required." };
  if (gstin && !GSTIN_RE.test(gstin)) return { ok: false, message: "GSTIN format looks wrong." };
  const business = readBusinessFields(form, gstin);
  if ("error" in business) return { ok: false, message: business.error };

  await db.$transaction(async (tx) => {
    const before = await tx.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    const after = await tx.merchant.update({
      where: { id: merchantId },
      data: { businessName, gstin: gstin || null, phone: phone || null, ...business },
    });
    const b = describeMerchant(before), a = describeMerchant(after);
    const changes = (Object.keys(a) as (keyof typeof a)[])
      .filter((k) => b[k] !== a[k])
      .map((k) => `${k}: ${b[k] || "—"} → ${a[k] || "—"}`);
    if (changes.length) {
      await audit(tx, {
        actor: actorOf(user), action: "MERCHANT_UPDATED", merchant: after,
        summary: changes.join("; "), details: { before: b, after: a },
      });
    }
  });
  revalidatePath("/ca", "layout");
  revalidatePath("/merchant", "layout");
  return { ok: true, message: "Details saved." };
}

export async function setMerchantActive(merchantId: string, active: boolean) {
  const user = await requireAdmin();
  await db.$transaction(async (tx) => {
    const merchant = await tx.merchant.update({ where: { id: merchantId }, data: { active } });
    await audit(tx, {
      actor: actorOf(user), action: "MERCHANT_STATUS", merchant,
      summary: active ? "Merchant activated" : "Merchant deactivated", details: { active },
    });
  });
  revalidatePath("/ca", "layout");
}

// ---------- Staff (admin only) ----------

export async function createStaff(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const role = form.get("role") === "ADMIN" ? "ADMIN" : "STAFF";

  if (!name) return { ok: false, message: "Name is required." };
  const err = validateCredentials(username, password);
  if (err) return { ok: false, message: err };
  if (await db.user.findUnique({ where: { username } })) return { ok: false, message: "That username is taken." };
  const passwordHash = await bcrypt.hash(password, 10);

  await db.$transaction(async (tx) => {
    await tx.user.create({ data: { name, username, role, passwordHash } });
    await audit(tx, {
      actor: actorOf(user), action: "USER_CREATED",
      summary: `${role === "ADMIN" ? "Admin" : "Staff"} account ${username} (${name})`, details: { username, name, role },
    });
  });
  revalidatePath("/ca/admin/staff");
  return { ok: true, message: `${role === "ADMIN" ? "Admin" : "Staff"} account created. Login: ${username}` };
}

export async function setUserActive(userId: string, active: boolean) {
  const me = await requireAdmin();
  if (userId === me.id) return;
  await db.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id: userId }, data: { active }, include: { merchant: true } });
    await audit(tx, {
      actor: actorOf(me), action: "USER_STATUS", merchant: u.merchant,
      summary: `${u.username} ${active ? "activated" : "deactivated"}`, details: { userId, active },
    });
  });
  revalidatePath("/ca", "layout");
}

export async function resetPassword(userId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { ok: false, message: "Min 8 characters." };
  const passwordHash = await bcrypt.hash(password, 10);
  await db.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id: userId }, data: { passwordHash }, include: { merchant: true } });
    // The password itself is never logged.
    await audit(tx, {
      actor: actorOf(me), action: "PASSWORD_RESET", merchant: u.merchant,
      summary: `Password reset for ${u.username}`, details: { userId },
    });
  });
  return { ok: true, message: "Password updated" };
}

function describeMerchant(m: { businessName: string; gstin: string | null; phone: string | null; businessTypes: string; gstRegType: string | null }) {
  return {
    "Business name": m.businessName,
    GSTIN: m.gstin ?? "",
    Phone: m.phone ?? "",
    "Business type": parseBusinessTypes(m.businessTypes).map(businessLabel).join(", "),
    "GST registration": gstRegLabel(m.gstRegType) ?? "",
  };
}

function readBusinessFields(form: FormData, gstin: string): { businessTypes: string; gstRegType: string | null } | { error: string } {
  const businessTypes = serializeBusinessTypes(form.getAll("businessTypes").map(String));
  const raw = String(form.get("gstRegType") ?? "");
  const gstRegType = isGstRegType(raw) ? raw : null;
  if (gstRegType === "UNREGISTERED" && gstin) return { error: "An unregistered merchant shouldn't have a GSTIN. Clear one of them." };
  return { businessTypes, gstRegType };
}

function validateCredentials(username: string, password: string) {
  if (!USERNAME_RE.test(username)) return "Username: 3–32 characters, lowercase letters, digits, . _ - only.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  return null;
}
