import Link from "next/link";
import type { AuditLog } from "@prisma/client";
import { AUDIT_ACTIONS, type AuditAction } from "@/lib/audit";
import { auditChanges } from "@/lib/audit-query";
import { formatDate } from "@/lib/gst";

const ROLE_BADGE: Record<string, string> = {
  MERCHANT: "bg-purple-100 text-purple-800",
  ADMIN: "bg-blue-100 text-blue-800",
  STAFF: "bg-sky-100 text-sky-800",
};
const ROLE_LABEL: Record<string, string> = { MERCHANT: "Merchant", ADMIN: "CA admin", STAFF: "CA staff" };

/** Read-only table of audit entries, newest first. `dayHref` links a sales date to its day page. */
export default function AuditTable({
  entries, showMerchant, dayHref,
}: {
  entries: AuditLog[];
  showMerchant: boolean;
  dayHref?: (merchantId: string, date: string) => string;
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th className="w-12">#</th><th className="w-40">When</th><th>Who</th>
            {showMerchant && <th>Merchant</th>}
            <th>Sales date</th><th>Action</th><th>Details</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && (
            <tr><td colSpan={showMerchant ? 7 : 6} className="py-8 text-center text-gray-500">No entries.</td></tr>
          )}
          {entries.map((e) => {
            const changes = auditChanges(e.details);
            const removed = changes.some((c) => c.startsWith("Removed"));
            return (
              <tr key={e.seq} className="align-top">
                <td className="text-xs text-gray-400">{e.seq}</td>
                <td className="whitespace-nowrap text-sm">
                  {e.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </td>
                <td className="whitespace-nowrap text-sm">
                  {e.actorName}{" "}
                  <span className={`badge ${ROLE_BADGE[e.actorRole] ?? "bg-gray-100 text-gray-700"}`}>{ROLE_LABEL[e.actorRole] ?? e.actorRole}</span>
                </td>
                {showMerchant && <td className="text-sm">{e.merchantName ?? "—"}</td>}
                <td className="whitespace-nowrap text-sm">
                  {e.saleDate
                    ? dayHref && e.merchantId
                      ? <Link href={dayHref(e.merchantId, e.saleDate)} className="text-blue-700 hover:underline">{formatDate(e.saleDate)}</Link>
                      : formatDate(e.saleDate)
                    : "—"}
                </td>
                <td className="whitespace-nowrap text-sm font-medium">
                  {AUDIT_ACTIONS[e.action as AuditAction] ?? e.action}
                  {removed && <span className="badge ml-1 bg-red-100 text-red-700">removal</span>}
                </td>
                <td className="text-sm">
                  <div>{e.summary}</div>
                  {changes.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-xs text-gray-600">
                      {changes.map((c, i) => <li key={i} className={c.startsWith("Removed") ? "text-red-700" : ""}>{c}</li>)}
                    </ul>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
