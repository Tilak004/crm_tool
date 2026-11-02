"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteInvoiceFile } from "@/app/merchant/actions";
import { modeLabel } from "@/lib/payments";

type Attachment = { id: string; fileName: string; mode: string | null; size: number; mimeType: string };

export default function AttachmentList({ attachments, canDelete }: { attachments: Attachment[]; canDelete: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (attachments.length === 0) return <p className="mb-3 text-sm text-gray-400">No files uploaded.</p>;

  return (
    <div className="mb-3">
      <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
        {attachments.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
            <span className="badge bg-gray-100 text-gray-600">{a.mimeType === "application/pdf" ? "PDF" : "Image"}</span>
            <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener" className="mr-auto break-all text-blue-700 hover:underline">
              {a.fileName}
            </a>
            {a.mode && <span className="badge bg-blue-50 text-blue-800">{modeLabel(a.mode)}</span>}
            <span className="text-xs text-gray-400">{Math.max(1, Math.round(a.size / 1024))} KB</span>
            {canDelete && (
              <button type="button" className="text-xs text-red-600 hover:underline" disabled={pending}
                onClick={() => {
                  if (!confirm(`Remove ${a.fileName}?`)) return;
                  startTransition(async () => {
                    const res = await deleteInvoiceFile(a.id);
                    setError(res.ok ? null : res.message);
                    router.refresh();
                  });
                }}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
