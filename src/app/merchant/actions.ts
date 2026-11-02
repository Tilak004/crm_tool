"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { actorOf, audit } from "@/lib/audit";
import { requireMerchant } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseDayEntry, persistDay, type InvoiceEntry, type PaymentEntry } from "@/lib/day-entry";
import { formatPaise, isValidDate, todayIST } from "@/lib/gst";
import { mappingSummary, parseMapping } from "@/lib/hsn";
import { isPaymentMode, modeLabel } from "@/lib/payments";
import { snapshotTotals } from "@/lib/revisions";
import { MAX_UPLOAD_BYTES, deleteUpload, saveUpload, sniffType } from "@/lib/uploads";

export type { InvoiceEntry, InvoiceRow, PaymentEntry } from "@/lib/day-entry";
export type SaveResult = { ok: boolean; message: string };

const LOCKED_MESSAGE = "This day has been locked by your CA and can no longer be edited.";

class DayLockedError extends Error {}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function saveDay(date: string, invoices: InvoiceEntry[], payments: PaymentEntry[], submit: boolean): Promise<SaveResult> {
  const { user, merchant } = await requireMerchant();
  if (!isValidDate(date) || date > todayIST()) return { ok: false, message: "Invalid date." };

  const existing = await db.saleDay.findUnique({ where: { merchantId_date: { merchantId: merchant.id, date } } });
  if (existing?.locked) return { ok: false, message: LOCKED_MESSAGE };

  const data = parseDayEntry(invoices, payments);
  if ("error" in data) return { ok: false, message: data.error };
  if (submit && data.invoices.length === 0) return { ok: false, message: "Add at least one invoice before submitting." };

  try {
    await db.$transaction(async (tx) => {
      const day = await tx.saleDay.upsert({
        where: { merchantId_date: { merchantId: merchant.id, date } },
        create: { merchantId: merchant.id, date, submitted: submit },
        update: { submitted: submit },
      });
      // The CA may have locked the day between the check above and now.
      if (day.locked) throw new DayLockedError();

      const wasSubmitted = await tx.saleDayRevision.count({ where: { saleDayId: day.id, action: "SUBMIT" } });
      const { snapshot, changes } = await persistDay(tx, {
        merchantId: merchant.id, saleDayId: day.id, data, actor: user, revisionAction: submit ? "SUBMIT" : "DRAFT",
      });
      const t = snapshotTotals(snapshot);
      await audit(tx, {
        actor: actorOf(user),
        action: submit ? "DAY_SUBMITTED" : "DAY_DRAFT_SAVED",
        merchant,
        saleDate: date,
        summary: `${t.count} invoice(s), cash ${formatPaise(t.cash)}, bank ${formatPaise(t.bank)}` +
          (wasSubmitted > 0 ? " (edited after submission)" : ""),
        details: { changes, snapshot },
      });
    });
  } catch (e) {
    if (e instanceof DayLockedError) return { ok: false, message: LOCKED_MESSAGE };
    throw e;
  }

  revalidatePath("/merchant");
  revalidatePath(`/merchant/day/${date}`);
  return { ok: true, message: submit ? "Sales submitted to your CA." : "Draft saved." };
}

// ---------- HSN mapping (only merchants the admin has allowed) ----------

export async function mapOwnItem(itemId: string, _prev: SaveResult | null, form: FormData): Promise<SaveResult> {
  const { user, merchant } = await requireMerchant();
  if (!merchant.canMapHsn) return { ok: false, message: "Your CA hasn't enabled HSN mapping for your account." };
  const item = await db.item.findUnique({ where: { id: itemId } });
  if (!item || item.merchantId !== merchant.id) return { ok: false, message: "Item not found." };

  const parsed = await parseMapping(form);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  await db.$transaction(async (tx) => {
    await tx.item.update({
      where: { id: item.id },
      data: { hsnCode: parsed.hsn, gstRate: parsed.rate, mappedById: user.id, mappedAt: new Date() },
    });
    await audit(tx, {
      actor: actorOf(user),
      action: "ITEM_MAPPED",
      merchant,
      summary: mappingSummary(item.name, item.hsnCode, item.gstRate, parsed.hsn, parsed.rate),
      details: { itemId: item.id, from: { hsn: item.hsnCode, rate: item.gstRate }, to: { hsn: parsed.hsn, rate: parsed.rate } },
    });
  });
  revalidatePath("/merchant/hsn");
  revalidatePath("/ca", "layout");
  return { ok: true, message: "Saved" };
}

// ---------- Invoice files ----------

export async function uploadInvoiceFiles(date: string, form: FormData): Promise<SaveResult> {
  const { user, merchant } = await requireMerchant();
  if (!isValidDate(date) || date > todayIST()) return { ok: false, message: "Invalid date." };
  const modeRaw = form.get("mode");
  const mode = isPaymentMode(modeRaw) ? modeRaw : null;
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, message: "Choose at least one file." };
  if (files.length > 20) return { ok: false, message: "Upload at most 20 files at a time." };

  const accepted: { bytes: Uint8Array; mime: string; ext: string; name: string }[] = [];
  for (const f of files) {
    if (f.size > MAX_UPLOAD_BYTES) return { ok: false, message: `${f.name} is larger than 10 MB.` };
    const bytes = new Uint8Array(await f.arrayBuffer());
    const type = sniffType(bytes);
    if (!type) return { ok: false, message: `${f.name}: only PDF, JPG, PNG or WEBP files are allowed.` };
    accepted.push({ bytes, mime: type.mime, ext: type.ext, name: f.name.slice(0, 200) });
  }

  const day = await db.saleDay.upsert({
    where: { merchantId_date: { merchantId: merchant.id, date } },
    create: { merchantId: merchant.id, date },
    update: {},
  });
  if (day.locked) return { ok: false, message: LOCKED_MESSAGE };

  for (const a of accepted) {
    const storageKey = await saveUpload(merchant.id, a.bytes, a.ext);
    await db.$transaction(async (tx) => {
      await tx.dayAttachment.create({
        data: { saleDayId: day.id, mode, fileName: a.name, mimeType: a.mime, size: a.bytes.length, storageKey, uploadedById: user.id },
      });
      await audit(tx, {
        actor: actorOf(user),
        action: "FILE_UPLOADED",
        merchant,
        saleDate: date,
        summary: `${a.name}${mode ? ` (${modeLabel(mode)})` : ""}`,
        details: { fileName: a.name, mode, size: a.bytes.length, sha256: sha256(a.bytes) },
      });
    });
  }
  revalidatePath(`/merchant/day/${date}`);
  return { ok: true, message: `${accepted.length} file(s) uploaded.` };
}

export async function deleteInvoiceFile(attachmentId: string): Promise<SaveResult> {
  const { user, merchant } = await requireMerchant();
  const a = await db.dayAttachment.findUnique({ where: { id: attachmentId }, include: { saleDay: true } });
  if (!a || a.saleDay.merchantId !== merchant.id) return { ok: false, message: "File not found." };
  if (a.saleDay.locked) return { ok: false, message: LOCKED_MESSAGE };
  await db.$transaction(async (tx) => {
    await tx.dayAttachment.delete({ where: { id: a.id } });
    await audit(tx, {
      actor: actorOf(user),
      action: "FILE_REMOVED",
      merchant,
      saleDate: a.saleDay.date,
      summary: `${a.fileName}${a.mode ? ` (${modeLabel(a.mode)})` : ""}`,
      details: { fileName: a.fileName, mode: a.mode, size: a.size, uploadedAt: a.createdAt },
    });
  });
  await deleteUpload(a.storageKey);
  revalidatePath(`/merchant/day/${a.saleDay.date}`);
  return { ok: true, message: "File removed." };
}
