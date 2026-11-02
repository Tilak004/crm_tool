"use client";

import { useState } from "react";
import { CHART, MODE_COLORS, compactRupees } from "@/lib/chart-colors";
import { formatDate, formatPaise } from "@/lib/gst";
import { PAYMENT_MODES, type ModeField } from "@/lib/payments";

type Day = { date: string } & Record<ModeField, number>;

const W = 640, H = 220, PAD = { top: 12, right: 8, bottom: 22, left: 44 };
const GAP = 2;     // surface gap between stacked segments
const RADIUS = 4;  // rounded data-end (top of the stack only)

/** Rounds nicely for axis ticks: 1, 2, 2.5, 5 × 10^n. */
function niceMax(v: number) {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

/** Path for a column segment; only the top segment gets rounded top corners. */
function segment(x: number, y: number, w: number, h: number, roundTop: boolean) {
  if (!roundTop || h < RADIUS) return `M${x},${y}h${w}v${h}h${-w}z`;
  const r = RADIUS;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}z`;
}

/** Daily sales stacked by payment mode, with hover details and a table view. */
export default function DailyModeChart({ days }: { days: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const total = (d: Day) => PAYMENT_MODES.reduce((s, m) => s + d[m.field], 0);
  const max = niceMax(Math.max(0, ...days.map(total)));
  const plotW = W - PAD.left - PAD.right, plotH = H - PAD.top - PAD.bottom;
  const band = plotW / Math.max(days.length, 1);
  const barW = Math.min(24, band * 0.62);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const labelEvery = days.length > 20 ? 5 : days.length > 10 ? 2 : 1;
  const h = hover !== null ? days[hover] : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600" aria-label="Legend">
        {PAYMENT_MODES.map((m) => (
          <span key={m.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MODE_COLORS[m.key] }} aria-hidden />{m.label}
          </span>
        ))}
        <button type="button" className="ml-auto text-blue-700 hover:underline" onClick={() => setShowTable((s) => !s)}>
          {showTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {showTable ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-white text-xs text-gray-500">
              <tr><th className="py-1 text-left font-medium">Date</th>{PAYMENT_MODES.map((m) => <th key={m.key} className="py-1 text-right font-medium">{m.label}</th>)}<th className="py-1 text-right font-medium">Total</th></tr>
            </thead>
            <tbody>
              {days.filter((d) => total(d) > 0).map((d) => (
                <tr key={d.date} className="border-t border-gray-100">
                  <td className="py-1">{formatDate(d.date)}</td>
                  {PAYMENT_MODES.map((m) => <td key={m.key} className="py-1 text-right">{d[m.field] ? formatPaise(d[m.field]) : "–"}</td>)}
                  <td className="py-1 text-right font-medium">{formatPaise(total(d))}</td>
                </tr>
              ))}
              {days.every((d) => total(d) === 0) && <tr><td colSpan={6} className="py-4 text-center text-gray-500">No sales yet this month.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
            aria-label={`Daily sales by payment mode, ${days.length} days. Use "Show as table" for the values.`}
            onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? CHART.axis : CHART.grid} strokeWidth={1} />
                <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={CHART.muted}>{compactRupees(t)}</text>
              </g>
            ))}
            {days.map((d, i) => {
              const cx = PAD.left + band * i + band / 2;
              const x = cx - barW / 2;
              const present = PAYMENT_MODES.filter((m) => d[m.field] > 0);
              let acc = 0;
              return (
                <g key={d.date} opacity={hover === null || hover === i ? 1 : 0.45}>
                  {present.map((m, k) => {
                    const top = y(acc + d[m.field]);
                    const bottom = y(acc);
                    acc += d[m.field];
                    // 2px surface gap between segments (none below the first, which sits on the baseline).
                    const hgt = Math.max(0, bottom - top - (k > 0 ? GAP : 0));
                    return <path key={m.key} d={segment(x, top, barW, hgt, k === present.length - 1)} fill={MODE_COLORS[m.key]} />;
                  })}
                  {(i % labelEvery === 0 || i === days.length - 1) && (
                    <text x={cx} y={H - 6} textAnchor="middle" fontSize={11} fill={CHART.muted}>{Number(d.date.slice(8))}</text>
                  )}
                  {/* Hit target: the whole day band, taller than the bar. */}
                  <rect x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} fill="transparent"
                    onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
                </g>
              );
            })}
          </svg>
          {h && (
            <div className="pointer-events-none absolute top-0 z-10 w-48 rounded-md border border-gray-200 bg-white p-2 text-xs shadow-lg"
              style={{ left: `clamp(0px, calc(${((PAD.left + band * hover! + band / 2) / W) * 100}% - 6rem), calc(100% - 12rem))` }}>
              <div className="mb-1 font-semibold text-gray-900">{formatDate(h.date)}</div>
              {PAYMENT_MODES.map((m) => (
                <div key={m.key} className="flex items-center justify-between gap-2 text-gray-700">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: MODE_COLORS[m.key] }} />{m.label}</span>
                  <span className="tabular-nums">{formatPaise(h[m.field])}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-gray-100 pt-1 font-semibold"><span>Total</span><span className="tabular-nums">{formatPaise(total(h))}</span></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
