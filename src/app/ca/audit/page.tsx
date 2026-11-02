import AuditTable from "@/components/AuditTable";
import ActionForm from "@/components/ActionForm";
import { lastFullCheck, verifyAuditChain } from "@/lib/audit";
import { auditWhere, findAuditEntries, type AuditFilters } from "@/lib/audit-query";
import { requireCA } from "@/lib/auth";
import { runFullAuditCheck } from "../actions";
import { db } from "@/lib/db";

const LIMIT = 300;

export default async function AuditPage({ searchParams }: { searchParams: Promise<AuditFilters> }) {
  const user = await requireCA();
  const f = await searchParams;
  const where = auditWhere(f);

  const [entries, total, merchants, { quick: integrity, full }, latest] = await Promise.all([
    findAuditEntries(where, LIMIT),
    db.auditLog.count({ where }),
    db.merchant.findMany({ orderBy: { businessName: "asc" }, select: { id: true, businessName: true } }),
    verifyAuditChain().then(async (quick) => ({ quick, full: await lastFullCheck() })),
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
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          <p>
            ✓ Integrity check passed: all {integrity.count} entries are intact and in sequence.
            {latest && <> Latest entry #{latest.seq}, fingerprint <code className="font-mono text-xs">{latest.hash.slice(0, 16)}…</code></>}
          </p>
          <FullCheckLine full={full} />
          {user.role === "ADMIN" && (
            <ActionForm action={runFullAuditCheck} submitLabel="Run full check now" className="mt-2 flex flex-wrap items-center gap-3 [&_button]:py-1 [&_button]:text-xs">
              <span className="text-xs text-green-800">Re-reads every entry from the first one.</span>
            </ActionForm>
          )}
        </div>
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

function FullCheckLine({ full }: { full: Awaited<ReturnType<typeof lastFullCheck>> }) {
  const when = full?.checkedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  if (!full) return <p className="mt-1 text-xs text-green-800">New entries are checked each time this page opens; a full re-check runs every night.</p>;
  if (!full.ok) {
    return <p className="mt-1 text-xs font-medium text-red-700">✗ Last full check ({when}) FAILED at entry #{full.brokenAtSeq}: {full.reason}.</p>;
  }
  return <p className="mt-1 text-xs text-green-800">New entries are checked each time this page opens. Last full check of all {full.count} entries: {when}, passed.</p>;
}
