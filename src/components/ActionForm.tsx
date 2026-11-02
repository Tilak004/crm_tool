"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";

type State = { ok: boolean; message: string } | null;

/**
 * React clears a form's fields after a `<form action>` submit, even when the
 * action returns a validation error. Submitting via onSubmit keeps what the
 * user typed so they can fix the mistake.
 */
export function submitKeepingValues(e: React.FormEvent<HTMLFormElement>, action: (form: FormData) => void) {
  e.preventDefault();
  const form = new FormData(e.currentTarget);
  startTransition(() => action(form));
}

/** Form bound to a server action that returns { ok, message }; by default resets its fields on success. */
export default function ActionForm({
  action, submitLabel, className, resetOnSuccess = true, children,
}: {
  action: (prev: State, form: FormData) => Promise<State>;
  submitLabel: string;
  className?: string;
  resetOnSuccess?: boolean;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} onSubmit={(e) => submitKeepingValues(e, formAction)} className={className}>
      {children}
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
        {state && <span className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
