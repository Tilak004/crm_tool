import AuditTable from "@/components/AuditTable";
import { auditWhere, findAuditEntries } from "@/lib/audit-query";
import { requireMerchant } from "@/lib/auth";

// The merchant's own trail: their edits plus anything the CA did on their account.
export default async function MerchantActivity() {
  const { merchant } = await requireMerchant();
  const entries = await findAuditEntries(auditWhere({}, merchant.id), 300);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">My activity</h1>
          <p className="text-sm text-gray-500">Everything recorded for your account: your saves and submissions, and any action your CA took.</p>
        </div>
        <a href="/api/audit/export" className="btn btn-secondary">Download CSV</a>
      </div>
      <AuditTable entries={entries} showMerchant={false} dayHref={(_m, d) => `/merchant/day/${d}`} />
    </div>
  );
}
