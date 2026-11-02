import AuditTable from "@/components/AuditTable";
import { verifyAuditChain } from "@/lib/audit";
import { auditWhere, findAuditEntries, type AuditFilters } from "@/lib/audit-query";
import { requireCA } from "@/lib/auth";
import { db } from "@/lib/db";

const LIMIT = 300;

export default async function AuditPage({ searchParams }: { searchParams: Promise<AuditFilters> }) {
  await requireCA();
  const f = await searchParams;
  const where = auditWhere(f);

  const [entries, total, merchants, integrity, latest] = await Promise.all([
    findAuditEntries(where, LIMIT),
    db.auditLog.count({ where }),
    db.merchant.findMany({ orderBy: { businessName: "asc" }, select: { id: true, businessName: true } }),
    verifyAuditChain(),
    db.auditLog.findFirst({ orderBy: { seq: "desc" }, select: { seq: true, hash: true } }),
  ]);
  const exportQuery = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Edit log</h1>
        <p className="text-sm text-gray-500">
          Every change made by merchants and by CA users, in order. Entries can&apos;t be edited or deleted from the app.
          CA corrections to a merchant&apos;s figures appear here as &ldquo;Invoices changed by CA&rdquo; with the reason given.
        </p>
      </div>

      {integrity.ok ? (
        <p className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          ✓ Integrity check passed: all {integrity.count} entries are intact and in sequence.
          {latest && <> Latest entry #{latest.seq}, fingerprint <code className="font-mono text-xs">{latest.hash.slice(0, 16)}…</code></>}
        </p>
      ) : (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          ✗ Integrity check FAILED at entry #{integrity.brokenAtSeq}: {integrity.reason}. The log has been altered outside the app.
        </p>
      )}

      <form className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="merchant">Merchant</label>
          <select className="input" id="merchant" name="merchant" defaultValue={f.merchant ?? ""}>
            <option value="">All</option>
            {merchants.map((m) => <option key={m.id} value={m.id}>{m.businessName}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="who">Changes by</label>
          <select className="input" id="who" name="who" defaultValue={f.who ?? ""}>
            <option value="">Everyone</option>
            <option value="merchant">Merchants</option>
            <option value="ca">CA users</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="from">From</label>
          <input className="input" type="date" id="from" name="from" defaultValue={f.from ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <input className="input" type="date" id="to" name="to" defaultValue={f.to ?? ""} />
        </div>
        <button className="btn btn-secondary">Apply</button>
        <a href={`/api/audit/export${exportQuery ? `?${exportQuery}` : ""}`} className="btn btn-secondary ml-auto">Download CSV</a>
      </form>

      <AuditTable entries={entries} showMerchant dayHref={(m, d) => `/ca/merchants/${m}/day/${d}`} />
      {total > LIMIT && <p className="text-xs text-gray-500">Showing the latest {LIMIT} of {total} entries. Download the CSV for all of them.</p>}
    </div>
  );
}
