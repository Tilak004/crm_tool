import { formatPaise } from "./gst";
import { modeLabel } from "./payments";

export type Snapshot = {
  invoices: { invoiceNo: string; mode: string; lines: { name: string; quantity: number; unit: string; amountPaise: number }[] }[];
  received: { mode: string; amountPaise: number }[];
};

export function parseSnapshot(json: string): Snapshot {
  try {
    const s = JSON.parse(json);
    return { invoices: Array.isArray(s.invoices) ? s.invoices : [], received: Array.isArray(s.received) ? s.received : [] };
  } catch {
    return { invoices: [], received: [] };
  }
}

export const invoiceAmount = (inv: Snapshot["invoices"][number]) => inv.lines.reduce((s, l) => s + l.amountPaise, 0);

export function snapshotTotals(s: Snapshot) {
  let cash = 0, bank = 0;
  for (const inv of s.invoices) {
    if (inv.mode === "CASH") cash += invoiceAmount(inv);
    else bank += invoiceAmount(inv);
  }
  return { cash, bank, count: s.invoices.length };
}

const describe = (inv: Snapshot["invoices"][number]) => `${modeLabel(inv.mode)} ${formatPaise(invoiceAmount(inv))}`;
const linesText = (inv: Snapshot["invoices"][number]) =>
  inv.lines.map((l) => `${l.name} ${l.quantity} ${l.unit} ${formatPaise(l.amountPaise)}`).join(", ");

/** Human-readable list of what changed between two saves. */
export function diffSnapshots(prev: Snapshot | null, next: Snapshot): string[] {
  if (!prev) return [`First save: ${next.invoices.length} invoice(s)`];
  const changes: string[] = [];
  const before = new Map(prev.invoices.map((i) => [i.invoiceNo.toLowerCase(), i]));
  const after = new Map(next.invoices.map((i) => [i.invoiceNo.toLowerCase(), i]));

  for (const [k, inv] of after) {
    const old = before.get(k);
    if (!old) { changes.push(`Added ${inv.invoiceNo} (${describe(inv)})`); continue; }
    if (old.mode !== inv.mode) changes.push(`${inv.invoiceNo}: payment mode ${modeLabel(old.mode)} → ${modeLabel(inv.mode)}`);
    if (invoiceAmount(old) !== invoiceAmount(inv)) {
      changes.push(`${inv.invoiceNo}: amount ${formatPaise(invoiceAmount(old))} → ${formatPaise(invoiceAmount(inv))}`);
    }
    if (linesText(old) !== linesText(inv) && invoiceAmount(old) === invoiceAmount(inv)) {
      changes.push(`${inv.invoiceNo}: items changed`);
    }
  }
  for (const [k, inv] of before) {
    if (!after.has(k)) changes.push(`Removed ${inv.invoiceNo} (${describe(inv)}): ${linesText(inv)}`);
  }
  const rec = (s: Snapshot) => JSON.stringify([...s.received].sort((a, b) => a.mode.localeCompare(b.mode)));
  if (rec(prev) !== rec(next)) changes.push("Amount received figures changed");
  return changes.length ? changes : ["No changes"];
}
