// Business types the CA can assign to a merchant. `hsnPrefixes` are HSN/SAC code
// prefixes typical for that trade; HSN search ranks matching codes first.
export const BUSINESS_TYPES = [
  { key: "KIRANA", label: "Kirana / General store", hsnPrefixes: ["04", "07", "08", "09", "10", "11", "15", "17", "19", "20", "21", "22", "2501", "33", "34"] },
  { key: "ELECTRONICS", label: "Electronics", hsnPrefixes: ["84", "85"] },
  { key: "HARDWARE", label: "Hardware", hsnPrefixes: ["32", "39", "68", "69", "72", "73", "74", "76", "82", "83"] },
  { key: "CLOTHING", label: "Clothing / Textiles", hsnPrefixes: ["50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63", "64", "65"] },
  { key: "PHARMACY", label: "Pharmacy", hsnPrefixes: ["30", "3401", "3306", "9018", "9619", "4015"] },
  { key: "RESTAURANT", label: "Restaurant / Food", hsnPrefixes: ["9963", "19", "21", "22", "0401", "0402"] },
  { key: "JEWELLERY", label: "Jewellery", hsnPrefixes: ["71"] },
  { key: "STATIONERY", label: "Stationery", hsnPrefixes: ["48", "49", "9608", "9609", "9610", "8214", "8305"] },
  { key: "MOBILE", label: "Mobile shop", hsnPrefixes: ["8517", "8507", "8504", "8518", "8523", "3926", "9985"] },
  { key: "FURNITURE", label: "Furniture", hsnPrefixes: ["94", "44"] },
  { key: "AUTO_PARTS", label: "Automobile parts", hsnPrefixes: ["87", "4011", "4013", "8407", "8408", "8409", "8483", "8511", "8512", "2710", "9987"] },
  { key: "SERVICES", label: "Services", hsnPrefixes: ["99"] },
  { key: "OTHER", label: "Other", hsnPrefixes: [] },
] as const;

export const GST_REG_TYPES = [
  { key: "REGULAR", label: "Regular" },
  { key: "COMPOSITION", label: "Composition" },
  { key: "UNREGISTERED", label: "Unregistered" },
] as const;

const TYPE_KEYS: string[] = BUSINESS_TYPES.map((t) => t.key);

export const businessLabel = (key: string) => BUSINESS_TYPES.find((t) => t.key === key)?.label ?? key;
export const gstRegLabel = (key: string | null) => GST_REG_TYPES.find((t) => t.key === key)?.label ?? null;

/** Reads the stored JSON array, dropping unknown keys. */
export function parseBusinessTypes(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string" && TYPE_KEYS.includes(k)) : [];
  } catch {
    return [];
  }
}

/** Validates submitted keys and returns the JSON to store. */
export function serializeBusinessTypes(keys: string[]) {
  return JSON.stringify([...new Set(keys)].filter((k) => TYPE_KEYS.includes(k)));
}

export function isGstRegType(v: unknown): v is (typeof GST_REG_TYPES)[number]["key"] {
  return typeof v === "string" && GST_REG_TYPES.some((t) => t.key === v);
}

/** HSN prefixes for a merchant's business types, with the type each came from. */
export function hsnPrefixesFor(typeKeys: string[]) {
  return BUSINESS_TYPES.filter((t) => typeKeys.includes(t.key))
    .flatMap((t) => t.hsnPrefixes.map((prefix) => ({ prefix, label: t.label })));
}
