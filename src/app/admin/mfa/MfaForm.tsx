"use client";

import { useActionState } from "react";
import { confirmEnrolment, stepUp } from "./actions";

export function MfaForm({ mode }: { mode: "enrol" | "verify" }) {
  const [state, action, pending] = useActionState(mode === "enrol" ? confirmEnrolment : stepUp, null as { error?: string } | null);
  return (
    <form action={action} className="mt-6 space-y-4">
      <label htmlFor="code" className="field-label">Authentication code</label>
      <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus className="field text-center text-2xl tracking-[0.4em] tabular-nums" />
      {state?.error && <p role="alert" className="text-sm text-alert">{state.error}</p>}
      <button disabled={pending} className="btn-primary w-full">{mode === "enrol" ? "Activate" : "Verify"}</button>
    </form>
  );
}
