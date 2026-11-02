import Link from "next/link";
import AttendanceDay from "@/components/AttendanceDay";
import AttendanceGrid from "@/components/AttendanceGrid";
import MonthPicker from "@/components/MonthPicker";
import { loadSheet, pickMonth, recentMonths } from "@/lib/attendance-sheet";
import { requireMerchant } from "@/lib/auth";
import { formatDate, isValidDate, todayIST } from "@/lib/gst";
import { isEmployedOn, monthLabel } from "@/lib/payroll";
import { markAllPresent, setAttendance, setAttendanceMany } from "../employees/actions";

const shiftDay = (d: string, n: number) => {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

export default async function MerchantAttendance({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; month?: string }>;
}) {
  const { merchant } = await requireMerchant();
  const sp = await searchParams;
  const today = todayIST();
  const view = sp.view === "month" ? "month" : "day";

  const tabs = (
    <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm" role="tablist">
      {(["day", "month"] as const).map((v) => (
        <Link key={v} href={`/merchant/attendance?view=${v}`} role="tab" aria-selected={view === v}
          className={`rounded-md px-4 py-1.5 ${view === v ? "bg-blue-700 text-white" : "text-gray-700 hover:bg-gray-50"}`}>
          {v === "day" ? "Day" : "Month sheet"}
        </Link>
      ))}
    </div>
  );

  if (view === "month") {
    const month = pickMonth(sp.month);
    const rows = await loadSheet(merchant.id, month);
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mr-auto text-lg font-semibold">Attendance: {monthLabel(month)}</h1>
          {tabs}
          <MonthPicker value={month} months={recentMonths()} extra={{ view: "month" }} />
        </div>
        <AttendanceGrid key={month} month={month} today={today} rows={rows} setMark={setAttendance} markAllPresent={markAllPresent} />
      </div>
    );
  }

  const date = sp.date && isValidDate(sp.date) ? sp.date : today;
  const month = date.slice(0, 7);
  const sheet = await loadSheet(merchant.id, month);
  const rows = sheet.filter((r) => isEmployedOn(r, date)).map((r) => ({
    id: r.id, name: r.name, designation: r.designation,
    mark: r.marks[date] ?? null,
    monthLeaves: r.summary?.unpaidLeaveDays ?? 0,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-lg font-semibold">Attendance</h1>
        {tabs}
      </div>
      <div className="card flex items-center gap-2 p-2">
        <Link href={`/merchant/attendance?date=${shiftDay(date, -1)}`} className="btn btn-secondary px-4" aria-label="Previous day">‹</Link>
        <form className="flex flex-1 items-center justify-center gap-2">
          <input type="date" name="date" defaultValue={date} max={today} className="input w-auto text-center" aria-label="Date" key={date} />
          <button className="btn btn-secondary">Go</button>
        </form>
        {date < today
          ? <Link href={`/merchant/attendance?date=${shiftDay(date, 1)}`} className="btn btn-secondary px-4" aria-label="Next day">›</Link>
          : <span className="btn btn-secondary px-4 opacity-40" aria-hidden>›</span>}
      </div>
      <p className="text-center text-sm font-medium text-gray-700">
        {date === today ? "Today, " : ""}{formatDate(date)}
        {date !== today && <> · <Link href="/merchant/attendance" className="text-blue-700 hover:underline">Back to today</Link></>}
      </p>
      <AttendanceDay key={date} date={date} month={month} editable={date <= today} rows={rows}
        setMark={setAttendance} setMarkMany={setAttendanceMany} markAllPresent={markAllPresent} />
    </div>
  );
}
