"use client";

import { openConsentPreferences } from "@/lib/consent-client";

export function ConsentPreferencesButton() {
  return (
    <button type="button" className="btn-secondary mt-6" onClick={openConsentPreferences}>
      Change cookie preferences
    </button>
  );
}
