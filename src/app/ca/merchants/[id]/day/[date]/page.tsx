import Link from "next/link";
import { notFound } from "next/navigation";
import AttachmentList from "@/components/AttachmentList";
import CheckCell from "@/components/CheckCell";
import StatusBadge from "@/components/StatusBadge";
import { requireCA } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatPaise, isValidDate, splitInclusive } from "@/lib/gst";
import { PAYMENT_MODES, invoiceRanges, isUnsplit, modeLabel, reconcile } from "@/lib/payments";
import { diffSnapshots, parseSnapshot, snapshotTotals } from "@/lib/revisions";
import RemarkForm from "@/components/RemarkForm";
import RemarkList from "@/components/RemarkList";
import { remarksForDay } from "@/lib/remarks";
import { addRemark, setDayLocked } from "../../../../actions";

const fmtTime = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function CADayView({ params }: { params: Promise<{ id: string; date: string }> }) {
  await requireCA();
  const { id, date } = await params;
  if (!isValidDate(date)) notFound();

  const day = await db.saleDay.findUnique({
    where: { merchantId_date: { merchantId: id, date } },
    include: {
      merchant: true,
      lockedBy: { select: { name: true } },
      invoices: { orderBy: { position: "asc" }, include: { lines: { orderBy: { position: "asc" }, include: { item: true } } } },
      lines: { include: { item: true }, orderBy: { id: "asc" } },
      payments: true,
      attachments: { orderBy: { createdAt: "asc" } },
      revisions: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!day) notFound();
  const remarks = await remarksForDay(day.id);

  // Quantity and amount per item per payment mode, from the invoices.
  const byItemMode = new Map<string, Map<string, { qty: number; amount: number }>>();
  for (const inv of day.invoices) {
    for (const l of inv.lines) {
      const modes = byItemMode.get(l.itemId) ?? new Map();
      const cur = modes.get(inv.mode) ?? { qty: 0, amount: 0 };
      modes.set(inv.mode, { qty: cur.qty + l.quantity, amount: cur.amount + l.amountPaise });
      byItemMode.set(l.itemId, modes);
    }
  }

  let totalAmount = 0, totalTaxable = 0, totalTax = 0, unmapped = 0;
  const rows = day.lines.map((l) => {
    totalAmount += l.amountPaise;
    if (l.item.hsnCode === null || l.item.gstRate === null) {
      unmapped++;
      return { line: l, split: null };
    }
    const split = splitInclusive(l.amountPaise, l.item.gstRate);
    totalTaxable += split.taxable;
    totalTax += split.tax;
    return { line: l, split };
  });
  const { checks, mismatches, unsplitPaise } = reconcile(day.lines, day.payments);
  const ranges = invoiceRanges(day.invoices);
  const cash = checks.find((c) => c.mode === "CASH")!.itemsPaise;
  const bank = checks.filter((c) => c.mode !== "CASH").reduce((s, c) => s + c.itemsPaise, 0);
  const invoiceTotal = (inv: (typeof day.invoices)[number]) => inv.lines.reduce((s, l) => s + l.amountPaise, 0);

  const revisions = day.revisions.map((r, i) => {
    const snap = parseSnapshot(r.snapshot);
    const prev = i > 0 ? parseSnapshot(day.revisions[i - 1].snapshot) : null;
    return { r, totals: snapshotTotals(snap), changes: diffSnapshots(prev, snap) };
  }).reverse();
  const editedAfterSubmit = day.revisions.some((r, i) =>
    r.action !== "CA_EDIT" && i > 0 && day.revisions.slice(0, i).some((p) => p.action === "SUBMIT"));

  return (
    <div className="space-y-4">
      <Link href={`/ca/merchants/${id}`} className="text-sm text-blue-700 hover:underline">&larr; {day.merchant.businessName}</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-lg font-semibold">
          {day.merchant.businessName}: {formatDate(date)} <StatusBadge submitted={day.submitted} locked={day.locked} />
        </h1>
        {day.locked && day.lockedBy && day.lockedAt && (
          <span className="text-xs text-gray-500">Locked by {day.lockedBy.name} on {fmtTime(day.lockedAt)}</span>
        )}
        <Link href={`/ca/merchants/${id}/day/${date}/edit`} className="btn btn-secondary">Edit invoices</Link>
        <form action={setDayLocked.bind(null, day.id, !day.locked)}>
          <button className="btn btn-secondary">{day.locked ? "Unlock day" : "Lock day"}</button>
        </form>
      </div>

      <p className="text-xs text-gray-500">
        Figures are as entered by the merchant, except invoices marked &ldquo;Changed by CA&rdquo;. CA corrections need a reason, which the merchant sees.
        Every change is recorded in the <Link href={`/ca/audit?merchant=${id}`} className="text-blue-700 hover:underline">edit log</Link>.
      </p>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Cash" value={formatPaise(cash)} sub={`${ranges.find((r) => r.mode === "CASH")!.count} invoice(s)`} />
        <Stat label="Bank (UPI / Card / Other)" value={formatPaise(bank)}
          sub={`${ranges.filter((r) => r.mode !== "CASH").reduce((s, r) => s + r.count, 0)} invoice(s)`} />
        <Stat label="Total sales" value={formatPaise(totalAmount)} sub={`${day.invoices.length} invoice(s)`} />
        <Stat label="GST (mapped items)" value={formatPaise(totalTax)} sub={unmapped ? `${unmapped} item(s) unmapped` : "All items mapped"} />
      </div>

      {unmapped > 0 && (
        <Banner>
          {unmapped} item{unmapped > 1 ? "s" : ""} on this day {unmapped > 1 ? "have" : "has"} no HSN yet.{" "}
          <Link href={`/ca/mapping?merchant=${id}`} className="font-medium underline">Map now</Link>
        </Banner>
      )}
      {mismatches > 0 && <Banner>The merchant&apos;s &ldquo;amount received&rdquo; differs from the invoices for {mismatches} payment mode(s). See the payment check below.</Banner>}
      {editedAfterSubmit && <Banner>The merchant changed this day after submitting it. See the history at the bottom.</Banner>}
      {unsplitPaise > 0 && (
        <p className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {formatPaise(unsplitPaise)} was entered before payment modes existed and isn&apos;t assigned to cash or bank.
        </p>
      )}

      <section className="card p-4">
        <h2 className="mb-2 text-sm font-medium">Remarks to merchant about this day</h2>
        <RemarkList remarks={remarks} viewer="ca" />
        <RemarkForm action={addRemark.bind(null, id, day.id)} placeholder="e.g. Invoice C-105 is missing from today's entries. Please add it." />
      </section>

      <section className="card overflow-x-auto">
        <div className="border-b border-gray-100 px-3 py-2 text-sm font-medium">Items</div>
        <table className="table">
          <thead>
            <tr>
              <th>Item</th><th>HSN</th><th className="text-right">Rate</th>
              {PAYMENT_MODES.map((m) => <th key={m.key} className="text-right">{m.label}</th>)}
              <th className="text-right">Total qty</th><th className="text-right">Amount (incl.)</th>
              <th className="text-right">Taxable value</th><th className="text-right">GST</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ line, split }) => {
              const modes = byItemMode.get(line.itemId);
              return (
                <tr key={line.id}>
                  <td>{line.item.name}</td>
                  <td className="whitespace-nowrap font-mono">
                    {line.item.hsnCode ?? <span className="badge bg-amber-100 font-sans text-amber-800">Unmapped</span>}
                    <Link href={`/ca/mapping?item=${line.itemId}`} className="ml-2 font-sans text-xs text-blue-700 hover:underline">
                      {line.item.hsnCode ? "Change" : "Map"}
                    </Link>
                  </td>
                  <td className="text-right">{line.item.gstRate !== null ? `${line.item.gstRate}%` : "—"}</td>
                  {PAYMENT_MODES.map((m) => {
                    const v = modes?.get(m.key);
                    return (
                      <td key={m.key} className="text-right text-sm">
                        {v ? <><div>{formatPaise(v.amount)}</div><div className="text-xs text-gray-500">{v.qty} {line.item.unit}</div></>
                          : !modes && !isUnsplit(line) && line[m.field] ? formatPaise(line[m.field]) : ""}
                      </td>
                    );
                  })}
                  <td className="text-right">{line.quantity} {line.item.unit}</td>
                  <td className="text-right">{formatPaise(line.amountPaise)}</td>
                  <td className="text-right">{split ? formatPaise(split.taxable) : "—"}</td>
                  <td className="text-right">{split ? formatPaise(split.tax) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="font-semibold">
            <tr>
              <td colSpan={3} className="text-right">Total</td>
              {checks.map((c) => <td key={c.mode} className="text-right">{formatPaise(c.itemsPaise)}</td>)}
              <td></td>
              <td className="text-right">{formatPaise(totalAmount)}</td>
              <td className="text-right">{formatPaise(totalTaxable)}</td>
              <td className="text-right">{formatPaise(totalTax)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      {day.invoices.length > 0 && (
        <section className="grid gap-4 lg:grid-cols-2">
          {[{ title: "Cash invoices", list: day.invoices.filter((i) => i.mode === "CASH") },
            { title: "Bank invoices (UPI / Card / Other)", list: day.invoices.filter((i) => i.mode !== "CASH") }].map((group) => (
            <div key={group.title} className="card">
              <div className="flex border-b border-gray-100 px-3 py-2 text-sm font-medium">
                <span className="mr-auto">{group.title} ({group.list.length})</span>
                <span>{formatPaise(group.list.reduce((s, i) => s + invoiceTotal(i), 0))}</span>
              </div>
              {group.list.length === 0 && <p className="px-3 py-4 text-sm text-gray-400">None</p>}
              <ul className="divide-y divide-gray-100">
                {group.list.map((inv) => (
                  <li key={inv.id} className="px-3 py-2 text-sm">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono font-semibold">{inv.invoiceNo}</span>
                      {inv.mode !== "CASH" && <span className="badge bg-blue-50 text-blue-800">{modeLabel(inv.mode)}</span>}
                      {inv.caEditedBy && <span className="badge bg-orange-100 text-orange-800">Changed by CA ({inv.caEditedBy})</span>}
                      <span className="ml-auto font-medium">{formatPaise(invoiceTotal(inv))}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {inv.lines.map((l) => `${l.item.name} × ${l.quantity} ${l.item.unit} (${formatPaise(l.amountPaise)})`).join(" · ")}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <section className="card overflow-x-auto">
        <div className="border-b border-gray-100 px-3 py-2 text-sm font-medium">Payment check</div>
        <table className="table">
          <thead>
            <tr>
              <th>Mode</th><th className="text-right">Invoices</th><th>Invoice no. range</th>
              <th className="text-right">Invoices total</th><th className="text-right">Amount received (merchant)</th><th>Check</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => {
              const r = ranges.find((x) => x.mode === c.mode)!;
              const old = day.payments.find((p) => p.mode === c.mode);
              const count = r.count || old?.invoiceCount || 0;
              const first = r.first ?? old?.invoiceFrom ?? null;
              const last = r.last ?? old?.invoiceTo ?? null;
              return (
                <tr key={c.mode}>
                  <td className="font-medium">{c.label}</td>
                  <td className="text-right">{count || "—"}</td>
                  <td className="font-mono text-sm">{first || last ? (first === last ? first : `${first ?? "?"} → ${last ?? "?"}`) : "—"}</td>
                  <td className="text-right">{formatPaise(c.itemsPaise)}</td>
                  <td className="text-right">{c.enteredPaise !== null ? formatPaise(c.enteredPaise) : <span className="text-gray-400">—</span>}</td>
                  <td className="text-sm"><CheckCell diffPaise={c.diffPaise} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card p-4">
        <h2 className="mb-2 text-sm font-medium">Invoice files</h2>
        <AttachmentList attachments={day.attachments} canDelete={false} />
      </section>

      <section className="card">
        <div className="border-b border-gray-100 px-3 py-2 text-sm font-medium">History of changes by merchant and CA ({revisions.length})</div>
        {revisions.length === 0 && <p className="px-3 py-4 text-sm text-gray-400">No saves recorded.</p>}
        <ul className="divide-y divide-gray-100">
          {revisions.map(({ r, totals, changes }) => (
            <li key={r.id} className="px-3 py-2 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-medium">{fmtTime(r.createdAt)}</span>
                <span className={`badge ${r.action === "SUBMIT" ? "bg-green-100 text-green-800" : r.action === "CA_EDIT" ? "bg-orange-100 text-orange-800" : "bg-gray-100 text-gray-600"}`}>
                  {r.action === "SUBMIT" ? "Submitted" : r.action === "CA_EDIT" ? "Changed by CA" : "Draft saved"}
                </span>
                <span className="text-gray-500">by {r.savedByName}</span>
                <span className="ml-auto text-xs text-gray-500">
                  {totals.count} invoice(s) · Cash {formatPaise(totals.cash)} · Bank {formatPaise(totals.bank)}
                </span>
              </div>
              <ul className="mt-1 list-disc pl-5 text-xs text-gray-600">
                {changes.map((c, i) => <li key={i} className={c.startsWith("Removed") ? "text-red-700" : ""}>{c}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-xs text-gray-500">{sub}</div>
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{children}</p>;
}
