"use client";

import { useState, useTransition } from "react";
import { formatPaise } from "@/lib/gst";
import { ATTENDANCE, isEmployedOn, monthDates, summarizeMonth, type AttendanceStatus } from "@/lib/payroll";

type Row = {
  id: string; name: string; designation: string | null; joinDate: string; leftDate: string | null;
  marks: Record<string, string>;
  summary: { monthlyPaise: number } | null;
};
type Result = { ok: boolean; message: string };

const STYLE = Object.fromEntries(ATTENDANCE.map((a) => [a.key, a]));
const weekday = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "narrow", timeZone: "UTC" });
const isSunday = (d: string) => new Date(d + "T00:00:00Z").getUTCDay() === 0;

/**
 * Month attendance sheet. With setMark/markAllPresent it is editable (merchant):
 * pick a mark, then click cells; clicking a cell that already has that mark clears it.
 */
export default function AttendanceGrid({
  month, today, rows, setMark, markAllPresent,
}: {
  month: string;
  today: string;
  rows: Row[];
  setMark?: (employeeId: string, date: string, status: string | null) => Promise<Result>;
  markAllPresent?: (date: string) => Promise<Result>;
}) {
  const editable = !!setMark;
  const dates = monthDates(month);
  const [marks, setMarks] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, { ...r.marks }])));
  const [brush, setBrush] = useState<AttendanceStatus>("P");
  const [message, setMessage] = useState<Result | null>(null);
  const [bulkDate, setBulkDate] = useState(dates.includes(today) ? today : dates[dates.length - 1]);
  const [pending, startTransition] = useTransition();

  function click(row: Row, date: string) {
    const prev = marks[row.id]?.[date] ?? null;
    const next = prev === brush ? null : brush;
    const apply = (value: string | null) => setMarks((m) => {
      const copy = { ...m[row.id] };
      if (value === null) delete copy[date]; else copy[date] = value;
      return { ...m, [row.id]: copy };
    });
    apply(next); // optimistic
    setMessage(null);
    startTransition(async () => {
      const res = await setMark!(row.id, date, next);
      if (!res.ok) { apply(prev); setMessage(res); }
    });
  }

  function fillDay() {
    startTransition(async () => {
      const res = await markAllPresent!(bulkDate);
      setMessage(res);
      if (res.ok) setMarks((m) => Object.fromEntries(rows.map((r) => {
        const own = { ...m[r.id] };
        if (!own[bulkDate] && isEmployedOn(r, bulkDate)) own[bulkDate] = "P";
        return [r.id, own];
      })));
    });
  }

  const summaries = rows.map((r) => r.summary
    ? summarizeMonth({ month, today, joinDate: r.joinDate, leftDate: r.leftDate, monthlyPaise: r.summary.monthlyPaise, marks: new Map(Object.entries(marks[r.id] ?? {})) })
    : null);
  const totalPayable = summaries.reduce((s, x) => s + (x?.payablePaise ?? 0), 0);

  if (rows.length === 0) return <p className="card p-6 text-center text-sm text-gray-500">No employees worked in this month.</p>;

  return (
    <div className="space-y-3">
      {editable && (
        <div className="card flex flex-wrap items-center gap-3 p-3">
          <span className="text-sm font-medium">Mark:</span>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Attendance mark to apply">
            {ATTENDANCE.map((a) => (
              <button key={a.key} type="button" role="radio" aria-checked={brush === a.key}
                className={`rounded-md border px-2.5 py-1 text-sm ${brush === a.key ? "border-gray-900 ring-2 ring-gray-900" : "border-gray-200"} ${a.style}`}
                onClick={() => setBrush(a.key)}>
                {a.short} · {a.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-500">Click a day to apply; click again to clear.</span>
          <div className="ml-auto flex items-center gap-2">
            <select className="input w-36 py-1" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} aria-label="Date to mark everyone present">
              {dates.filter((d) => d <= today).map((d) => <option key={d} value={d}>{Number(d.slice(8))} {weekday(d)}</option>)}
            </select>
            <button type="button" className="btn btn-secondary py-1" disabled={pending} onClick={fillDay}>Mark everyone present</button>
          </div>
        </div>
      )}
      {message && <p className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.message}</p>}

      <div className="card overflow-x-auto">
        <table className="w-max border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-500">
              <th className="sticky left-0 z-10 min-w-40 border-b border-r border-gray-200 bg-gray-50 px-3 py-2 text-left font-semibold">Employee</th>
              {dates.map((d) => (
                <th key={d} className={`w-8 border-b border-gray-200 px-0.5 py-1 text-center font-medium ${isSunday(d) ? "text-red-500" : ""} ${d === today ? "bg-blue-50" : ""}`}>
                  <div>{Number(d.slice(8))}</div><div className="text-[10px]">{weekday(d)}</div>
                </th>
              ))}
              {["P", "A", "½", "PL", "Off", "Not marked", "Leaves", "Salary", "Per day", "Deduction", "Payable"].map((h) => (
                <th key={h} className="border-b border-l border-gray-200 px-2 py-2 text-right font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const s = summaries[i];
              return (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="sticky left-0 z-10 border-r border-gray-200 bg-white px-3 py-1.5">
                    <div className="font-medium text-gray-900">{r.name}</div>
                    {r.designation && <div className="text-[11px] text-gray-500">{r.designation}</div>}
                  </td>
                  {dates.map((d) => {
                    const employed = isEmployedOn(r, d);
                    const future = d > today;
                    const v = marks[r.id]?.[d];
                    const a = v ? STYLE[v] : null;
                    const title = `${r.name}, ${d}: ${a ? a.label : employed ? (future ? "upcoming" : "not marked") : "not employed"}`;
                    return (
                      <td key={d} className={`p-0.5 text-center ${d === today ? "bg-blue-50" : ""}`}>
                        {!employed ? <span className="text-gray-300" title={title}>·</span> : editable && !future ? (
                          <button type="button" title={title} aria-label={title} onClick={() => click(r, d)}
                            className={`h-7 w-7 rounded text-[11px] font-semibold ${a ? a.style : "border border-dashed border-gray-300 text-gray-300 hover:border-gray-500"}`}>
                            {a ? a.short : ""}
                          </button>
                        ) : (
                          <span title={title} className={`inline-flex h-7 w-7 items-center justify-center rounded text-[11px] font-semibold ${a ? a.style : future ? "" : "text-gray-300"}`}>
                            {a ? a.short : future ? "" : "–"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  {s ? (
                    <>
                      <Num v={s.counts.P} /><Num v={s.counts.A} red /><Num v={s.counts.H} /><Num v={s.counts.L} /><Num v={s.counts.O} />
                      <Num v={s.unmarked} amber />
                      <td className="border-l border-gray-100 px-2 text-right font-semibold">{s.unpaidLeaveDays}</td>
                      <Money p={s.monthlyPaise} /><Money p={s.perDayPaise} /><Money p={s.deductionPaise} red /><Money p={s.payablePaise} bold />
                    </>
                  ) : (
                    <td colSpan={11} className="border-l border-gray-100 px-2 text-amber-700">No salary set for this month</td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50">
              <td className="sticky left-0 z-10 border-r border-gray-200 bg-gray-50 px-3 py-2 font-semibold" colSpan={1}>Total payable</td>
              <td colSpan={dates.length + 10}></td>
              <td className="px-2 py-2 text-right font-bold">{formatPaise(totalPayable)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        Per day = monthly salary ÷ {dates.length} days. Absent deducts a day, half day half a day; present, paid leave and off days are paid.
        &ldquo;Leaves&rdquo; = absent + ½ × half days. Days not yet marked are paid until marked otherwise.
      </p>
    </div>
  );
}

function Num({ v, red, amber }: { v: number; red?: boolean; amber?: boolean }) {
  return <td className={`border-l border-gray-100 px-2 text-right ${v && red ? "text-red-700" : v && amber ? "text-amber-700" : ""}`}>{v || "–"}</td>;
}
function Money({ p, red, bold }: { p: number; red?: boolean; bold?: boolean }) {
  return <td className={`whitespace-nowrap border-l border-gray-100 px-2 text-right ${red && p ? "text-red-700" : ""} ${bold ? "font-semibold" : ""}`}>{formatPaise(p)}</td>;
}
