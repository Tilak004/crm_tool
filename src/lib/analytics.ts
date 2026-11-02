import "server-only";
import { db } from "./db";
import { PAYMENT_MODES, type ModeField, type PaymentMode } from "./payments";
import { daysInMonth, monthDates, shiftMonth } from "./payroll";

export type DayPoint = { date: string } & Record<ModeField, number>;

export type MonthAnalytics = {
  month: string;
  /** Last day counted: today for the current month, else the month's last day. */
  through: string;
  days: DayPoint[];
  totals: Record<ModeField, number>;
  total: number;
  invoicesByMode: Record<PaymentMode, number>;
  invoices: number;
  sellingDays: number;
  best: { date: string; total: number } | null;
  /** Same day-range of the previous month, for comparison. */
  previous: { label: string; total: number; cash: number; bank: number };
};

const emptySplit = (): Record<ModeField, number> => ({ cashPaise: 0, upiPaise: 0, cardPaise: 0, otherPaise: 0 });

async function totalsBetween(merchantId: string, from: string, to: string) {
  const lines = await db.saleLine.findMany({
    where: { saleDay: { merchantId, date: { gte: from, lte: to } } },
    select: { cashPaise: true, upiPaise: true, cardPaise: true, otherPaise: true, saleDay: { select: { date: true } } },
  });
  return lines;
}

/** Sales by payment mode for one month (up to today when it is the current month). */
export async function monthAnalytics(merchantId: string, month: string, today: string): Promise<MonthAnalytics> {
  const dates = monthDates(month);
  const through = month === today.slice(0, 7) ? today : dates[dates.length - 1];
  const lines = await totalsBetween(merchantId, dates[0], through);

  const byDay = new Map<string, DayPoint>(dates.filter((d) => d <= through).map((d) => [d, { date: d, ...emptySplit() }]));
  const totals = emptySplit();
  for (const l of lines) {
    const p = byDay.get(l.saleDay.date);
    if (!p) continue;
    for (const m of PAYMENT_MODES) { p[m.field] += l[m.field]; totals[m.field] += l[m.field]; }
  }
  const days = [...byDay.values()];
  const dayTotal = (p: DayPoint) => p.cashPaise + p.upiPaise + p.cardPaise + p.otherPaise;
  const selling = days.filter((p) => dayTotal(p) > 0);
  const best = selling.reduce<{ date: string; total: number } | null>(
    (b, p) => (!b || dayTotal(p) > b.total ? { date: p.date, total: dayTotal(p) } : b), null);

  const invoiceRows = await db.invoice.groupBy({
    by: ["mode"],
    where: { saleDay: { merchantId, date: { gte: dates[0], lte: through } } },
    _count: { _all: true },
  });
  const invoicesByMode = Object.fromEntries(PAYMENT_MODES.map((m) => [m.key, invoiceRows.find((r) => r.mode === m.key)?._count._all ?? 0])) as Record<PaymentMode, number>;

  // Previous month over the same days (1st..same day number, capped at that month's length).
  const prevMonth = shiftMonth(month, -1);
  const lastDayNo = Math.min(Number(through.slice(8)), daysInMonth(prevMonth));
  const prevThrough = `${prevMonth}-${String(lastDayNo).padStart(2, "0")}`;
  const prevLines = await totalsBetween(merchantId, `${prevMonth}-01`, prevThrough);
  const prevCash = prevLines.reduce((s, l) => s + l.cashPaise, 0);
  const prevBank = prevLines.reduce((s, l) => s + l.upiPaise + l.cardPaise + l.otherPaise, 0);

  return {
    month, through, days, totals,
    total: totals.cashPaise + totals.upiPaise + totals.cardPaise + totals.otherPaise,
    invoicesByMode,
    invoices: Object.values(invoicesByMode).reduce((a, b) => a + b, 0),
    sellingDays: selling.length,
    best,
    previous: { label: `${prevMonth}-01..${prevThrough}`, total: prevCash + prevBank, cash: prevCash, bank: prevBank },
  };
}
