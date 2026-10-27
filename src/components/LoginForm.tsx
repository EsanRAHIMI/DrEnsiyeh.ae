"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MESSAGES: Record<string, string> = {
  rate_limited: "Too many attempts. Please wait a few minutes and try again.",
  invalid_code: "That code isn't right. Please check and try again.",
  expired: "That code has expired. Request a new one.",
  disabled: "This account is disabled. Please contact the practice.",
  invalid: "That sign-in link is invalid or has already been used.",
};

export function LoginForm({ locale, next, initialError }: { locale: string; next?: string; initialError?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ? MESSAGES[initialError] ?? MESSAGES.invalid : null);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/v1/auth/request-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, locale }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(MESSAGES[body.error] ?? "Please enter a valid email address.");
    setChallengeId(body.challengeId);
    setStep("code");
  }

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\D/g, "");
    const res = await fetch("/api/v1/auth/verify-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId, email, code }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(MESSAGES[body.error] ?? MESSAGES.invalid_code);
    router.replace(body.staff ? "/admin" : next && next.startsWith(`/${locale}/`) ? next : `/${locale}/portal`);
    router.refresh();
  }

  return step === "email" ? (
    <form onSubmit={requestCode} className="space-y-4">
      <div>
        <label htmlFor="email" className="field-label">Email address</label>
        <input id="email" type="email" required autoComplete="email" inputMode="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
        <p className="mt-2 text-sm text-muted">Use the email you booked with. We&apos;ll send a 6-digit code and a sign-in link — no password needed.</p>
      </div>
      {error && <p role="alert" className="rounded-xl bg-alert-tint p-3 text-sm text-alert">{error}</p>}
      <button disabled={busy} className="btn-primary w-full">{busy ? "Sending…" : "Send sign-in code"}</button>
    </form>
  ) : (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-ink-soft">If an account can be used with <strong className="text-ink">{email}</strong>, a code is on its way. It expires in 10 minutes.</p>
      <div>
        <label htmlFor="code" className="field-label">6-digit code</label>
        <input id="code" name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} className="field text-center text-2xl tracking-[0.4em] tabular-nums" autoFocus />
      </div>
      {error && <p role="alert" className="rounded-xl bg-alert-tint p-3 text-sm text-alert">{error}</p>}
      <button disabled={busy} className="btn-primary w-full">{busy ? "Checking…" : "Sign in"}</button>
      <button type="button" className="btn-ghost w-full" onClick={() => { setStep("email"); setError(null); }}>Use a different email</button>
    </form>
  );
}
