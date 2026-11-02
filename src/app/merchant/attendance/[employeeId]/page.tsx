import Link from "next/link";
import { notFound } from "next/navigation";
import EmployeeCalendar from "@/components/EmployeeCalendar";
import MonthPicker from "@/components/MonthPicker";
import { pickMonth, recentMonths } from "@/lib/attendance-sheet";
import { requireMerchant } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/gst";
import { daysInMonth, monthLabel, salaryForMonth } from "@/lib/payroll";
import { saveAttendance } from "../../employees/actions";

export default async function EmployeeMonth({
  params, searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { merchant } = await requireMerchant();
  const { employeeId } = await params;
  const month = pickMonth((await searchParams).month);
  const first = `${month}-01`, last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const e = await db.employee.findUnique({
    where: { id: employeeId },
    include: { salaries: true, attendance: { where: { date: { gte: first, lte: last } } } },
  });
  if (!e || e.merchantId !== merchant.id) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/merchant/attendance" className="text-sm text-blue-700 hover:underline">&larr; Attendance</Link>
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">{e.name}</h1>
          <p className="text-sm text-gray-500">{e.designation ?? ""}{e.designation ? " · " : ""}{monthLabel(month)}</p>
        </div>
        <MonthPicker value={month} months={recentMonths()} />
      </div>
      <EmployeeCalendar key={month}
        employee={{ id: e.id, name: e.name, joinDate: e.joinDate, leftDate: e.leftDate }}
        month={month} today={todayIST()}
        monthlyPaise={salaryForMonth(e.salaries, month)}
        initialMarks={Object.fromEntries(e.attendance.map((a) => [a.date, a.status]))}
        saveMarks={saveAttendance}
      />
    </div>
  );
}
