import Link from "next/link";
import { notFound } from "next/navigation";
import AttendanceGrid from "@/components/AttendanceGrid";
import MonthPicker from "@/components/MonthPicker";
import { loadSheet, pickMonth, recentMonths } from "@/lib/attendance-sheet";
import { requireCA } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/gst";
import { monthLabel } from "@/lib/payroll";

// Read-only view of a merchant's attendance and salary sheet.
export default async function CAAttendance({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> }) {
  await requireCA();
  const { id } = await params;
  const merchant = await db.merchant.findUnique({ where: { id }, select: { businessName: true } });
  if (!merchant) notFound();
  const month = pickMonth((await searchParams).month);
  const rows = await loadSheet(id, month);

  return (
    <div className="space-y-4">
      <Link href={`/ca/merchants/${id}`} className="text-sm text-blue-700 hover:underline">&larr; {merchant.businessName}</Link>
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">Attendance &amp; salary: {merchant.businessName}, {monthLabel(month)}</h1>
          <p className="text-sm text-gray-500">
            Read-only. Entered by the merchant; every change is in the{" "}
            <Link href={`/ca/audit?merchant=${id}`} className="text-blue-700 hover:underline">edit log</Link>.
          </p>
        </div>
        <MonthPicker value={month} months={recentMonths()} />
      </div>
      <AttendanceGrid key={month} month={month} today={todayIST()} rows={rows} />
    </div>
  );
}
