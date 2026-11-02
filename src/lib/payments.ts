// Payment modes used for the cash/bank split. Shared by server and client code.
export const PAYMENT_MODES = [
  { key: "CASH", label: "Cash", field: "cashPaise", bank: false },
  { key: "UPI", label: "UPI", field: "upiPaise", bank: true },
  { key: "CARD", label: "Card", field: "cardPaise", bank: true },
  { key: "OTHER", label: "Other bank", field: "otherPaise", bank: true },
] as const;

export type PaymentMode = (typeof PAYMENT_MODES)[number]["key"];
export type ModeField = (typeof PAYMENT_MODES)[number]["field"];
export type SplitAmounts = Record<ModeField, number>;

export const MODE_KEYS = PAYMENT_MODES.map((m) => m.key) as PaymentMode[];
export const modeLabel = (key: string) => PAYMENT_MODES.find((m) => m.key === key)?.label ?? key;

export function isPaymentMode(v: unknown): v is PaymentMode {
  return typeof v === "string" && (MODE_KEYS as string[]).includes(v);
}

/** Lines saved before the split existed carry only a total. */
export function isUnsplit(line: SplitAmounts & { amountPaise: number }) {
  return line.amountPaise > 0 && PAYMENT_MODES.every((m) => line[m.field] === 0);
}

const naturalCompare = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });

/** Invoice count and first/last invoice number per payment mode. */
export function invoiceRanges(invoices: { invoiceNo: string; mode: string }[]) {
  return PAYMENT_MODES.map((m) => {
    const nos = invoices.filter((i) => i.mode === m.key).map((i) => i.invoiceNo).sort(naturalCompare);
    return { mode: m.key, label: m.label, count: nos.length, first: nos[0] ?? null, last: nos[nos.length - 1] ?? null };
  });
}

/** Suggests the number after `prev` by incrementing its trailing digits: "C-109" → "C-110". */
export function nextInvoiceNo(prev: string) {
  const m = prev.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return "";
  const next = String(Number(m[2]) + 1).padStart(m[2].length, "0");
  return `${m[1]}${next}${m[3]}`;
}

export type ModeCheck = {
  mode: PaymentMode;
  label: string;
  itemsPaise: number;
  enteredPaise: number | null;
  /** entered minus items; null when the merchant left the amount blank */
  diffPaise: number | null;
};

/** Compares each mode's item total with the amount the merchant entered in the day summary. */
export function reconcile(
  lines: (SplitAmounts & { amountPaise: number })[],
  payments: { mode: string; amountPaise: number | null }[],
): { checks: ModeCheck[]; mismatches: number; unsplitPaise: number } {
  const checks = PAYMENT_MODES.map((m) => {
    const itemsPaise = lines.reduce((s, l) => s + l[m.field], 0);
    const entered = payments.find((p) => p.mode === m.key)?.amountPaise ?? null;
    return {
      mode: m.key,
      label: m.label,
      itemsPaise,
      enteredPaise: entered,
      diffPaise: entered === null ? null : entered - itemsPaise,
    };
  });
  return {
    checks,
    mismatches: checks.filter((c) => c.diffPaise !== null && c.diffPaise !== 0).length,
    unsplitPaise: lines.filter(isUnsplit).reduce((s, l) => s + l.amountPaise, 0),
  };
}
