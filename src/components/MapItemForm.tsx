"use client";

import { useActionState, useState } from "react";
import { submitKeepingValues } from "@/components/ActionForm";
import HsnPicker, { type HsnOption } from "@/components/HsnPicker";
import { GST_RATES } from "@/lib/gst";

type State = { ok: boolean; message: string } | null;

/** HSN code + GST rate form for one item; `save` is a server action bound to the item. */
export default function MapItemForm({
  save, hsn, hsnDescription, rate, mapped, masterLoaded, merchantId,
}: {
  save: (prev: State, form: FormData) => Promise<State>;
  merchantId?: string;
  hsn: string;
  hsnDescription: string | null;
  rate: number | null;
  mapped: boolean;
  masterLoaded: boolean;
}) {
  const [state, action, pending] = useActionState(save, null);
  const [rateValue, setRateValue] = useState(rate === null ? "" : String(rate));
  const [rateHint, setRateHint] = useState<string | null>(null);

  function onPick(o: HsnOption) {
    if (o.firmRate === null) { setRateHint(null); return; }
    if (rateValue === "") {
      setRateValue(String(o.firmRate));
      setRateHint(`Rate filled from ${o.firmItemCount} earlier mapping(s) of ${o.code}. Please confirm.`);
    } else if (Number(rateValue) !== o.firmRate) {
      setRateHint(`Earlier mappings of ${o.code} used ${o.firmRate}%.`);
    } else {
      setRateHint(null);
    }
  }

  return (
    <form onSubmit={(e) => submitKeepingValues(e, action)} className="flex flex-wrap items-start gap-2">
      <HsnPicker name="hsn" defaultCode={hsn} defaultDescription={hsnDescription} masterLoaded={masterLoaded} merchantId={merchantId} onPick={onPick} />
      <select className="input w-24" name="rate" value={rateValue} required aria-label="GST rate"
        onChange={(e) => { setRateValue(e.target.value); setRateHint(null); }}>
        <option value="" disabled>Rate</option>
        {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
      </select>
      <button className="btn btn-primary" disabled={pending}>{mapped ? "Update" : "Save"}</button>
      {(state || rateHint) && (
        <div className="basis-full text-xs">
          {rateHint && <span className="mr-2 text-blue-700">{rateHint}</span>}
          {state && <span className={state.ok ? "text-green-700" : "text-red-600"}>{state.message}</span>}
        </div>
      )}
    </form>
  );
}
