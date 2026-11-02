"use client";

import { useState } from "react";

/** <details> whose open state is only initialised from props, so a server refresh doesn't collapse it. */
export default function Disclosure({
  id, summary, defaultOpen, className, children,
}: {
  id?: string;
  summary: React.ReactNode;
  defaultOpen: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details id={id} className={className} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-medium text-blue-700">{summary}</summary>
      {children}
    </details>
  );
}
