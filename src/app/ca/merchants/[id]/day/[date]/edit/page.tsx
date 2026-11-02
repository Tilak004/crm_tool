import Link from "next/link";
import { notFound } from "next/navigation";
import SalesEntryForm from "@/components/SalesEntryForm";
import { requireCA } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, isValidDate } from "@/lib/gst";
import { PAYMENT_MODES, isPaymentMode } from "@/lib/payments";
import { caEditDay } from "../../../../../actions";

// CA correction of a merchant's invoices for one day. Every save needs a reason,
// which the merchant sees together with the list of changes.
export default async function CAEditDay({ params }: { params: Promise<{ id: string; date: string }> }) {
  await requireCA();
  const { id, date } = await params;
  if (!isValidDate(date)) notFound();

  const [day, items] = await Promise.all([
    db.saleDay.findUnique({
      where: { merchantId_date: { merchantId: id, date } },
      include: {
        merchant: true,
        invoices: { orderBy: { position: "asc" }, include: { lines: { orderBy: { position: "asc" }, include: { item: true } } } },
        payments: true,
      },
    }),
    db.item.findMany({ where: { merchantId: id }, orderBy: { name: "asc" }, select: { name: true, unit: true } }),
  ]);
  if (!day) notFound();

  const initialInvoices = day.invoices.map((inv) => ({
    invoiceNo: inv.invoiceNo,
    mode: isPaymentMode(inv.mode) ? inv.mode : "CASH" as const,
    caEditedBy: inv.caEditedBy,
    rows: inv.lines.map((l) => ({ name: l.item.name, quantity: String(l.quantity), unit: l.item.unit, amount: (l.amountPaise / 100).toFixed(2) })),
  }));
  const initialPayments = PAYMENT_MODES.map((m) => {
    const p = day.payments.find((x) => x.mode === m.key);
    return { mode: m.key, amount: p?.amountPaise != null ? (p.amountPaise / 100).toFixed(2) : "" };
  });
  const last = day.invoices[day.invoices.length - 1];

  return (
    <div className="space-y-4">
      <Link href={`/ca/merchants/${id}/day/${date}`} className="text-sm text-blue-700 hover:underline">&larr; Back to the day</Link>
      <div>
        <h1 className="text-lg font-semibold">Correct entries: {day.merchant.businessName}, {formatDate(date)}</h1>
        <p className="mt-1 rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          You are changing the merchant&apos;s figures. The merchant will see a &ldquo;Changed by CA&rdquo; mark on each invoice you add or
          change, plus your reason and the full list of changes. Everything is recorded in the edit log.
          {day.locked && " This day is locked for the merchant; you can still correct it."}
        </p>
      </div>
      {day.invoices.length === 0 && (
        <p className="text-sm text-gray-500">The merchant hasn&apos;t entered any invoices for this day. You can add them here.</p>
      )}
      <SalesEntryForm
        mode="ca"
        save={caEditDay.bind(null, id, date)}
        initialInvoices={initialInvoices}
        initialPayments={initialPayments}
        knownItems={items}
        lastInvoice={last ? { invoiceNo: last.invoiceNo, mode: last.mode } : null}
        locked={false}
      />
    </div>
  );
}
