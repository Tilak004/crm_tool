import "server-only";
import { db } from "./db";
import { todayIST } from "./gst";
import { daysInMonth, isValidMonth, salaryForMonth, shiftMonth, summarizeMonth, type MonthSummary } from "./payroll";

export type SheetRow = {
  id: string; name: string; designation: string | null; joinDate: string; leftDate: string | null;
  marks: Record<string, string>;
  summary: MonthSummary | null; // null when no salary applies yet
};

/** Months offered in the picker: the current month and the 11 before it. */
export function recentMonths() {
  const current = todayIST().slice(0, 7);
  return Array.from({ length: 12 }, (_, i) => shiftMonth(current, -i));
}

export function pickMonth(requested: string | undefined) {
  const current = todayIST().slice(0, 7);
  return requested && isValidMonth(requested) && requested <= current ? requested : current;
}

/** Employees who worked at any point in the month, with their marks and salary summary. */
export async function loadSheet(merchantId: string, month: string): Promise<SheetRow[]> {
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const today = todayIST();
  const employees = await db.employee.findMany({
    where: { merchantId, joinDate: { lte: last }, OR: [{ leftDate: null }, { leftDate: { gte: first } }] },
    include: { salaries: true, attendance: { where: { date: { gte: first, lte: last } } } },
    orderBy: [{ name: "asc" }],
  });
  return employees.map((e) => {
    const marks = Object.fromEntries(e.attendance.map((a) => [a.date, a.status]));
    const monthly = salaryForMonth(e.salaries, month);
    return {
      id: e.id, name: e.name, designation: e.designation, joinDate: e.joinDate, leftDate: e.leftDate, marks,
      summary: monthly === null ? null : summarizeMonth({
        month, today, joinDate: e.joinDate, leftDate: e.leftDate, monthlyPaise: monthly, marks: new Map(Object.entries(marks)),
      }),
    };
  });
}
