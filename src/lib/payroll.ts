// Attendance marks and the monthly salary calculation. Shared by server and client code.
//
// Per-day pay = monthly salary ÷ days in that month.
// Absent costs one day's pay and a half day costs half; present, paid leave and
// weekly off / holiday are paid. Days before joining or after leaving are not paid.

export const ATTENDANCE = [
  { key: "P", label: "Present", short: "P", style: "bg-green-100 text-green-800" },
  { key: "A", label: "Absent", short: "A", style: "bg-red-100 text-red-800" },
  { key: "H", label: "Half day", short: "½", style: "bg-amber-100 text-amber-800" },
  { key: "L", label: "Paid leave", short: "PL", style: "bg-sky-100 text-sky-800" },
  { key: "O", label: "Weekly off / Holiday", short: "Off", style: "bg-gray-200 text-gray-700" },
] as const;

export type AttendanceStatus = (typeof ATTENDANCE)[number]["key"];
export const isAttendanceStatus = (v: unknown): v is AttendanceStatus =>
  typeof v === "string" && ATTENDANCE.some((a) => a.key === v);
export const attendanceLabel = (k: string | null) => ATTENDANCE.find((a) => a.key === k)?.label ?? "Not marked";

export const isValidMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

export function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** All dates of the month as YYYY-MM-DD. */
export function monthDates(month: string) {
  return Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The salary in force for a month: the latest entry whose effectiveMonth is not after it. */
export function salaryForMonth(salaries: { effectiveMonth: string; monthlyPaise: number }[], month: string) {
  const applicable = salaries.filter((s) => s.effectiveMonth <= month).sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth));
  return applicable[0]?.monthlyPaise ?? null;
}

export type MonthSummary = {
  counts: Record<AttendanceStatus, number>;
  /** Employed days up to today with no mark. */
  unmarked: number;
  employedDays: number;
  /** Absent + ½ × half days. */
  unpaidLeaveDays: number;
  monthlyPaise: number;
  perDayPaise: number;
  deductionPaise: number;
  payablePaise: number;
};

export function summarizeMonth(opts: {
  month: string;
  today: string;
  joinDate: string;
  leftDate: string | null;
  monthlyPaise: number;
  marks: Map<string, string>; // date -> status
}): MonthSummary {
  const { month, today, joinDate, leftDate, monthlyPaise, marks } = opts;
  const counts = { P: 0, A: 0, H: 0, L: 0, O: 0 } as Record<AttendanceStatus, number>;
  let unmarked = 0, employedDays = 0;
  for (const d of monthDates(month)) {
    if (d < joinDate || (leftDate && d > leftDate)) continue;
    employedDays++;
    const s = marks.get(d);
    if (s && isAttendanceStatus(s)) counts[s]++;
    else if (d <= today) unmarked++;
  }
  const perDay = monthlyPaise / daysInMonth(month);
  const unpaidLeaveDays = counts.A + counts.H / 2;
  return {
    counts, unmarked, employedDays, unpaidLeaveDays, monthlyPaise,
    perDayPaise: Math.round(perDay),
    deductionPaise: Math.round(perDay * unpaidLeaveDays),
    payablePaise: Math.round(perDay * (employedDays - unpaidLeaveDays)),
  };
}

export const isEmployedOn = (e: { joinDate: string; leftDate: string | null }, date: string) =>
  date >= e.joinDate && (!e.leftDate || date <= e.leftDate);
