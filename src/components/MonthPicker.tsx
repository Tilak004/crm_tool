import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { monthLabel } from "@/lib/payroll";

/** GET form choosing ?month= among the given months; applies on change. */
export default function MonthPicker({ value, months }: { value: string; months: string[] }) {
  return (
    <form key={value} className="flex items-center gap-2 text-sm">
      <label htmlFor="month" className="text-gray-600">Month</label>
      <AutoSubmitSelect id="month" name="month" defaultValue={value} className="input w-48 py-1.5">
        {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
      </AutoSubmitSelect>
    </form>
  );
}
