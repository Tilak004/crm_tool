import Link from "next/link";
import { redirect } from "next/navigation";
import RemarkList from "@/components/RemarkList";
import StatusBadge from "@/components/StatusBadge";
import { markRemarksSeen, remarksForMerchant } from "@/lib/remarks";
import { requireMerchant } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatPaise, isValidDate, todayIST } from "@/lib/gst";

export default async function MerchantHome({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { user, merchant } = await requireMerchant();
  const { date } = await searchParams;
  if (date && isValidDate(date)) redirect(`/merchant/day/${date}`);
  const remarks = await markRemarksSeen(user, merchant, await remarksForMerchant(merchant.id, 10));

  const today = todayIST();
  const days = await db.saleDay.findMany({
    where: { merchantId: merchant.id },
    orderBy: { date: "desc" },
    take: 60,
    include: {
      lines: { select: { amountPaise: true, cashPaise: true, upiPaise: true, cardPaise: true, otherPaise: true } },
      _count: { select: { invoices: true } },
    },
  });

  return (
    <div className="space-y-6">
      {remarks.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Remarks from your CA</h2>
          <RemarkList remarks={remarks} viewer="merchant" dayHref={(d) => `/merchant/day/${d}`} />
        </section>
      )}

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">Enter sales</h1>
          <p className="text-sm text-gray-500">Record the items you sold, one entry per day.</p>
        </div>
        <Link href={`/merchant/day/${today}`} className="btn btn-primary">Today&apos;s sales</Link>
        <form className="flex items-end gap-2">
          <div>
            <label className="label" htmlFor="date">Another date</label>
            <input className="input" type="date" id="date" name="date" max={today} defaultValue={today} required />
          </div>
          <button className="btn btn-secondary">Open</button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th><th className="text-right">Items</th><th className="text-right">Cash</th>
              <th className="text-right">Bank</th><th className="text-right">Total sales</th>
              <th className="text-right">Invoices</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {days.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-gray-500">No sales entered yet.</td></tr>
            )}
            {days.map((d) => {
              const total = d.lines.reduce((s, l) => s + l.amountPaise, 0);
              const cash = d.lines.reduce((s, l) => s + l.cashPaise, 0);
              const bank = d.lines.reduce((s, l) => s + l.upiPaise + l.cardPaise + l.otherPaise, 0);
              const invoices = d._count.invoices;
              return (
              <tr key={d.id}>
                <td>{formatDate(d.date)}</td>
                <td className="text-right">{d.lines.length}</td>
                <td className="text-right">{formatPaise(cash)}</td>
                <td className="text-right">{formatPaise(bank)}</td>
                <td className="text-right font-medium">{formatPaise(total)}</td>
                <td className="text-right">{invoices || "—"}</td>
                <td><StatusBadge submitted={d.submitted} locked={d.locked} /></td>
                <td className="text-right">
                  <Link href={`/merchant/day/${d.date}`} className="text-blue-700 hover:underline">
                    {d.locked ? "View" : "Edit"}
                  </Link>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
