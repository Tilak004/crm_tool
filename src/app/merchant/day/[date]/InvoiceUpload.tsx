"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PAYMENT_MODES } from "@/lib/payments";
import { uploadInvoiceFiles, type SaveResult } from "../../actions";

export default function InvoiceUpload({ date }: { date: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        startTransition(async () => {
          const res = await uploadInvoiceFiles(date, form);
          setResult(res);
          if (res.ok) { formRef.current?.reset(); router.refresh(); }
        });
      }}
    >
      <div>
        <label className="label" htmlFor="files">Files</label>
        <input id="files" name="files" type="file" multiple required
          accept="application/pdf,image/jpeg,image/png,image/webp" className="block max-w-full text-sm" />
      </div>
      <div>
        <label className="label" htmlFor="upload-mode">Paid by</label>
        <select id="upload-mode" name="mode" className="input" defaultValue="">
          <option value="">Not specified</option>
          {PAYMENT_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </div>
      <button className="btn btn-secondary" disabled={pending}>{pending ? "Uploading…" : "Upload"}</button>
      {result && <span className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.message}</span>}
    </form>
  );
}
