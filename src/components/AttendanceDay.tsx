"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
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

// The count tiles double as filters.
const FILTERS = [
  { key: "all", label: "All", test: () => true, tone: "text-gray-900" },
  { key: "P", label: "Present", test: (m: string | null) => m === "P", tone: "text-green-700" },
  { key: "A", label: "Absent", test: (m: string | null) => m === "A", tone: "text-red-700" },
  { key: "other", label: "Leave / ½ / Off", test: (m: string | null) => m === "L" || m === "H" || m === "O", tone: "text-gray-700" },
  { key: "none", label: "Not marked", test: (m: string | null) => m === null, tone: "text-amber-700" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

/**
 * One day's attendance as a compact list: one line per employee with the five
 * marks; tapping the selected mark again clears it. For many employees: search,
 * filter by mark, and tick several people to mark them together.
 */
export default function AttendanceDay({
  date, editable, rows, month, setMark, setMarkMany, markAllPresent,
}: {
  date: string;
  editable: boolean;
  rows: DayRow[];
  month: string;
  setMark: (employeeId: string, date: string, status: string | null) => Promise<Result>;
  setMarkMany: (employeeIds: string[], date: string, status: string | null) => Promise<Result>;
  markAllPresent: (date: string) => Promise<Result>;
}) {
  const [marks, setMarks] = useState<Record<string, string | null>>(() => Object.fromEntries(rows.map((r) => [r.id, r.mark])));
  const [message, setMessage] = useState<Result | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const markOf = (id: string) => marks[id] ?? null;
  const count = (key: FilterKey) => rows.filter((r) => FILTERS.find((f) => f.key === key)!.test(markOf(r.id))).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = FILTERS.find((f) => f.key === filter)!.test;
    return rows.filter((r) =>
      test(marks[r.id] ?? null) &&
      (!q || r.name.toLowerCase().includes(q) || (r.designation ?? "").toLowerCase().includes(q)));
  }, [rows, marks, query, filter]);

  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(r.id));

  function tap(row: DayRow, status: string) {
    const prev = markOf(row.id);
    const next = prev === status ? null : status;
    setMarks((m) => ({ ...m, [row.id]: next }));
    setMessage(null);
    startTransition(async () => {
      const res = await setMark(row.id, date, next);
      if (!res.ok) { setMarks((m) => ({ ...m, [row.id]: prev })); setMessage(res); }
    });
  }

  function markSelected(status: string | null) {
    const ids = [...selected];
    const before = marks;
    setMarks((m) => ({ ...m, ...Object.fromEntries(ids.map((id) => [id, status])) }));
    setSelected(new Set());
    startTransition(async () => {
      const res = await setMarkMany(ids, date, status);
      setMessage(res);
      if (!res.ok) setMarks(before);
    });
  }

  function everyonePresent() {
    startTransition(async () => {
      const res = await markAllPresent(date);
      setMessage(res);
      if (res.ok) setMarks((m) => Object.fromEntries(rows.map((r) => [r.id, m[r.id] ?? "P"])));
    });
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllShown() {
    setSelected((s) => {
      const next = new Set(s);
      for (const r of shown) {
        if (allShownSelected) next.delete(r.id); else next.add(r.id);
      }
      return next;
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
      <div className="grid grid-cols-5 gap-1.5 text-center" role="tablist" aria-label="Filter by mark">
        {FILTERS.map((f) => {
          const n = count(f.key);
          const active = filter === f.key;
          return (
            <button key={f.key} type="button" role="tab" aria-selected={active} onClick={() => setFilter(f.key)}
              className={`rounded-lg border px-1 py-2 transition ${active ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
              <div className={`text-lg font-semibold ${f.key === "none" && n === 0 ? "text-gray-400" : f.tone}`}>{n}</div>
              <div className="text-[11px] leading-tight text-gray-500">{f.label}</div>
            </button>
          );
        })}
      </div>

      {editable && count("none") > 0 && (
        <button type="button" className="btn btn-primary w-full py-3 text-base" disabled={pending} onClick={everyonePresent}>
          ✓ Mark everyone not yet marked as Present
        </button>
      )}
      {!editable && <p className="text-center text-sm text-gray-500">Future dates can&apos;t be marked yet.</p>}
      {message && <p className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.message}</p>}

      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2">
          {editable && (
            <input type="checkbox" className="h-5 w-5 shrink-0" checked={allShownSelected} onChange={toggleAllShown}
              aria-label="Select everyone shown" title="Select everyone shown" />
          )}
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${rows.length} employees`}
            className="input py-1.5" aria-label="Search employees" autoComplete="off" />
        </div>
        <p className="border-b border-gray-100 px-3 py-1.5 text-[11px] text-gray-500">
          P Present · A Absent · ½ Half day · PL Paid leave · Off Week off / holiday. Tap a mark again to clear it.
        </p>

        {shown.length === 0 && <p className="px-3 py-6 text-center text-sm text-gray-500">No one matches.</p>}
        <ul className="divide-y divide-gray-100">
          {shown.map((r) => {
            const mark = markOf(r.id);
            const leaves = r.monthLeaves - leaveWeight(r.mark) + leaveWeight(mark);
            const isSelected = selected.has(r.id);
            return (
              <li key={r.id} className={`flex items-center gap-3 px-3 py-2 ${isSelected ? "bg-blue-50" : ""}`}>
                {editable && (
                  <input type="checkbox" className="h-5 w-5 shrink-0" checked={isSelected} onChange={() => toggle(r.id)}
                    aria-label={`Select ${r.name}`} />
                )}
                <div className="min-w-0 flex-1">
                  <Link href={`/merchant/attendance/${r.id}?month=${month}`} className="block truncate font-medium text-gray-900 hover:underline">{r.name}</Link>
                  <div className="truncate text-[11px] text-gray-500">
                    {r.designation ? `${r.designation} · ` : ""}<span title="Leaves this month">Leaves: <b>{leaves}</b></span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={`${r.name} attendance`}>
                  {ATTENDANCE.map((a) => (
                    <button key={a.key} type="button" role="radio" aria-checked={mark === a.key} disabled={!editable}
                      aria-label={`${r.name}: ${a.label}`} title={a.label}
                      className={`h-9 w-9 rounded-md border text-xs font-semibold transition disabled:opacity-50 sm:w-11 ${mark === a.key ? SELECTED[a.key] : "border-gray-300 bg-white text-gray-700 active:bg-gray-100"}`}
                      onClick={() => tap(r, a.key)}>
                      {a.short}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {editable && selected.size > 0 && (
        <div className="sticky bottom-16 z-20 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur sm:bottom-0 sm:mx-0 sm:rounded-lg sm:border">
          <div className="mb-2 flex items-center text-sm">
            <b>{selected.size} selected</b>
            <span className="ml-1 text-gray-500">: mark them all as</span>
            <button type="button" className="ml-auto text-blue-700 hover:underline" onClick={() => setSelected(new Set())}>Cancel</button>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {ATTENDANCE.map((a) => (
              <button key={a.key} type="button" disabled={pending} onClick={() => markSelected(a.key)}
                className={`rounded-md border py-2 text-xs font-semibold ${SELECTED[a.key]}`} title={a.label}>
                {a.short}
                <span className="block text-[10px] font-normal opacity-90">{a.key === "O" ? "Week off" : a.label}</span>
              </button>
            ))}
            <button type="button" disabled={pending} onClick={() => markSelected(null)}
              className="rounded-md border border-gray-300 bg-white py-2 text-xs font-semibold text-gray-700">
              ✕
              <span className="block text-[10px] font-normal">Clear</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
