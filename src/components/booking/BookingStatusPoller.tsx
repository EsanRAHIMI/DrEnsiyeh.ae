"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconCheck, IconAlert } from "@/components/icons";

type S = { reference: string; status: string; startsAt: string };

/**
 * Shown after returning from Stripe. It never assumes success from the redirect —
 * it polls the server, whose state only changes on a verified webhook.
 */
export function BookingStatusPoller({ locale, bookingId, token, cancelled }: { locale: string; bookingId: string; token: string; cancelled: boolean }) {
  const [s, setS] = useState<S | null>(null);
  const [tries, setTries] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stop = false;
    async function tick(n: number) {
      try {
        const res = await fetch(`/api/v1/bookings/${bookingId}?t=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const body: S = await res.json();
        if (stop) return;
        setS(body);
        setTries(n);
        if ((body.status === "pending_payment" || body.status === "hold") && n < 30 && !cancelled) setTimeout(() => tick(n + 1), 2000);
      } catch {
        if (!stop) setFailed(true);
      }
    }
    void tick(0);
    return () => {
      stop = true;
    };
  }, [bookingId, token, cancelled]);

  const when = s ? new Intl.DateTimeFormat("en-AE", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Dubai" }).format(new Date(s.startsAt)) : "";

  if (failed) return <Panel tone="alert" title="We couldn't load your booking">Please check your email for confirmation, or sign in to your account.</Panel>;
  if (!s) return <Panel title="Checking your booking…">One moment.</Panel>;

  if (cancelled && (s.status === "pending_payment" || s.status === "hold"))
    return (
      <Panel tone="alert" title="Payment not completed">
        Your card has not been charged. <Link className="text-teal underline" href={`/${locale}/book`}>Choose a time again</Link>.
      </Panel>
    );

  switch (s.status) {
    case "pending_payment":
    case "hold":
      return <Panel title="Confirming your payment…">{tries >= 30 ? "This is taking longer than usual. You'll receive an email as soon as your payment is confirmed." : "This usually takes a few seconds. Please don't close this page."}</Panel>;
    case "awaiting_confirmation":
      return (
        <Panel tone="ok" title="Payment received — awaiting confirmation">
          Reference <strong>{s.reference}</strong> for {when}. The facility will confirm your appointment shortly; we&apos;ll message you when it&apos;s confirmed.
          <Actions locale={locale} />
        </Panel>
      );
    case "confirmed":
      return (
        <Panel tone="ok" title="Appointment confirmed">
          Reference <strong>{s.reference}</strong> — {when}.
          <Actions locale={locale} />
        </Panel>
      );
    case "expired":
    case "cancelled":
      return <Panel tone="alert" title="This booking is no longer active">If you were charged, a full refund has been issued automatically. <Link className="text-teal underline" href={`/${locale}/book`}>Book again</Link>.</Panel>;
    default:
      return <Panel title={`Status: ${s.status}`}>Reference {s.reference}</Panel>;
  }
}

function Actions({ locale }: { locale: string }) {
  return (
    <span className="mt-6 block">
      <Link href={`/${locale}/portal`} className="btn-primary">Open my secure account</Link>
      <span className="mt-3 block text-sm text-muted">Sign in with the one-time code we email you — no password needed.</span>
    </span>
  );
}

function Panel({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "ok" | "alert" }) {
  return (
    <div className="card p-8 text-center" role="status" aria-live="polite">
      {tone && (
        <span className={`mx-auto inline-flex size-14 items-center justify-center rounded-full ${tone === "ok" ? "bg-ok-tint text-ok" : "bg-alert-tint text-alert"}`}>
          {tone === "ok" ? <IconCheck className="size-7" /> : <IconAlert className="size-7" />}
        </span>
      )}
      <h1 className="mt-5 text-2xl text-ink">{title}</h1>
      <p className="mt-3 leading-relaxed text-ink-soft">{children}</p>
    </div>
  );
}
