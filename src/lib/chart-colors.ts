// Chart colours per payment mode, in the fixed order Cash, UPI, Card, Other bank.
// Validated as a categorical set for colour-blind separation (adjacent ΔE ≥ 9);
// Card and Other bank are below 3:1 contrast on white, so every chart that uses
// them also shows labels or a table.
export const MODE_COLORS = {
  CASH: "#2a78d6",
  UPI: "#eb6834",
  CARD: "#1baf7a",
  OTHER: "#eda100",
} as const;

/** Text colour for a label printed inside a fill of the given mode. */
export const INK_ON = (mode: keyof typeof MODE_COLORS) => (mode === "OTHER" ? "#0b0b0b" : "#ffffff");

export const CHART = {
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  muted: "#898781",
};

/** Compact Indian rupee figure for axes and tight labels: ₹950, ₹12K, ₹1.2L, ₹3.4Cr. */
export function compactRupees(paise: number) {
  const r = paise / 100;
  if (r >= 1e7) return `₹${trim(r / 1e7)}Cr`;
  if (r >= 1e5) return `₹${trim(r / 1e5)}L`;
  if (r >= 1e3) return `₹${trim(r / 1e3)}K`;
  return `₹${Math.round(r)}`;
}
const trim = (n: number) => (n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ""));
