// GST slabs selectable when mapping an item. 12% and 28% are kept for older
// periods and remaining goods after the Sept 2025 rate rationalisation.
export const GST_RATES = [0, 0.25, 1.5, 3, 5, 12, 18, 28, 40] as const;

// Common Unit Quantity Codes (UQC) used in GST returns.
export const UNITS = ["NOS", "PCS", "KGS", "GMS", "LTR", "MLT", "MTR", "BOX", "PAC", "DOZ", "SET", "BAG", "BTL", "OTH"] as const;

export function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function nameKey(name: string) {
  return normalizeName(name).toLowerCase();
}

export function isValidHsn(code: string) {
  return /^(\d{4}|\d{6}|\d{8})$/.test(code);
}

/** Splits a GST-inclusive amount (paise) into taxable value and tax (paise). */
export function splitInclusive(amountPaise: number, ratePercent: number) {
  const taxable = Math.round(amountPaise / (1 + ratePercent / 100));
  return { taxable, tax: amountPaise - taxable };
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });

export function formatPaise(paise: number) {
  return inr.format(paise / 100);
}

/** Parses a rupee string like "1,234.50" into paise; null if invalid. */
export function rupeesToPaise(value: string): number | null {
  const cleaned = value.replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

/** Today's date in India (YYYY-MM-DD). */
export function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function isValidDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(date + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

export function formatDate(date: string) {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", weekday: "short", timeZone: "UTC",
  });
}
