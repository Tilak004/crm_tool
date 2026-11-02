import Link from "next/link";
import BusinessBadges, { BusinessTypeFilter, businessTypeWhere } from "@/components/BusinessBadges";
import { requireCA } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, todayIST } from "@/lib/gst";

export default async function CADashboard({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requireCA();
  const { type = "" } = await searchParams;
  const today = todayIST();
  const merchantWhere = { active: true, ...businessTypeWhere(type) };

  const [merchants, unmappedByMerchant, latestSubmitted, submittedToday] = await Promise.all([
    db.merchant.findMany({ where: merchantWhere, orderBy: { businessName: "asc" } }),
    db.item.groupBy({ by: ["merchantId"], where: { hsnCode: null }, _count: { _all: true } }),
    db.saleDay.groupBy({ by: ["merchantId"], where: { submitted: true }, _max: { date: true } }),
    db.saleDay.count({ where: { date: today, submitted: true, merchant: merchantWhere } }),
  ]);

  const unmapped = new Map(unmappedByMerchant.map((u) => [u.merchantId, u._count._all]));
  const lastDate = new Map(latestSubmitted.map((l) => [l.merchantId, l._max.date]));
  const totalUnmapped = merchants.reduce((s, m) => s + (unmapped.get(m.id) ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Active merchants" value={merchants.length} />
        <Stat label="Submitted today" value={`${submittedToday} / ${merchants.length}`} />
        <Stat label="Items awaiting HSN" value={totalUnmapped} href="/ca/mapping" highlight={totalUnmapped > 0} />
      </div>

      <BusinessTypeFilter value={type} />

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Merchant</th><th>Type</th><th>GSTIN</th><th>Last submitted</th><th className="text-right">Unmapped items</th><th></th></tr>
          </thead>
          <tbody>
            {merchants.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-gray-500">{type ? "No merchants of this type." : "No merchants yet."}</td></tr>
            )}
            {merchants.map((m) => {
              const count = unmapped.get(m.id) ?? 0;
              const last = lastDate.get(m.id);
              return (
                <tr key={m.id}>
                  <td className="font-medium">{m.businessName}</td>
                  <td><BusinessBadges businessTypes={m.businessTypes} gstRegType={m.gstRegType} /></td>
                  <td className="font-mono text-xs">{m.gstin ?? "—"}</td>
                  <td>
                    {last ? formatDate(last) : <span className="text-gray-400">Never</span>}
                    {last === today && <span className="badge ml-2 bg-green-100 text-green-800">Today</span>}
                  </td>
                  <td className="text-right">
                    {count > 0
                      ? <Link href={`/ca/mapping?merchant=${m.id}`} className="badge bg-amber-100 text-amber-800 hover:underline">{count}</Link>
                      : <span className="text-gray-400">0</span>}
                  </td>
                  <td className="text-right">
                    <Link href={`/ca/merchants/${m.id}`} className="text-blue-700 hover:underline">Open</Link>
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

function Stat({ label, value, href, highlight }: { label: string; value: React.ReactNode; href?: string; highlight?: boolean }) {
  const body = (
    <div className={`card p-4 ${highlight ? "border-amber-300 bg-amber-50" : ""}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
