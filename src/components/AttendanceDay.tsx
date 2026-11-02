"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ATTENDANCE } from "@/lib/payroll";

export type DayRow = { id: string; name: string; designation: string | null; mark: string | null; monthLeaves: number };
type Result = { ok: boolean; message: string };

const leaveWeight = (s: string | null) => (s === "A" ? 1 : s === "H" ? 0.5 : 0);
const SELECTED: Record<string, string> = {
  P: "bg-green-600 text-white border-green-600",
  A: "bg-red-600 text-white border-red-600",
  H: "bg-amber-500 text-white border-amber-500",
  L: "bg-sky-600 text-white border-sky-600",
  O: "bg-gray-600 text-white border-gray-600",
};

/**
 * One day's attendance as a list (the way staff apps on phones do it): each
 * employee gets big buttons; tapping the selected one again clears the mark.
 */
export default function AttendanceDay({
  date, editable, rows, month, setMark, markAllPresent,
}: {
  date: string;
  editable: boolean;
  rows: DayRow[];
  month: string;
  setMark: (employeeId: string, date: string, status: string | null) => Promise<Result>;
  markAllPresent: (date: string) => Promise<Result>;
}) {
  const [marks, setMarks] = useState<Record<string, string | null>>(() => Object.fromEntries(rows.map((r) => [r.id, r.mark])));
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  const count = (k: string | null) => rows.filter((r) => (marks[r.id] ?? null) === k).length;

  function tap(row: DayRow, status: string) {
    const prev = marks[row.id] ?? null;
    const next = prev === status ? null : status;
    setMarks((m) => ({ ...m, [row.id]: next }));
    setMessage(null);
    startTransition(async () => {
      const res = await setMark(row.id, date, next);
      if (!res.ok) { setMarks((m) => ({ ...m, [row.id]: prev })); setMessage(res); }
    });
  }

  function everyonePresent() {
    startTransition(async () => {
      const res = await markAllPresent(date);
      setMessage(res);
      if (res.ok) setMarks((m) => Object.fromEntries(rows.map((r) => [r.id, m[r.id] ?? "P"])));
    });
  }

  if (rows.length === 0) {
    return (
      <div className="card p-6 text-center text-sm text-gray-500">
        No employees on this date. <Link href="/merchant/employees" className="text-blue-700 hover:underline">Add employees</Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2 text-center">
        <Count label="Present" n={count("P")} className="text-green-700" />
        <Count label="Absent" n={count("A")} className="text-red-700" />
        <Count label="Leave / ½ / Off" n={count("L") + count("H") + count("O")} className="text-gray-700" />
        <Count label="Not marked" n={count(null)} className={count(null) ? "text-amber-700" : "text-gray-400"} />
      </div>

      {editable && count(null) > 0 && (
        <button type="button" className="btn btn-primary w-full py-3 text-base" disabled={pending} onClick={everyonePresent}>
          ✓ Mark everyone not yet marked as Present
        </button>
      )}
      {!editable && <p className="text-center text-sm text-gray-500">Future dates can&apos;t be marked yet.</p>}
      {message && <p className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.message}</p>}

      <ul className="space-y-2">
        {rows.map((r) => {
          const mark = marks[r.id] ?? null;
          const leaves = r.monthLeaves - leaveWeight(r.mark) + leaveWeight(mark);
          return (
            <li key={r.id} className="card p-3">
              <div className="mb-2 flex items-baseline gap-2">
                <Link href={`/merchant/attendance/${r.id}?month=${month}`} className="font-medium text-gray-900 hover:underline">{r.name}</Link>
                {r.designation && <span className="text-xs text-gray-500">{r.designation}</span>}
                <span className="ml-auto text-xs text-gray-500">Leaves this month: <b>{leaves}</b></span>
              </div>
              <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={`${r.name} attendance`}>
                {ATTENDANCE.map((a) => (
                  <button key={a.key} type="button" role="radio" aria-checked={mark === a.key} disabled={!editable}
                    aria-label={`${r.name}: ${a.label}`}
                    className={`rounded-lg border py-2.5 text-sm font-semibold transition disabled:opacity-50 ${mark === a.key ? SELECTED[a.key] : "border-gray-300 bg-white text-gray-700 active:bg-gray-100"}`}
                    onClick={() => tap(r, a.key)}>
                    {a.short}
                    <span className="block text-[10px] font-normal opacity-80">{a.key === "O" ? "Week off" : a.label}</span>
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Count({ label, n, className }: { label: string; n: number; className: string }) {
  return (
    <div className="card px-2 py-2">
      <div className={`text-xl font-semibold ${className}`}>{n}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  );
}
