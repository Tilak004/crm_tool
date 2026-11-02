import "server-only";
import { db } from "./db";
import { GST_RATES, isValidHsn } from "./gst";
import { toSearchText } from "./hsn-import";

export type HsnResult = {
  code: string;
  description: string;
  kind: string;
  /** Descriptions of the chapter/heading/sub-heading above this code, broadest first. */
  parents: { code: string; description: string }[];
  /** Rate the firm has most often used for this code, if any. */
  firmRate: number | null;
  firmItemCount: number;
  /** Business type this code typically belongs to, when searching for a merchant. */
  fitsLabel: string | null;
};

export type SearchOptions = {
  limit?: number;
  /** Also return 2-digit chapter codes. */
  includeChapters?: boolean;
  /** Count "firm" usage from this merchant's items only (so merchants don't see other merchants' mappings). */
  usageMerchantId?: string;
  /** Codes under these prefixes (from the merchant's business types) are listed first. */
  preferPrefixes?: { prefix: string; label: string }[];
};

/**
 * Searches the HSN master. Digits match code prefixes; otherwise every word must
 * start a word in the code or description. Only 4/6/8-digit codes are returned unless
 * includeChapters is set.
 */
export async function searchHsn(query: string, opts: SearchOptions = {}): Promise<HsnResult[]> {
  const { limit = 25, includeChapters = false, usageMerchantId, preferPrefixes = [] } = opts;
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const digitsOnly = /^\d+$/.test(q);
  const words = toSearchText(q).split(" ").filter(Boolean).slice(0, 6);
  if (!digitsOnly && words.length === 0) return [];
  const rows = await db.hsnCode.findMany({
    where: digitsOnly
      ? { code: { startsWith: q } }
      : { AND: words.map((w) => ({ searchText: { contains: ` ${w}` } })) },
    orderBy: { code: "asc" },
    take: 400,
  });

  const fits = (code: string) => preferPrefixes.find((p) => code.startsWith(p.prefix))?.label ?? null;
  const filtered = rows
    .filter((r) => includeChapters || r.code.length >= 4)
    // Exact code match first, then codes fitting the merchant's business, then
    // code order (a heading sorts before its sub-codes).
    .sort((a, b) =>
      Number(b.code === q) - Number(a.code === q) ||
      Number(fits(b.code) !== null) - Number(fits(a.code) !== null) ||
      a.code.localeCompare(b.code))
    .slice(0, limit);

  return (await enrich(filtered, usageMerchantId)).map((r) => ({ ...r, fitsLabel: fits(r.code) }));
}

/** One-line description of an item's HSN mapping change, for the audit log. */
export function mappingSummary(itemName: string, oldHsn: string | null, oldRate: number | null, hsn: string, rate: number) {
  return oldHsn === null
    ? `${itemName}: HSN ${hsn} @ ${rate}%`
    : `${itemName}: HSN ${oldHsn} @ ${oldRate}% → ${hsn} @ ${rate}%`;
}

/** Validates the hsn/rate fields of a mapping form. */
export async function parseMapping(form: FormData): Promise<{ hsn: string; rate: number } | { error: string }> {
  const hsn = String(form.get("hsn") ?? "").replace(/\s/g, "");
  const rate = Number(form.get("rate"));
  if (!isValidHsn(hsn)) return { error: "HSN must be 4, 6 or 8 digits." };
  if (!(GST_RATES as readonly number[]).includes(rate)) return { error: "Pick a GST rate." };
  // Once the official list is loaded, only codes from it are accepted.
  if ((await db.hsnCode.count()) > 0 && !(await db.hsnCode.findUnique({ where: { code: hsn } }))) {
    return { error: `${hsn} is not in the official HSN list. Pick a code from the suggestions.` };
  }
  return { hsn, rate };
}

export async function getHsn(code: string) {
  const row = await db.hsnCode.findUnique({ where: { code } });
  return row ? (await enrich([row]))[0] : null;
}

export async function hsnMasterCount() {
  return db.hsnCode.count();
}

async function enrich(rows: { code: string; description: string; kind: string }[], usageMerchantId?: string): Promise<Omit<HsnResult, "fitsLabel">[]> {
  if (rows.length === 0) return [];
  const parentCodes = new Set<string>();
  for (const r of rows) for (const len of [2, 4, 6]) if (r.code.length > len) parentCodes.add(r.code.slice(0, len));

  const [parents, usage] = await Promise.all([
    db.hsnCode.findMany({ where: { code: { in: [...parentCodes] } }, select: { code: true, description: true } }),
    db.item.groupBy({
      by: ["hsnCode", "gstRate"],
      where: { hsnCode: { in: rows.map((r) => r.code) }, ...(usageMerchantId ? { merchantId: usageMerchantId } : {}) },
      _count: { _all: true },
    }),
  ]);
  const parentMap = new Map(parents.map((p) => [p.code, p.description]));

  return rows.map((r) => {
    const rates = usage.filter((u) => u.hsnCode === r.code && u.gstRate !== null);
    const top = rates.sort((a, b) => b._count._all - a._count._all)[0];
    return {
      code: r.code,
      description: r.description,
      kind: r.kind,
      parents: [2, 4, 6]
        .filter((len) => r.code.length > len && parentMap.has(r.code.slice(0, len)))
        .map((len) => ({ code: r.code.slice(0, len), description: parentMap.get(r.code.slice(0, len))! })),
      firmRate: top?.gstRate ?? null,
      firmItemCount: rates.reduce((s, u) => s + u._count._all, 0),
    };
  });
}
