import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import BusinessBadges from "@/components/BusinessBadges";
import BusinessFields from "@/components/BusinessFields";
import Disclosure from "@/components/Disclosure";
import { parseBusinessTypes } from "@/lib/business";
import StatusBadge from "@/components/StatusBadge";
import { requireCA } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatPaise } from "@/lib/gst";
import { reconcile } from "@/lib/payments";
import RemarkForm from "@/components/RemarkForm";
import RemarkList from "@/components/RemarkList";
import { remarksForMerchant } from "@/lib/remarks";
import { addRemark, setDayLocked, updateMerchant } from "../../actions";

export default async function MerchantDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCA();
  const { id } = await params;
  const merchant = await db.merchant.findUnique({
    where: { id },
    include: {
      users: { where: { role: "MERCHANT" }, select: { name: true, username: true } },
      saleDays: {
        orderBy: { date: "desc" },
        take: 90,
        include: {
          lines: {
            select: {
              amountPaise: true, cashPaise: true, upiPaise: true, cardPaise: true, otherPaise: true,
              item: { select: { hsnCode: true } },
            },
          },
          payments: { select: { mode: true, amountPaise: true, invoiceCount: true } },
          _count: { select: { attachments: true, invoices: true } },
        },
      },
    },
  });
  if (!merchant) notFound();

  const [itemCount, unmappedCount, remarks] = await Promise.all([
    db.item.count({ where: { merchantId: id } }),
    db.item.count({ where: { merchantId: id, hsnCode: null } }),
    remarksForMerchant(id),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/ca" className="text-sm text-blue-700 hover:underline">&larr; Dashboard</Link>
      <div className="card flex flex-wrap gap-x-10 gap-y-3 p-4">
        <div>
          <h1 className="text-lg font-semibold">{merchant.businessName}</h1>
          {!merchant.active && <span className="badge bg-red-100 text-red-700">Inactive</span>}
        </div>
        <Info label="GSTIN" value={merchant.gstin ?? <span className="text-amber-700">Not added</span>} />
        <Info label="Business type / GST registration" value={<BusinessBadges businessTypes={merchant.businessTypes} gstRegType={merchant.gstRegType} />} />
        <Info label="Phone" value={merchant.phone ?? "—"} />
        <Info label="Login" value={merchant.users.map((u) => `${u.name} (${u.username})`).join(", ") || "—"} />
        <Info
          label="Items"
          value={
            <Link href={`/ca/mapping?merchant=${id}&show=all`} className="text-blue-700 hover:underline">
              {itemCount} total, {unmappedCount} unmapped
            </Link>
          }
        />
      </div>

      {user.role === "ADMIN" && (
        <Disclosure id="edit" className="card p-4" summary="Edit details"
          defaultOpen={!merchant.gstin || parseBusinessTypes(merchant.businessTypes).length === 0}>
          <ActionForm
            action={updateMerchant.bind(null, merchant.id)}
            submitLabel="Save details"
            resetOnSuccess={false}
            className="mt-4 space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="businessName">Business name *</label>
                <input className="input" id="businessName" name="businessName" defaultValue={merchant.businessName} required />
              </div>
              <div>
                <label className="label" htmlFor="gstin">GSTIN</label>
                <input className="input font-mono uppercase" id="gstin" name="gstin" defaultValue={merchant.gstin ?? ""}
                  maxLength={15} placeholder="15-character GSTIN" />
              </div>
              <div>
                <label className="label" htmlFor="phone">Phone</label>
                <input className="input" id="phone" name="phone" defaultValue={merchant.phone ?? ""} />
              </div>
              <BusinessFields defaultTypes={parseBusinessTypes(merchant.businessTypes)} defaultRegType={merchant.gstRegType ?? ""} />
            </div>
          </ActionForm>
        </Disclosure>
      )}

      <section className="card p-4">
        <div className="mb-2 flex items-baseline gap-3">
          <h2 className="mr-auto text-sm font-medium">Remarks to merchant</h2>
          <Link href={`/ca/merchants/${id}/attendance`} className="text-xs text-blue-700 hover:underline">Attendance &amp; salary</Link>
          <Link href={`/ca/audit?merchant=${id}`} className="text-xs text-blue-700 hover:underline">Edit log for this merchant</Link>
        </div>
        <RemarkList remarks={remarks} viewer="ca" dayHref={(d) => `/ca/merchants/${id}/day/${d}`} />
        <RemarkForm action={addRemark.bind(null, id, null)} placeholder="A general note to this merchant (for a specific day, open that day and add it there)." />
      </section>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th><th className="text-right">Items</th><th className="text-right">Unmapped</th>
              <th className="text-right">Cash</th><th className="text-right">Bank</th>
              <th className="text-right">Sales (incl. GST)</th><th className="text-right">Invoices</th>
              <th>Payments check</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {merchant.saleDays.length === 0 && (
              <tr><td colSpan={10} className="py-8 text-center text-gray-500">No sales entered yet.</td></tr>
            )}
            {merchant.saleDays.map((d) => {
              const unmapped = d.lines.filter((l) => !l.item.hsnCode).length;
              const { checks, mismatches } = reconcile(d.lines, d.payments);
              const cash = checks.find((c) => c.mode === "CASH")!.itemsPaise;
              const bank = checks.filter((c) => c.mode !== "CASH").reduce((s, c) => s + c.itemsPaise, 0);
              // Older days had the count typed into the payment summary instead of individual invoices.
              const invoices = d._count.invoices || d.payments.reduce((s, p) => s + (p.invoiceCount ?? 0), 0);
              return (
                <tr key={d.id}>
                  <td>
                    <Link href={`/ca/merchants/${id}/day/${d.date}`} className="text-blue-700 hover:underline">
                      {formatDate(d.date)}
                    </Link>
                  </td>
                  <td className="text-right">{d.lines.length}</td>
                  <td className="text-right">
                    {unmapped > 0 ? <span className="badge bg-amber-100 text-amber-800">{unmapped}</span> : <span className="text-gray-400">0</span>}
                  </td>
                  <td className="text-right">{formatPaise(cash)}</td>
                  <td className="text-right">{formatPaise(bank)}</td>
                  <td className="text-right font-medium">{formatPaise(d.lines.reduce((s, l) => s + l.amountPaise, 0))}</td>
                  <td className="text-right">
                    {invoices || "—"}
                    {d._count.attachments > 0 && <span className="ml-1 text-xs text-gray-500" title="Invoice files">📎{d._count.attachments}</span>}
                  </td>
                  <td>
                    {mismatches > 0
                      ? <span className="badge bg-amber-100 text-amber-800">⚠ {mismatches} mismatch</span>
                      : d.payments.some((p) => p.amountPaise !== null)
                        ? <span className="text-xs text-green-700">✓ OK</span>
                        : <span className="text-xs text-gray-400">Not entered</span>}
                  </td>
                  <td><StatusBadge submitted={d.submitted} locked={d.locked} /></td>
                  <td className="text-right">
                    <form action={setDayLocked.bind(null, d.id, !d.locked)}>
                      <button className="btn btn-secondary py-1 text-xs">{d.locked ? "Unlock" : "Lock"}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
