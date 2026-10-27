"use client";

import { useReportWebVitals } from "next/web-vitals";
import { readConsent } from "@/lib/consent-client";

/** Real-user Core Web Vitals → first-party endpoint, only with analytics consent, public pages only. */
export function WebVitals() {
  useReportWebVitals((m) => {
    if (!["LCP", "INP", "CLS", "FCP", "TTFB"].includes(m.name)) return;
    if (/\/(portal|login|book\/status)/.test(location.pathname)) return;
    if (!readConsent()?.analytics) return;
    navigator.sendBeacon?.("/api/v1/vitals", new Blob([JSON.stringify({ name: m.name, value: m.value, rating: m.rating, path: location.pathname })], { type: "application/json" }));
  });
  return null;
}
