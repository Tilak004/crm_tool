import Link from "next/link";
import { redirect } from "next/navigation";
import RemarkList from "@/components/RemarkList";
import StatusBadge from "@/components/StatusBadge";
import { markRemarksSeen, remarksForMerchant } from "@/lib/remarks";
import { requireMerchant } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatPaise, isValidDate, todayIST } from "@/lib/gst";
import DailyModeChart from "@/components/DailyModeChart";
import MonthPicker from "@/components/MonthPicker";
import PaymentMix from "@/components/PaymentMix";
import { monthAnalytics } from "@/lib/analytics";
import { pickMonth, recentMonths } from "@/lib/attendance-sheet";
import { isEmployedOn, monthLabel } from "@/lib/payroll";

type DayLines = { amountPaise: number; cashPaise: number; upiPaise: number; cardPaise: number; otherPaise: number }[];
const sums = (lines: DayLines) => ({
  total: lines.reduce((s, l) => s + l.amountPaise, 0),
  cash: lines.reduce((s, l) => s + l.cashPaise, 0),
  bank: lines.reduce((s, l) => s + l.upiPaise + l.cardPaise + l.otherPaise, 0),
});

export default async function MerchantHome({ searchParams }: { searchParams: Promise<{ date?: string; month?: string }> }) {
  const { user, merchant } = await requireMerchant();
  const { date, month: monthParam } = await searchParams;
  if (date && isValidDate(date)) redirect(`/merchant/day/${date}`);
  const remarks = await markRemarksSeen(user, merchant, await remarksForMerchant(merchant.id, 10));

  const today = todayIST();
  const month = today.slice(0, 7);
  const [days, employees] = await Promise.all([
    db.saleDay.findMany({
      where: { merchantId: merchant.id },
      orderBy: { date: "desc" },
      take: 60,
      include: {
        lines: { select: { amountPaise: true, cashPaise: true, upiPaise: true, cardPaise: true, otherPaise: true } },
        _count: { select: { invoices: true } },
      },
    }),
    db.employee.findMany({
      where: { merchantId: merchant.id },
      select: { joinDate: true, leftDate: true, attendance: { where: { date: today }, select: { status: true } } },
    }),
  ]);

  const todayDay = days.find((d) => d.date === today);
  const t = sums(todayDay?.lines ?? []);
  const a = await monthAnalytics(merchant.id, pickMonth(monthParam), today);
  const bank = a.totals.upiPaise + a.totals.cardPaise + a.totals.otherPaise;
  const share = (x: number) => (a.total ? `${Math.round((x / a.total) * 100)}% of sales` : "–");
  const change = a.previous.total ? (a.total - a.previous.total) / a.previous.total : null;
  const prevLabel = `${Number(a.previous.label.slice(8, 10))}–${Number(a.previous.label.slice(-2))} ${monthLabel(a.previous.label.slice(0, 7)).split(" ")[0]}`;
  const staff = employees.filter((e) => isEmployedOn(e, today));
  const present = staff.filter((e) => e.attendance[0]?.status === "P").length;
  const absent = staff.filter((e) => e.attendance[0]?.status === "A").length;
  const unmarked = staff.filter((e) => !e.attendance[0]).length;
  const newRemarks = remarks.filter((r) => r.isNew).length;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-gray-500">{formatDate(today)}</p>
        <h1 className="text-xl font-semibold">Hello, {user.name}</h1>
      </div>

      {/* Today's sales */}
      <section className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <h2 className="mr-auto font-semibold">Today&apos;s sales</h2>
          {todayDay ? <StatusBadge submitted={todayDay.submitted} locked={todayDay.locked} /> : <span className="badge bg-gray-100 text-gray-600">Not started</span>}
        </div>
        <div className="grid grid-cols-2 gap-px bg-gray-100 sm:grid-cols-4">
          <Tile label="Cash" value={formatPaise(t.cash)} />
          <Tile label="Bank (UPI/Card/Other)" value={formatPaise(t.bank)} />
          <Tile label="Total" value={formatPaise(t.total)} />
          <Tile label="Invoices" value={String(todayDay?._count.invoices ?? 0)} />
        </div>
        <div className="p-4">
          <Link href={`/merchant/day/${today}`} className="btn btn-primary w-full py-3 text-base">
            {todayDay?.locked ? "View today's sales" : todayDay ? "Continue today's sales →" : "＋ Enter today's sales"}
          </Link>
        </div>
      </section>

      <div>
        {/* Attendance today */}
        <section className="card p-4">
          <div className="mb-3 flex items-baseline">
            <h2 className="mr-auto font-semibold">Attendance today</h2>
            <Link href="/merchant/employees" className="text-xs text-blue-700 hover:underline">Employees</Link>
          </div>
          {staff.length === 0 ? (
            <p className="text-sm text-gray-500">No employees yet. <Link href="/merchant/employees" className="text-blue-700 hover:underline">Add them</Link> to track attendance and salary.</p>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                <Mini n={present} label="Present" className="text-green-700" />
                <Mini n={absent} label="Absent" className="text-red-700" />
                <Mini n={unmarked} label="Not marked" className={unmarked ? "text-amber-700" : "text-gray-400"} />
              </div>
              <Link href="/merchant/attendance" className={`btn w-full ${unmarked ? "btn-primary" : "btn-secondary"}`}>
                {unmarked ? `Mark attendance (${unmarked} left)` : "Open attendance"}
              </Link>
            </>
          )}
        </section>

      </div>

      {/* Month analytics: how the money came in */}
      <section className="card p-4" aria-labelledby="analytics-title">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h2 id="analytics-title" className="font-semibold">Sales analytics: {monthLabel(a.month)}</h2>
            <p className="text-xs text-gray-500">
              {a.month === month ? `1–${Number(a.through.slice(8))} ${monthLabel(month).split(" ")[0]} (so far)` : "Whole month"}
            </p>
          </div>
          <MonthPicker value={a.month} months={recentMonths()} />
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Total sales" value={formatPaise(a.total)}
            sub={change === null ? `No sales in ${prevLabel}` : (
              <span className={change >= 0 ? "text-[#006300]" : "text-red-700"}>
                {change >= 0 ? "▲" : "▼"} {Math.abs(Math.round(change * 100))}% vs {prevLabel}
              </span>
            )} />
          <Kpi label="Cash" value={formatPaise(a.totals.cashPaise)} sub={share(a.totals.cashPaise)} />
          <Kpi label="Bank (UPI / Card / Other)" value={formatPaise(bank)} sub={share(bank)} />
          <Kpi label="Invoices" value={String(a.invoices)}
            sub={a.invoices ? `Avg ${formatPaise(Math.round(a.total / a.invoices))} each` : "–"} />
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <h3 className="mb-2 text-sm font-medium text-gray-700">How you were paid</h3>
            <PaymentMix totals={a.totals} total={a.total} invoicesByMode={a.invoicesByMode} />
          </div>
          <div className="lg:col-span-3">
            <h3 className="mb-2 text-sm font-medium text-gray-700">Day by day</h3>
            <DailyModeChart days={a.days} />
            <p className="mt-2 text-xs text-gray-500">
              {a.sellingDays} selling day{a.sellingDays === 1 ? "" : "s"}
              {a.sellingDays > 0 && <> · average {formatPaise(Math.round(a.total / a.sellingDays))} per selling day</>}
              {a.best && <> · best day {formatDate(a.best.date)} ({formatPaise(a.best.total)})</>}
            </p>
          </div>
        </div>
      </section>

      {remarks.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">
            Remarks from your CA {newRemarks > 0 && <span className="badge ml-1 bg-amber-200 text-amber-900">{newRemarks} new</span>}
          </h2>
          <RemarkList remarks={remarks} viewer="merchant" dayHref={(d) => `/merchant/day/${d}`} />
        </section>
      )}

      {/* Earlier days */}
      <section className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3">
          <h2 className="mr-auto font-semibold">All days</h2>
          <form className="flex items-center gap-2">
            <input className="input w-auto py-1.5" type="date" name="date" max={today} defaultValue={today} required aria-label="Open a date" autoComplete="off" />
            <button className="btn btn-secondary py-1.5">Open</button>
          </form>
        </div>
        {days.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-500">No sales entered yet.</p>}
        <ul className="divide-y divide-gray-100">
          {days.map((d) => {
            const s = sums(d.lines);
            return (
              <li key={d.id}>
                <Link href={`/merchant/day/${d.date}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-gray-50">
                  <span className="w-36 font-medium">{formatDate(d.date)}</span>
                  <StatusBadge submitted={d.submitted} locked={d.locked} />
                  <span className="ml-auto flex flex-wrap gap-x-4 text-sm">
                    <span className="text-gray-600">Cash {formatPaise(s.cash)}</span>
                    <span className="text-gray-600">Bank {formatPaise(s.bank)}</span>
                    <span className="font-semibold">{formatPaise(s.total)}</span>
                    <span className="text-gray-500">{d._count.invoices} inv.</span>
                  </span>
                  <span className="text-gray-400" aria-hidden>›</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Tile({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-semibold ${className}`}>{value}</div>
    </div>
  );
}
function Mini({ n, label, className }: { n: number; label: string; className: string }) {
  return (
    <div className="rounded-lg bg-gray-50 py-2">
      <div className={`text-xl font-semibold ${className}`}>{n}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  );
}
function Kpi({ label, value, sub }: { label: string; value: string; sub: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-600">{sub}</div>
    </div>
  );
}
