"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CheckCell from "@/components/CheckCell";
import { UNITS, formatPaise, rupeesToPaise } from "@/lib/gst";
import { PAYMENT_MODES, invoiceRanges, nextInvoiceNo, reconcile, type PaymentMode } from "@/lib/payments";
import type { InvoiceEntry, InvoiceRow, PaymentEntry } from "@/lib/day-entry";

type SaveResult = { ok: boolean; message: string };
/** Shown as a "Changed by CA" badge until the merchant changes that invoice. */
type InitialInvoice = InvoiceEntry & { caEditedBy?: string | null };
type Invoice = InitialInvoice & { key: number };

const emptyRow = (): InvoiceRow => ({ name: "", quantity: "", unit: "NOS", amount: "" });
const paise = (v: string) => (v.trim() ? rupeesToPaise(v) ?? 0 : 0);
const TH = "border-b border-gray-200 bg-gray-50 px-3 py-2 font-semibold";
const TD = "sm:border-b sm:border-gray-100 sm:px-3 sm:py-2";
const MODE_STYLE: Record<PaymentMode, string> = {
  CASH: "border-l-emerald-500",
  UPI: "border-l-blue-500",
  CARD: "border-l-indigo-500",
  OTHER: "border-l-sky-500",
};

/**
 * Invoice-wise entry for one day. The merchant saves drafts or submits; in "ca"
 * mode a CA user corrects the entries and must give a reason the merchant sees.
 */
export default function SalesEntryForm({
  save: saveAction, mode = "merchant", initialInvoices, initialPayments, knownItems, lastInvoice, locked,
}: {
  save: (invoices: InvoiceEntry[], payments: PaymentEntry[], submit: boolean, reason: string) => Promise<SaveResult>;
  mode?: "merchant" | "ca";
  initialInvoices: InitialInvoice[];
  initialPayments: PaymentEntry[];
  knownItems: { name: string; unit: string }[];
  lastInvoice: { invoiceNo: string; mode: string } | null;
  locked: boolean;
}) {
  const [reason, setReason] = useState("");
  const router = useRouter();
  const nextKey = useRef(initialInvoices.length + 1);
  const newInvoice = (prev: { invoiceNo: string; mode: string } | null): Invoice => ({
    key: nextKey.current++,
    invoiceNo: prev ? nextInvoiceNo(prev.invoiceNo) : "",
    mode: (prev?.mode as PaymentMode) ?? "CASH",
    rows: [emptyRow()],
  });
  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    initialInvoices.length
      ? initialInvoices.map((inv, i) => ({ ...inv, key: i + 1 }))
      : locked ? [] : [newInvoice(lastInvoice)],
  );
  const [payments, setPayments] = useState<PaymentEntry[]>(initialPayments);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [pending, startTransition] = useTransition();

  const unitByName = useMemo(() => new Map(knownItems.map((i) => [i.name.toLowerCase(), i.unit])), [knownItems]);

  const invoiceTotal = (inv: InvoiceEntry) => inv.rows.reduce((s, r) => s + paise(r.amount), 0);
  const modeTotals = Object.fromEntries(PAYMENT_MODES.map((m) => [
    m.field, invoices.filter((i) => i.mode === m.key).reduce((s, i) => s + invoiceTotal(i), 0),
  ])) as Record<(typeof PAYMENT_MODES)[number]["field"], number>;
  const { checks, mismatches } = reconcile(
    [{ amountPaise: 0, ...modeTotals }],
    payments.map((p) => ({ mode: p.mode, amountPaise: p.amount.trim() ? rupeesToPaise(p.amount) : null })),
  );
  const ranges = invoiceRanges(invoices.filter((i) => i.invoiceNo.trim()));
  const cashTotal = modeTotals.cashPaise;
  const bankTotal = modeTotals.upiPaise + modeTotals.cardPaise + modeTotals.otherPaise;

  function edit(key: number, fn: (inv: Invoice) => Invoice) {
    setResult(null);
    setInvoices((prev) => prev.map((inv) => (inv.key === key ? fn(inv) : inv)));
  }

  function editRow(key: number, i: number, patch: Partial<InvoiceRow>) {
    edit(key, (inv) => ({
      ...inv,
      rows: inv.rows.map((r, j) => {
        if (j !== i) return r;
        const next = { ...r, ...patch };
        // Picking an item the merchant has sold before fills in its unit.
        if (patch.name !== undefined) {
          const unit = unitByName.get(patch.name.trim().toLowerCase());
          if (unit) next.unit = unit;
        }
        return next;
      }),
    }));
  }

  function addInvoice() {
    setResult(null);
    setInvoices((prev) => {
      const last = [...prev].reverse().find((i) => i.invoiceNo.trim()) ?? null;
      return [...prev, newInvoice(last ?? lastInvoice)];
    });
  }

  function save(submit: boolean) {
    startTransition(async () => {
      const res = await saveAction(invoices.map((i) => ({ invoiceNo: i.invoiceNo, mode: i.mode, rows: i.rows })), payments, submit, reason);
      setResult(res);
      if (res.ok) {
        if (mode === "ca") setReason("");
        router.refresh();
      }
    });
  }

  return (
    <>
      <datalist id="known-items">
        {knownItems.map((i) => <option key={i.name} value={i.name} />)}
      </datalist>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <h2 className="mr-auto font-semibold">Invoices ({invoices.length})</h2>
        <span>Cash: <b>{formatPaise(cashTotal)}</b></span>
        <span>Bank: <b>{formatPaise(bankTotal)}</b></span>
        <span>Total: <b>{formatPaise(cashTotal + bankTotal)}</b></span>
      </div>

      {invoices.length === 0 && <p className="card p-6 text-center text-sm text-gray-500">No invoices for this day.</p>}

      {invoices.map((inv, n) => (
        <section key={inv.key} className={`card border-l-4 ${MODE_STYLE[inv.mode]}`} aria-label={`Invoice ${n + 1}`}>
          <div className="flex flex-wrap items-end gap-3 border-b border-gray-100 px-4 py-3">
            <div>
              <label className="label" htmlFor={`inv-no-${inv.key}`}>Invoice no.</label>
              <input id={`inv-no-${inv.key}`} className="input w-36 font-mono" value={inv.invoiceNo} disabled={locked} maxLength={40}
                placeholder="e.g. C-101" onChange={(e) => edit(inv.key, (x) => ({ ...x, invoiceNo: e.target.value }))} />
            </div>
            <div>
              <span className="label">Paid by</span>
              <div className="flex overflow-hidden rounded-md border border-gray-300" role="radiogroup" aria-label={`Invoice ${n + 1} paid by`}>
                {PAYMENT_MODES.map((m) => (
                  <button key={m.key} type="button" role="radio" aria-checked={inv.mode === m.key} disabled={locked}
                    className={`px-3 py-2 text-sm ${inv.mode === m.key ? (m.bank ? "bg-blue-700 text-white" : "bg-emerald-600 text-white") : "bg-white text-gray-700 hover:bg-gray-50"}`}
                    onClick={() => edit(inv.key, (x) => ({ ...x, mode: m.key }))}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            {inv.caEditedBy && (
              <span className="badge self-center bg-orange-100 text-orange-800" title="This invoice was added or changed by your CA">
                Changed by CA ({inv.caEditedBy})
              </span>
            )}
            <div className="ml-auto text-right">
              <div className="text-xs text-gray-500">Invoice total</div>
              <div className="font-semibold">{formatPaise(invoiceTotal(inv))}</div>
            </div>
            {!locked && (
              <button type="button" className="btn btn-danger py-1 text-xs"
                onClick={() => {
                  if (inv.rows.some((r) => r.name.trim()) && !confirm(`Remove invoice ${inv.invoiceNo || n + 1}?`)) return;
                  setInvoices((p) => p.filter((x) => x.key !== inv.key));
                }}>
                Remove invoice
              </button>
            )}
          </div>
          {/* A table on wider screens; on phones each item becomes a small card (name, then qty/unit/amount). */}
          <div>
            <table className="w-full text-left text-sm">
              <thead className="hidden sm:table-header-group">
                <tr className="text-xs uppercase tracking-wide text-gray-500">
                  <th className={TH + " min-w-56"}>Item</th><th className={TH + " w-24"}>Qty</th><th className={TH + " w-28"}>Unit</th>
                  <th className={TH + " w-36 text-right"}>Amount (₹ incl. GST)</th><th className={TH + " w-8"}></th>
                </tr>
              </thead>
              <tbody className="block divide-y divide-gray-100 sm:table-row-group sm:divide-y-0">
                {inv.rows.map((r, i) => (
                  <tr key={i} className="grid grid-cols-[1fr_1fr_1.4fr_auto] items-center gap-2 px-3 py-2.5 sm:table-row sm:p-0">
                    <td className={TD + " col-span-4"}>
                      <input className="input" list="known-items" value={r.name} disabled={locked} placeholder="Item name"
                        aria-label={`Invoice ${n + 1} item ${i + 1} name`} onChange={(e) => editRow(inv.key, i, { name: e.target.value })} />
                    </td>
                    <td className={TD}>
                      <input className="input" inputMode="decimal" value={r.quantity} disabled={locked} placeholder="Qty"
                        aria-label={`Invoice ${n + 1} item ${i + 1} quantity`} onChange={(e) => editRow(inv.key, i, { quantity: e.target.value })} />
                    </td>
                    <td className={TD}>
                      <select className="input" value={r.unit} disabled={locked} aria-label={`Invoice ${n + 1} item ${i + 1} unit`}
                        onChange={(e) => editRow(inv.key, i, { unit: e.target.value })}>
                        {UNITS.map((u) => <option key={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className={TD}>
                      <input className="input text-right" inputMode="decimal" value={r.amount} disabled={locked} placeholder="₹ Amount"
                        aria-label={`Invoice ${n + 1} item ${i + 1} amount`}
                        onChange={(e) => editRow(inv.key, i, { amount: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && i === inv.rows.length - 1) {
                            e.preventDefault();
                            edit(inv.key, (x) => ({ ...x, rows: [...x.rows, emptyRow()] }));
                          }
                        }} />
                    </td>
                    <td className={TD + " text-center"}>
                      {!locked && (
                        <button type="button" className="p-1 text-gray-400 hover:text-red-600" aria-label={`Remove item ${i + 1}`}
                          onClick={() => edit(inv.key, (x) => ({ ...x, rows: x.rows.length > 1 ? x.rows.filter((_, j) => j !== i) : [emptyRow()] }))}>
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!locked && (
            <div className="px-4 py-2">
              <button type="button" className="text-sm text-blue-700 hover:underline"
                onClick={() => edit(inv.key, (x) => ({ ...x, rows: [...x.rows, emptyRow()] }))}>
                + Add item
              </button>
            </div>
          )}
        </section>
      ))}

      {!locked && (
        <button type="button" className="btn btn-secondary w-full border-dashed" onClick={addInvoice}>+ Add invoice</button>
      )}

      <section className="card">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="font-semibold">Day summary</h2>
          <p className="text-xs text-gray-500">
            Counts and totals come from the invoices above. Optionally enter the total you actually received in each mode (e.g. cash in hand) to cross-check.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Mode</th><th className="text-right">Invoices</th><th>Invoice no. range</th>
                <th className="text-right">Invoices total</th><th className="w-40 text-right">Amount received (₹)</th><th>Check</th>
              </tr>
            </thead>
            <tbody>
              {PAYMENT_MODES.map((m) => {
                const r = ranges.find((x) => x.mode === m.key)!;
                const c = checks.find((x) => x.mode === m.key)!;
                const p = payments.find((x) => x.mode === m.key)!;
                return (
                  <tr key={m.key}>
                    <td className="font-medium">{m.label}{m.bank && <span className="ml-1 text-xs font-normal text-gray-400">bank</span>}</td>
                    <td className="text-right">{r.count || "—"}</td>
                    <td className="font-mono text-sm">{r.first ? (r.first === r.last ? r.first : `${r.first} → ${r.last}`) : "—"}</td>
                    <td className="text-right">{formatPaise(c.itemsPaise)}</td>
                    <td>
                      <input className="input text-right" inputMode="decimal" value={p.amount} disabled={locked}
                        aria-label={`${m.label} amount received`}
                        onChange={(e) => { setResult(null); setPayments((prev) => prev.map((x) => (x.mode === m.key ? { ...x, amount: e.target.value } : x))); }} />
                    </td>
                    <td className="text-sm"><CheckCell diffPaise={c.diffPaise} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!locked && mode === "merchant" && mismatches > 0 && (
          <p className="border-t border-gray-100 px-4 py-3 text-xs text-amber-700">
            Amount received differs from the invoices for some modes. You can still submit; your CA will see it.
          </p>
        )}
        {!locked && mode === "ca" && (
          <div className="space-y-3 border-t border-orange-200 bg-orange-50 p-4">
            <div>
              <label className="label" htmlFor="ca-reason">Reason for the change (required, the merchant will see this)</label>
              <textarea id="ca-reason" className="input" rows={2} maxLength={1000} value={reason}
                placeholder="e.g. Invoice C-105 amount corrected from ₹1,500 to ₹1,050 as per the bill photo."
                onChange={(e) => { setResult(null); setReason(e.target.value); }} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="mr-auto text-xs text-gray-600">
                The merchant is shown exactly what changed and your reason. The change is recorded in the edit log.
              </span>
              {result && <span className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.message}</span>}
              <button type="button" className="btn btn-primary" disabled={pending || reason.trim().length < 5} onClick={() => save(false)}>
                {pending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Always-visible action bar for the merchant (sits above the phone tab bar). */}
      {!locked && mode === "merchant" && (
        <div className="sticky bottom-16 z-20 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur sm:bottom-0 sm:mx-0 sm:rounded-lg sm:border">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="mr-auto text-sm">
              <span className="text-emerald-700">Cash <b>{formatPaise(cashTotal)}</b></span>
              <span className="mx-2 text-gray-300">|</span>
              <span className="text-blue-700">Bank <b>{formatPaise(bankTotal)}</b></span>
              <span className="mx-2 text-gray-300">|</span>
              <span>Total <b>{formatPaise(cashTotal + bankTotal)}</b></span>
            </div>
            {result && <span className={`w-full text-sm sm:w-auto ${result.ok ? "text-green-700" : "text-red-600"}`} role="status">{result.message}</span>}
            <div className="flex w-full gap-2 sm:w-auto">
              <button type="button" className="btn btn-secondary flex-1 sm:flex-none" disabled={pending} onClick={() => save(false)}>Save draft</button>
              <button type="button" className="btn btn-primary flex-1 sm:flex-none" disabled={pending} onClick={() => save(true)}>
                {pending ? "Saving…" : "Submit to CA"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
