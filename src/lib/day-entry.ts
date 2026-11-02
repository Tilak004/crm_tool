import "server-only";
import type { Prisma } from "@prisma/client";
import { UNITS, nameKey, normalizeName, rupeesToPaise } from "./gst";
import { PAYMENT_MODES, isPaymentMode, type ModeField, type PaymentMode } from "./payments";
import { diffSnapshots, parseSnapshot, type Snapshot } from "./revisions";

// Validation and saving of a day's invoices, shared by the merchant's own
// entry and CA corrections.

export type InvoiceRow = { name: string; quantity: string; unit: string; amount: string };
export type InvoiceEntry = { invoiceNo: string; mode: PaymentMode; rows: InvoiceRow[] };
/** The optional cash-in-hand style check: total received per mode. */
export type PaymentEntry = { mode: PaymentMode; amount: string };

type Line = { key: string; name: string; unit: string; quantity: number; amountPaise: number };
export type ParsedInvoice = { invoiceNo: string; mode: PaymentMode; lines: Line[] };
export type ParsedDay = { invoices: ParsedInvoice[]; received: { mode: PaymentMode; amountPaise: number }[] };

/** Validates the submitted form. Completely blank invoices are ignored. */
export function parseDayEntry(invoices: InvoiceEntry[], payments: PaymentEntry[]): ParsedDay | { error: string } {
  const parsed: ParsedInvoice[] = [];
  const seenNos = new Set<string>();
  const nonBlank = invoices.filter((inv) => inv.invoiceNo.trim() || inv.rows.some((r) => r.name.trim() || r.quantity.trim() || r.amount.trim()));
  for (const inv of nonBlank) {
    const invoiceNo = inv.invoiceNo.trim();
    const where = invoiceNo ? `Invoice ${invoiceNo}` : "An invoice";
    if (!invoiceNo) return { error: "Every invoice needs an invoice number." };
    if (invoiceNo.length > 40) return { error: `${where}: invoice number is too long.` };
    if (seenNos.has(invoiceNo.toLowerCase())) return { error: `Invoice number ${invoiceNo} is used twice.` };
    seenNos.add(invoiceNo.toLowerCase());
    if (!isPaymentMode(inv.mode)) return { error: `${where}: pick how it was paid.` };

    const lines = new Map<string, Line>(); // same item twice on one invoice is combined
    const rows = inv.rows.filter((r) => r.name.trim() || r.quantity.trim() || r.amount.trim());
    for (const [i, r] of rows.entries()) {
      const at = `${where}, item ${i + 1}`;
      const name = normalizeName(r.name);
      if (!name) return { error: `${at}: item name is required.` };
      if (name.length > 120) return { error: `${at}: item name is too long.` };
      const quantity = Number(r.quantity);
      if (!r.quantity.trim() || !isFinite(quantity) || quantity <= 0) return { error: `${at}: enter a quantity greater than 0.` };
      const amountPaise = rupeesToPaise(r.amount);
      if (amountPaise === null || amountPaise <= 0) return { error: `${at}: enter a valid amount.` };
      const unit = (UNITS as readonly string[]).includes(r.unit) ? r.unit : "NOS";
      const key = nameKey(name);
      const prev = lines.get(key);
      if (prev) { prev.quantity += quantity; prev.amountPaise += amountPaise; }
      else lines.set(key, { key, name, unit, quantity, amountPaise });
    }
    if (lines.size === 0) return { error: `${where}: add at least one item.` };
    parsed.push({ invoiceNo, mode: inv.mode, lines: [...lines.values()] });
  }

  const received: ParsedDay["received"] = [];
  for (const p of payments) {
    if (!isPaymentMode(p.mode) || !p.amount.trim()) continue;
    const amountPaise = rupeesToPaise(p.amount);
    if (amountPaise === null) {
      return { error: `${PAYMENT_MODES.find((m) => m.key === p.mode)!.label}: amount received is not a valid number.` };
    }
    received.push({ mode: p.mode, amountPaise });
  }
  return { invoices: parsed, received };
}

const fieldOf = (mode: PaymentMode): ModeField => PAYMENT_MODES.find((m) => m.key === mode)!.field;
const invoiceKey = (inv: { mode: string; lines: { name: string; quantity: number; unit: string; amountPaise: number }[] }) =>
  JSON.stringify([inv.mode, inv.lines.map((l) => [l.name.toLowerCase(), l.quantity, l.unit, l.amountPaise])]);

/**
 * Replaces the day's invoices, item totals and payment figures, and records a
 * revision snapshot. Invoices a CA user adds or changes are marked with
 * caEditedAt/caEditedBy; the mark stays until the merchant changes that invoice.
 */
export async function persistDay(
  tx: Prisma.TransactionClient,
  opts: {
    merchantId: string;
    saleDayId: string;
    data: ParsedDay;
    actor: { id: string; name: string; role: string };
    revisionAction: "DRAFT" | "SUBMIT" | "CA_EDIT";
  },
) {
  const { merchantId, saleDayId, data, actor, revisionAction } = opts;
  const byCA = actor.role === "ADMIN" || actor.role === "STAFF";

  const previous = await tx.saleDayRevision.findFirst({ where: { saleDayId }, orderBy: { createdAt: "desc" } });
  const prevSnap = previous ? parseSnapshot(previous.snapshot) : null;
  const prevKeys = new Map((prevSnap?.invoices ?? []).map((i) => [i.invoiceNo.toLowerCase(), invoiceKey(i)]));
  const prevMarks = new Map(
    (await tx.invoice.findMany({ where: { saleDayId }, select: { invoiceNo: true, caEditedAt: true, caEditedBy: true } }))
      .map((i) => [i.invoiceNo.toLowerCase(), i]),
  );

  await tx.invoice.deleteMany({ where: { saleDayId } });
  await tx.saleLine.deleteMany({ where: { saleDayId } });

  type Total = { itemId: string; quantity: number } & Record<ModeField, number>;
  const totals = new Map<string, Total>();
  const itemIds = new Map<string, string>();
  const now = new Date();

  for (const [position, inv] of data.invoices.entries()) {
    const k = inv.invoiceNo.toLowerCase();
    const unchanged = prevKeys.get(k) === invoiceKey(inv);
    const mark = unchanged
      ? { caEditedAt: prevMarks.get(k)?.caEditedAt ?? null, caEditedBy: prevMarks.get(k)?.caEditedBy ?? null }
      : byCA ? { caEditedAt: now, caEditedBy: actor.name } : { caEditedAt: null, caEditedBy: null };
    const invoice = await tx.invoice.create({
      data: { saleDayId, invoiceNo: inv.invoiceNo, mode: inv.mode, position, ...mark },
    });
    for (const [linePos, line] of inv.lines.entries()) {
      let itemId = itemIds.get(line.key);
      if (!itemId) {
        const item = await tx.item.upsert({
          where: { merchantId_nameKey: { merchantId, nameKey: line.key } },
          create: { merchantId, name: line.name, nameKey: line.key, unit: line.unit },
          update: { unit: line.unit },
        });
        itemId = item.id;
        itemIds.set(line.key, itemId);
      }
      await tx.invoiceLine.create({
        data: { invoiceId: invoice.id, itemId, quantity: line.quantity, amountPaise: line.amountPaise, position: linePos },
      });
      const t = totals.get(itemId) ?? { itemId, quantity: 0, cashPaise: 0, upiPaise: 0, cardPaise: 0, otherPaise: 0 };
      t.quantity += line.quantity;
      t[fieldOf(inv.mode)] += line.amountPaise;
      totals.set(itemId, t);
    }
  }

  for (const t of totals.values()) {
    await tx.saleLine.create({
      data: {
        saleDayId, itemId: t.itemId, quantity: t.quantity,
        amountPaise: t.cashPaise + t.upiPaise + t.cardPaise + t.otherPaise,
        cashPaise: t.cashPaise, upiPaise: t.upiPaise, cardPaise: t.cardPaise, otherPaise: t.otherPaise,
      },
    });
  }

  await tx.dayPayment.deleteMany({ where: { saleDayId } });
  if (data.received.length) await tx.dayPayment.createMany({ data: data.received.map((r) => ({ saleDayId, ...r })) });

  const snapshot: Snapshot = {
    invoices: data.invoices.map((inv) => ({
      invoiceNo: inv.invoiceNo,
      mode: inv.mode,
      lines: inv.lines.map((l) => ({ name: l.name, quantity: l.quantity, unit: l.unit, amountPaise: l.amountPaise })),
    })),
    received: data.received,
  };
  await tx.saleDayRevision.create({
    data: { saleDayId, action: revisionAction, savedById: actor.id, savedByName: actor.name, snapshot: JSON.stringify(snapshot) },
  });

  return { snapshot, changes: diffSnapshots(prevSnap, snapshot) };
}
