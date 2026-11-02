import Link from "next/link";
import { formatDate } from "@/lib/gst";
import type { RemarkView } from "@/lib/remarks";

const fmt = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** CA remarks. The CA sees whether each was seen; the merchant sees which are new. */
export default function RemarkList({
  remarks, viewer, dayHref,
}: {
  remarks: (RemarkView & { isNew?: boolean })[];
  viewer: "ca" | "merchant";
  /** Link for a remark's sales date; omit to hide the date (e.g. on that day's own page). */
  dayHref?: (date: string) => string;
}) {
  if (remarks.length === 0) return <p className="text-sm text-gray-400">No remarks.</p>;
  return (
    <ul className="space-y-2">
      {remarks.map((r) => (
        <li key={r.id} className={`rounded-md border px-3 py-2 text-sm ${r.isNew ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white"}`}>
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-gray-500">
            {r.isNew && <span className="badge bg-amber-200 text-amber-900">New</span>}
            <span className="font-medium text-gray-700">{r.authorName}</span>
            <span>{fmt(r.createdAt)}</span>
            {dayHref && (r.saleDate
              ? <Link href={dayHref(r.saleDate)} className="text-blue-700 hover:underline">about {formatDate(r.saleDate)}</Link>
              : <span>general</span>)}
            {viewer === "ca" && (
              <span className="ml-auto">
                {r.seenAt ? <span className="text-green-700">✓ Seen by merchant {fmt(r.seenAt)}</span> : <span className="text-amber-700">Not seen yet</span>}
              </span>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap">{r.text}</p>
        </li>
      ))}
    </ul>
  );
}
