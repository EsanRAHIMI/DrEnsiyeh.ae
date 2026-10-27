"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { readConsent, writeConsent, CONSENT_VERSION, CONSENT_EVENT, type ConsentState } from "@/lib/consent-client";

/**
 * Consent banner. Defaults: only strictly necessary storage. "Analytics" enables first-party,
 * aggregate funnel measurement. "Advertising" is shown only when ad pixels are enabled by
 * compliance settings, and is never applied on booking, portal or admin pages.
 */
function subscribe(cb: () => void) {
  window.addEventListener(CONSENT_EVENT, cb);
  return () => window.removeEventListener(CONSENT_EVENT, cb);
}
const cookieSnapshot = () => document.cookie.match(/(?:^|; )dr_consent=([^;]+)/)?.[1] ?? "";
const serverSnapshot = () => null;

export function ConsentManager({ locale }: { locale: string }) {
  // The consent cookie is external state: read it with useSyncExternalStore (null during SSR).
  const raw = useSyncExternalStore(subscribe, cookieSnapshot, serverSnapshot);
  const [reopened, setReopened] = useState(false);
  const [customise, setCustomise] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const pathname = usePathname();
  const state: ConsentState | null | undefined = raw === null ? undefined : reopened ? null : readConsent();

  useEffect(() => {
    const open = () => {
      setReopened(true);
      setCustomise(true);
    };
    window.addEventListener("dr:open-consent", open);
    return () => window.removeEventListener("dr:open-consent", open);
  }, []);

  useEffect(() => {
    if (state?.analytics) captureAttribution(pathname);
  }, [state?.analytics, pathname]);

  if (state !== null) return null;

  const save = (c: Omit<ConsentState, "version" | "at">) => {
    writeConsent(c);
    setReopened(false);
  };

  return (
    <div role="dialog" aria-modal="false" aria-labelledby="consent-title" className="fixed inset-x-3 bottom-24 z-50 md:inset-x-auto md:end-6 md:bottom-6 md:max-w-md">
      <div className="card fade-up p-5">
        <p id="consent-title" className="font-semibold text-ink">Your privacy choices</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          We use strictly necessary cookies to run this site. With your permission we also measure, in aggregate, how visitors find and use it. We never share health information with advertisers.{" "}
          <Link href={`/${locale}/legal/cookies`} className="text-teal underline">Details</Link>
        </p>
        {customise && (
          <label className="mt-4 flex items-start gap-3 text-sm text-ink">
            <input type="checkbox" className="mt-1 size-4 accent-teal" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
            <span>
              <span className="font-medium">Aggregate analytics</span>
              <span className="block text-ink-soft">First-party, anonymous visit and booking-funnel statistics.</span>
            </span>
          </label>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary min-h-10 px-4 text-sm" onClick={() => save({ analytics: false, ads: false })}>
            Necessary only
          </button>
          {customise ? (
            <button type="button" className="btn-primary min-h-10 px-4 text-sm" onClick={() => save({ analytics, ads: false })}>
              Save choices
            </button>
          ) : (
            <>
              <button type="button" className="btn-ghost min-h-10 px-3 text-sm" onClick={() => setCustomise(true)}>
                Customise
              </button>
              <button type="button" className="btn-primary min-h-10 px-4 text-sm" onClick={() => save({ analytics: true, ads: false })}>
                Accept analytics
              </button>
            </>
          )}
        </div>
        <p className="mt-3 text-[11px] text-muted">Policy version {CONSENT_VERSION}</p>
      </div>
    </div>
  );
}

const PRIVATE_PREFIXES = ["/portal", "/admin", "/book/status", "/login"];

function captureAttribution(pathname: string) {
  if (PRIVATE_PREFIXES.some((p) => pathname.includes(p))) return;
  try {
    const url = new URL(window.location.href);
    const utm = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].reduce<Record<string, string>>((acc, k) => {
      const v = url.searchParams.get(k);
      if (v) acc[k] = v.slice(0, 100);
      return acc;
    }, {});
    const clickPlatform = ["gclid", "fbclid", "li_fat_id", "ttclid", "ScCid"].find((k) => url.searchParams.has(k)) ?? null;
    navigator.sendBeacon?.(
      "/api/v1/track",
      new Blob([JSON.stringify({ step: "page_view", path: pathname, utm, clickPlatform })], { type: "application/json" }),
    );
  } catch {
    /* measurement must never break the page */
  }
}
