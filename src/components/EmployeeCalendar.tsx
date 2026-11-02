"use client";

import { useState, useTransition } from "react";
import { formatPaise } from "@/lib/gst";
import { ATTENDANCE, isEmployedOn, monthDates, summarizeMonth, type AttendanceStatus } from "@/lib/payroll";

type Result = { ok: boolean; message: string };
const STYLE = Object.fromEntries(ATTENDANCE.map((a) => [a.key, a]));

/** One employee's month as a calendar with the salary breakdown. Editable when setMark is given. */
export default function EmployeeCalendar({
  employee, month, today, monthlyPaise, initialMarks, setMark,
}: {
  employee: { id: string; name: string; joinDate: string; leftDate: string | null };
  month: string;
  today: string;
  monthlyPaise: number | null;
  initialMarks: Record<string, string>;
  setMark?: (employeeId: string, date: string, status: string | null) => Promise<Result>;
}) {
  const [marks, setMarks] = useState(initialMarks);
  const [brush, setBrush] = useState<AttendanceStatus>("P");
  const [message, setMessage] = useState<Result | null>(null);
  const [, startTransition] = useTransition();

  const dates = monthDates(month);
  const firstWeekday = new Date(dates[0] + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  const s = monthlyPaise === null ? null : summarizeMonth({
    month, today, joinDate: employee.joinDate, leftDate: employee.leftDate, monthlyPaise, marks: new Map(Object.entries(marks)),
  });

  function tap(date: string) {
    if (!setMark) return;
    const prev = marks[date] ?? null;
    const next = prev === brush ? null : brush;
    const apply = (v: string | null) => setMarks((m) => {
      const c = { ...m };
      if (v === null) delete c[date]; else c[date] = v;
      return c;
    });
    apply(next);
    setMessage(null);
    startTransition(async () => {
      const res = await setMark(employee.id, date, next);
      if (!res.ok) { apply(prev); setMessage(res); }
    });
  }

  return (
    <div className="space-y-4">
      {setMark && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Mark to apply">
          {ATTENDANCE.map((a) => (
            <button key={a.key} type="button" role="radio" aria-checked={brush === a.key}
              className={`rounded-md border px-3 py-1.5 text-sm ${a.style} ${brush === a.key ? "border-gray-900 ring-2 ring-gray-900" : "border-transparent"}`}
              onClick={() => setBrush(a.key)}>
              {a.short} · {a.label}
            </button>
          ))}
          <span className="self-center text-xs text-gray-500">Tap a day to apply; tap again to clear.</span>
        </div>
      )}
      {message && <p className="text-sm text-red-600">{message.message}</p>}

      <div className="card p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-500">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className={d === "Sun" ? "text-red-500" : ""}>{d}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: firstWeekday }, (_, i) => <div key={`pad${i}`} />)}
          {dates.map((d) => {
            const employed = isEmployedOn(employee, d);
            const future = d > today;
            const a = marks[d] ? STYLE[marks[d]] : null;
            const clickable = !!setMark && employed && !future;
            return (
              <button key={d} type="button" disabled={!clickable} onClick={() => tap(d)}
                aria-label={`${d}: ${a ? a.label : employed ? (future ? "upcoming" : "not marked") : "not employed"}`}
                className={`flex aspect-square flex-col items-center justify-center rounded-lg border text-sm
                  ${d === today ? "border-blue-500" : "border-gray-100"}
                  ${!employed ? "bg-gray-50 text-gray-300" : a ? a.style : future ? "text-gray-300" : "border-dashed border-gray-300 text-gray-700"}
                  ${clickable ? "active:scale-95" : "cursor-default"}`}>
                <span className="text-xs">{Number(d.slice(8))}</span>
                <span className="text-xs font-bold">{a ? a.short : ""}</span>
              </button>
            );
          })}
        </div>
      </div>

      {s ? (
        <div className="card divide-y divide-gray-100 text-sm">
          <Line label="Monthly salary" value={formatPaise(s.monthlyPaise)} />
          <Line label={`Per day (÷ ${dates.length} days)`} value={formatPaise(s.perDayPaise)} />
          <Line label="Present · Paid leave · Off" value={`${s.counts.P} · ${s.counts.L} · ${s.counts.O}`} />
          <Line label="Absent · Half days" value={`${s.counts.A} · ${s.counts.H}`} red={s.counts.A + s.counts.H > 0} />
          {s.unmarked > 0 && <Line label="Not marked yet" value={String(s.unmarked)} amber />}
          <Line label={`Deduction (${s.unpaidLeaveDays} leave days)`} value={`− ${formatPaise(s.deductionPaise)}`} red={s.deductionPaise > 0} />
          <Line label={month === today.slice(0, 7) ? "Payable (so far, if the rest are present)" : "Payable"} value={formatPaise(s.payablePaise)} bold />
        </div>
      ) : (
        <p className="card p-4 text-sm text-amber-700">No salary set for this month.</p>
      )}
    </div>
  );
}

function Line({ label, value, red, amber, bold }: { label: string; value: string; red?: boolean; amber?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-gray-600">{label}</span>
      <span className={`${red ? "text-red-700" : amber ? "text-amber-700" : ""} ${bold ? "text-base font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
