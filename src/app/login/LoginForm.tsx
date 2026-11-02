"use client";

import { useActionState } from "react";
import { submitKeepingValues } from "@/components/ActionForm";
import { login } from "../actions";

export default function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form onSubmit={(e) => submitKeepingValues(e, action)} className="space-y-4">
      <div>
        <label className="label" htmlFor="username">Username</label>
        <input className="input" id="username" name="username" autoComplete="username" required autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
