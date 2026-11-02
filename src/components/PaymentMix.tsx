import { INK_ON, MODE_COLORS } from "@/lib/chart-colors";
import { formatPaise } from "@/lib/gst";
import { PAYMENT_MODES, type ModeField, type PaymentMode } from "@/lib/payments";

/**
 * How the month's money came in: a single segmented bar (parts of one whole)
 * plus the breakdown table, which is always shown and carries every value.
 */
export default function PaymentMix({
  totals, total, invoicesByMode,
}: {
  totals: Record<ModeField, number>;
  total: number;
  invoicesByMode: Record<PaymentMode, number>;
}) {
  const parts = PAYMENT_MODES.map((m) => ({ ...m, amount: totals[m.field], share: total ? totals[m.field] / total : 0 }));
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const accessible = parts.map((p) => `${p.label} ${formatPaise(p.amount)} (${pct(p.share)})`).join(", ");

  return (
    <div className="space-y-3">
      {total === 0 ? (
        <div className="h-7 rounded bg-gray-100" aria-label="No sales yet" />
      ) : (
        <div className="flex h-7 gap-0.5" role="img" aria-label={`Payment mix: ${accessible}`}>
          {parts.filter((p) => p.amount > 0).map((p) => (
            <div key={p.key} title={`${p.label}: ${formatPaise(p.amount)} (${pct(p.share)})`}
              className="flex items-center overflow-hidden rounded px-2 text-xs font-semibold"
              style={{ flexGrow: p.amount, flexBasis: 0, background: MODE_COLORS[p.key], color: INK_ON(p.key) }}>
              {/* Only print the share where it comfortably fits; the table below has every value. */}
              {p.share >= 0.12 && pct(p.share)}
            </div>
          ))}
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500">
            <th className="py-1 font-medium">Mode</th>
            <th className="py-1 text-right font-medium">Amount</th>
            <th className="py-1 text-right font-medium">Share</th>
            <th className="hidden py-1 text-right font-medium sm:table-cell">Invoices</th>
            <th className="hidden py-1 text-right font-medium sm:table-cell">Avg / invoice</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {parts.map((p) => {
            const n = invoicesByMode[p.key];
            return (
              <tr key={p.key} className="border-t border-gray-100">
                <td className="py-1.5">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: MODE_COLORS[p.key] }} aria-hidden />
                  {p.label}
                </td>
                <td className="py-1.5 text-right">{formatPaise(p.amount)}</td>
                <td className="py-1.5 text-right text-gray-600">{total ? pct(p.share) : "–"}</td>
                <td className="hidden py-1.5 text-right text-gray-600 sm:table-cell">{n || "–"}</td>
                <td className="hidden py-1.5 text-right text-gray-600 sm:table-cell">{n ? formatPaise(Math.round(p.amount / n)) : "–"}</td>
              </tr>
            );
          })}
          <tr className="border-t border-gray-200 font-semibold">
            <td className="py-1.5">Total</td>
            <td className="py-1.5 text-right">{formatPaise(total)}</td>
            <td className="py-1.5 text-right">{total ? "100%" : "–"}</td>
            <td className="hidden py-1.5 text-right sm:table-cell">{Object.values(invoicesByMode).reduce((a, b) => a + b, 0) || "–"}</td>
            <td className="hidden sm:table-cell"></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
