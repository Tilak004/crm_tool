"use client";

import { startTransition, useActionState } from "react";
import { submitKeepingValues } from "@/components/ActionForm";
import { caLogin, type CALoginState } from "./actions";

export default function CALoginForm() {
  const [state, action, pending] = useActionState<CALoginState, FormData>(caLogin, { stage: "password" });
  const error = state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>;

  if (state.stage === "password") {
    return (
      <form onSubmit={(e) => submitKeepingValues(e, action)} className="space-y-4">
        <input type="hidden" name="step" value="password" />
        <div>
          <label className="label" htmlFor="username">Username</label>
          <input className="input" id="username" name="username" autoComplete="username" required autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {error}
        <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Checking…" : "Continue"}</button>
      </form>
    );
  }

  const codeField = (
    <div>
      <label className="label" htmlFor="code">6-digit code from the app</label>
      <input className="input text-center font-mono text-2xl tracking-[0.4em]" id="code" name="code" required autoFocus
        inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" placeholder="••••••" />
    </div>
  );
  const cancel = (
    <button type="button" className="w-full text-center text-sm text-gray-500 hover:underline"
      onClick={() => { const f = new FormData(); f.set("step", "cancel"); startTransition(() => action(f)); }}>
      Back to sign in
    </button>
  );

  if (state.stage === "enroll") {
    return (
      <form onSubmit={(e) => submitKeepingValues(e, action)} className="space-y-4">
        <input type="hidden" name="step" value="code" />
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <b>One-time setup.</b> Install <b>Google Authenticator</b> or <b>Microsoft Authenticator</b> on your phone, tap <b>+</b>,
          and scan this QR code. Then enter the 6-digit code it shows.
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- data: URL QR code */}
        <img src={state.qr} alt="QR code to add this account to your authenticator app" className="mx-auto h-48 w-48 rounded border border-gray-200" />
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer">Can&apos;t scan? Enter this key instead</summary>
          <code className="mt-1 block break-all rounded bg-gray-100 p-2 font-mono text-gray-800">{state.secret.match(/.{1,4}/g)!.join(" ")}</code>
        </details>
        {codeField}
        {error}
        <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Checking…" : "Finish setup and sign in"}</button>
        {cancel}
      </form>
    );
  }

  return (
    <form onSubmit={(e) => submitKeepingValues(e, action)} className="space-y-4">
      <input type="hidden" name="step" value="code" />
      <p className="text-sm text-gray-600">Open your authenticator app and enter the current code for <b>PakkaLekka CA</b>.</p>
      {codeField}
      {error}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Checking…" : "Sign in"}</button>
      {cancel}
    </form>
  );
}
