import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { BUSINESS_TYPES, businessLabel, gstRegLabel, parseBusinessTypes } from "@/lib/business";

/** Business type and GST registration badges for a merchant. */
export default function BusinessBadges({ businessTypes, gstRegType }: { businessTypes: string; gstRegType: string | null }) {
  const types = parseBusinessTypes(businessTypes);
  const reg = gstRegLabel(gstRegType);
  if (!types.length && !reg) return <span className="text-xs text-gray-400">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {types.map((t) => <span key={t} className="badge bg-indigo-50 text-indigo-800">{businessLabel(t)}</span>)}
      {reg && (
        <span className={`badge ${gstRegType === "COMPOSITION" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}`}>{reg}</span>
      )}
    </span>
  );
}

/** Prisma filter for merchants having a business type (stored as a JSON array string). */
export const businessTypeWhere = (type: string | undefined) =>
  type && BUSINESS_TYPES.some((t) => t.key === type) ? { businessTypes: { contains: `"${type}"` } } : {};

/** GET form with a business-type dropdown that applies on change. */
export function BusinessTypeFilter({ value }: { value: string }) {
  return (
    <form key={value} className="flex items-center gap-2 text-sm">
      <label htmlFor="type" className="text-gray-600">Business type</label>
      <AutoSubmitSelect id="type" name="type" defaultValue={value} className="input w-56 py-1.5">
        <option value="">All</option>
        {BUSINESS_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
      </AutoSubmitSelect>
    </form>
  );
}
