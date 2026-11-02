"use client";

import { useEffect, useId, useRef, useState } from "react";

export type HsnOption = {
  code: string;
  description: string;
  kind: string;
  parents: { code: string; description: string }[];
  firmRate: number | null;
  firmItemCount: number;
  fitsLabel: string | null;
};

/**
 * Text input with a searchable dropdown over the official HSN list.
 * Submits the typed/selected code as `name`. Falls back to a plain input
 * when the HSN list has not been imported.
 */
export default function HsnPicker({
  name, defaultCode, defaultDescription, masterLoaded, merchantId, onPick,
}: {
  name: string;
  defaultCode: string;
  defaultDescription: string | null;
  masterLoaded: boolean;
  /** Ranks codes that fit this merchant's business types first. */
  merchantId?: string;
  onPick?: (option: HsnOption) => void;
}) {
  const listId = useId();
  const [text, setText] = useState(defaultCode);
  const [picked, setPicked] = useState<{ code: string; description: string } | null>(
    defaultCode && defaultDescription ? { code: defaultCode, description: defaultDescription } : null,
  );
  const [options, setOptions] = useState<HsnOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced search as the user types.
  useEffect(() => {
    if (!masterLoaded || !open) return;
    const q = text.trim();
    if (q.length < 2) { setOptions([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q, ...(merchantId ? { merchant: merchantId } : {}) });
        const res = await fetch(`/api/hsn?${params}`, { signal: ctrl.signal });
        if (res.ok) { setOptions((await res.json()).results); setActive(0); }
      } catch { /* aborted */ } finally { setLoading(false); }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [text, open, masterLoaded, merchantId]);

  // Close when clicking elsewhere.
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function choose(o: HsnOption) {
    setText(o.code);
    setPicked({ code: o.code, description: o.description });
    setOpen(false);
    onPick?.(o);
  }

  return (
    <div ref={boxRef} className="relative w-64">
      <input
        className="input font-mono"
        name={name}
        value={text}
        placeholder={masterLoaded ? "Code or description" : "HSN code"}
        autoComplete="off"
        required
        role="combobox"
        aria-label="HSN code"
        aria-expanded={open}
        aria-controls={listId}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          if (picked && e.target.value.trim() !== picked.code) setPicked(null);
        }}
        onKeyDown={(e) => {
          if (!open || options.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); choose(options[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {picked && (
        <div className="mt-1 line-clamp-2 text-xs text-gray-500" title={picked.description}>{picked.description}</div>
      )}
      {masterLoaded && open && text.trim().length >= 2 && (
        <ul id={listId} role="listbox"
          className="absolute left-0 z-20 mt-1 max-h-80 w-[32rem] max-w-[90vw] overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {loading && options.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">Searching…</li>}
          {!loading && options.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No matching HSN codes</li>}
          {options.map((o, i) => (
            <li key={o.code} role="option" aria-selected={i === active}
              className={`cursor-pointer border-b border-gray-50 px-3 py-2 text-sm ${i === active ? "bg-blue-50" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}>
              <div className="flex items-baseline gap-2">
                <span className="font-mono font-semibold">{o.code}</span>
                {o.kind === "SERVICE" && <span className="badge bg-purple-100 text-purple-800">SAC</span>}
                {o.fitsLabel && <span className="badge bg-indigo-50 text-indigo-800">Fits {o.fitsLabel}</span>}
                {o.firmRate !== null && (
                  <span className="badge bg-green-100 text-green-800">Used at {o.firmRate}% ({o.firmItemCount})</span>
                )}
              </div>
              <div className="text-gray-800">{o.description}</div>
              {o.parents.length > 0 && (
                <div className="truncate text-xs text-gray-400">
                  {o.parents.map((p) => p.description).join(" › ")}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
