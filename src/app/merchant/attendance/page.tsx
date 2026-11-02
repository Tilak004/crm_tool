import Link from "next/link";
import AttendanceGrid from "@/components/AttendanceGrid";
import MonthPicker from "@/components/MonthPicker";
import { loadSheet, pickMonth, recentMonths } from "@/lib/attendance-sheet";
import { requireMerchant } from "@/lib/auth";
import { todayIST } from "@/lib/gst";
import { monthLabel } from "@/lib/payroll";
import { markAllPresent, setAttendance } from "../employees/actions";

export default async function MerchantAttendance({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { merchant } = await requireMerchant();
  const month = pickMonth((await searchParams).month);
  const rows = await loadSheet(merchant.id, month);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">Attendance: {monthLabel(month)}</h1>
          <p className="text-sm text-gray-500">
            Mark each employee&apos;s day. Salary for the month is worked out automatically.{" "}
            <Link href="/merchant/employees" className="text-blue-700 hover:underline">Manage employees</Link>
          </p>
        </div>
        <MonthPicker value={month} months={recentMonths()} />
      </div>
      {/* key: start from the server's marks again when the month changes */}
      <AttendanceGrid key={month} month={month} today={todayIST()} rows={rows} setMark={setAttendance} markAllPresent={markAllPresent} />
    </div>
  );
}
