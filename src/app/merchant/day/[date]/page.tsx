import Link from "next/link";
import { notFound } from "next/navigation";
import AttachmentList from "@/components/AttachmentList";
import RemarkList from "@/components/RemarkList";
import StatusBadge from "@/components/StatusBadge";
import { markRemarksSeen, remarksForDay } from "@/lib/remarks";
import { requireMerchant } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatPaise, isValidDate, todayIST } from "@/lib/gst";
import { PAYMENT_MODES, isPaymentMode } from "@/lib/payments";
import InvoiceUpload from "./InvoiceUpload";
import SalesEntryForm from "@/components/SalesEntryForm";
import { saveDay } from "../../actions";

export default async function MerchantDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { user, merchant } = await requireMerchant();
  const { date } = await params;
  if (!isValidDate(date) || date > todayIST()) notFound();

  const [day, items, lastInvoice] = await Promise.all([
    db.saleDay.findUnique({
      where: { merchantId_date: { merchantId: merchant.id, date } },
      include: {
        invoices: { orderBy: { position: "asc" }, include: { lines: { orderBy: { position: "asc" }, include: { item: true } } } },
        lines: { include: { item: true }, orderBy: { id: "asc" } },
        payments: true,
        attachments: { orderBy: { createdAt: "asc" } },
      },
    }),
    db.item.findMany({ where: { merchantId: merchant.id }, orderBy: { name: "asc" }, select: { name: true, unit: true } }),
    // Most recent invoice on an earlier day, to suggest the next number.
    db.invoice.findFirst({
      where: { saleDay: { merchantId: merchant.id, date: { lt: date } } },
      orderBy: [{ saleDay: { date: "desc" } }, { position: "desc" }],
      select: { invoiceNo: true, mode: true },
    }),
  ]);

  const initialInvoices = (day?.invoices ?? []).map((inv) => ({
    invoiceNo: inv.invoiceNo,
    mode: isPaymentMode(inv.mode) ? inv.mode : "CASH" as const,
    caEditedBy: inv.caEditedBy,
    rows: inv.lines.map((l) => ({
      name: l.item.name,
      quantity: String(l.quantity),
      unit: l.item.unit,
      amount: (l.amountPaise / 100).toFixed(2),
    })),
  }));

  const initialPayments = PAYMENT_MODES.map((m) => {
    const p = day?.payments.find((x) => x.mode === m.key);
    return { mode: m.key, amount: p?.amountPaise != null ? (p.amountPaise / 100).toFixed(2) : "" };
  });

  const remarks = day ? await markRemarksSeen(user, merchant, await remarksForDay(day.id)) : [];

  // Days saved before invoice-wise entry have item totals but no invoices.
  const oldFormatLines = day && day.invoices.length === 0 ? day.lines : [];
  const locked = !!day?.locked;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/merchant" className="text-sm text-blue-700 hover:underline">&larr; All days</Link>
        <h1 className="text-lg font-semibold">Sales on {formatDate(date)}</h1>
        {day && <StatusBadge submitted={day.submitted} locked={day.locked} />}
      </div>
      {remarks.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Remarks from your CA about this day</h2>
          <RemarkList remarks={remarks} viewer="merchant" />
        </section>
      )}
      {locked && (
        <p className="rounded-md bg-gray-100 px-4 py-3 text-sm text-gray-700">
          Your CA has locked this day. Contact them if something needs to change.
        </p>
      )}
      {oldFormatLines.length > 0 && (
        <details className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" open>
          <summary className="cursor-pointer font-medium">
            This day was entered before invoice-wise entry ({oldFormatLines.length} items).{" "}
            {!locked && "Please re-enter it as invoices below; saving replaces the old entry."}
          </summary>
          <ul className="mt-2 list-disc pl-5">
            {oldFormatLines.map((l) => (
              <li key={l.id}>{l.item.name}: {l.quantity} {l.item.unit}, {formatPaise(l.amountPaise)}</li>
            ))}
          </ul>
        </details>
      )}
      <SalesEntryForm
        save={saveDay.bind(null, date)}
        initialInvoices={initialInvoices}
        initialPayments={initialPayments}
        knownItems={items}
        lastInvoice={lastInvoice ? { invoiceNo: lastInvoice.invoiceNo, mode: lastInvoice.mode } : null}
        locked={locked}
      />

      <section className="card p-4">
        <h2 className="mb-1 font-semibold">Invoice files</h2>
        <p className="mb-3 text-xs text-gray-500">Photos or PDFs of the day&apos;s invoices. PDF, JPG, PNG or WEBP, up to 10 MB each.</p>
        <AttachmentList attachments={day?.attachments ?? []} canDelete={!locked} />
        {!locked && <InvoiceUpload date={date} />}
      </section>
    </div>
  );
}
