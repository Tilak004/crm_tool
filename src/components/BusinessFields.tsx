"use client";

import { useEffect, useRef, useState } from "react";
import { BUSINESS_TYPES, GST_REG_TYPES, businessLabel } from "@/lib/business";

/**
 * Business type (multi-select dropdown) and GST registration type fields.
 * Submits `businessTypes` (repeated) and `gstRegType`.
 */
const NONE: string[] = [];

export default function BusinessFields({
  defaultTypes = NONE, defaultRegType = "", idPrefix = "",
}: {
  defaultTypes?: string[];
  defaultRegType?: string;
  idPrefix?: string;
}) {
  const [selected, setSelected] = useState<string[]>(defaultTypes);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Clear the selection when the surrounding form is reset after a successful create.
  useEffect(() => {
    const form = boxRef.current?.closest("form");
    const onReset = () => setSelected(defaultTypes);
    form?.addEventListener("reset", onReset);
    return () => form?.removeEventListener("reset", onReset);
  }, [defaultTypes]);

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  return (
    <>
      {/* The list opens in place and closes only via the toggle, Done or Escape: closing it
          on outside clicks would shift the layout under the pointer and swallow a Save click. */}
      <div ref={boxRef} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
        <span className="label" id={`${idPrefix}bt-label`}>Business type(s)</span>
        <button type="button" className="input flex min-h-[38px] items-center justify-between text-left"
          aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${idPrefix}bt-label`}
          onClick={() => setOpen((o) => !o)}>
          <span className={selected.length ? "" : "text-gray-400"}>
            {selected.length ? selected.map(businessLabel).join(", ") : "Select…"}
          </span>
          <span className="ml-2 text-gray-400">▾</span>
        </button>
        {open && (
          <div role="listbox" aria-multiselectable="true"
            className="mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-sm">
            {BUSINESS_TYPES.map((t) => (
              <label key={t.key} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
                <input type="checkbox" checked={selected.includes(t.key)} onChange={() => toggle(t.key)} />
                {t.label}
              </label>
            ))}
            <div className="border-t border-gray-100 px-3 pt-1">
              <button type="button" className="text-sm font-medium text-blue-700 hover:underline" onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        )}
        {selected.map((k) => <input key={k} type="hidden" name="businessTypes" value={k} />)}
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}gstRegType`}>GST registration</label>
        <select className="input" id={`${idPrefix}gstRegType`} name="gstRegType" defaultValue={defaultRegType}>
          <option value="">Not set</option>
          {GST_REG_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </div>
    </>
  );
}
