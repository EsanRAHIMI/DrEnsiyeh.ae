export const CONSENT_VERSION = "2026-10";
export const CONSENT_COOKIE = "dr_consent";

export type ConsentState = { version: string; analytics: boolean; ads: boolean; at: string };

export function readConsent(): ConsentState | null {
  const m = document.cookie.match(/(?:^|; )dr_consent=([^;]+)/);
  if (!m) return null;
  try {
    const c = JSON.parse(decodeURIComponent(m[1])) as ConsentState;
    return c.version === CONSENT_VERSION ? c : null;
  } catch {
    return null;
  }
}

export function writeConsent(c: { analytics: boolean; ads: boolean }): ConsentState {
  const full: ConsentState = { ...c, version: CONSENT_VERSION, at: new Date().toISOString() };
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(full))}; Path=/; Max-Age=${60 * 60 * 24 * 180}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  fetch("/api/v1/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(full), keepalive: true }).catch(() => {});
  return full;
}

export function openConsentPreferences() {
  window.dispatchEvent(new Event("dr:open-consent"));
}
