"use client";

import { useActionState } from "react";
import { requestData, signOutEverywhere, updateCommunicationConsent, updateProfile } from "@/app/(site)/[locale]/portal/actions";

type Props = {
  displayName: string;
  phone: string;
  email: string;
  locale: string;
  whatsapp: boolean;
  marketing: boolean;
  profiles: { id: string; name: string; relationship: string; verified: boolean }[];
  deletionRequested: boolean;
};

export function SettingsForms(p: Props) {
  const [profileState, profileAction, savingProfile] = useActionState(updateProfile, null);
  const [commState, commAction, savingComm] = useActionState(updateCommunicationConsent, null);
  const [dataState, dataAction, sendingData] = useActionState(requestData, null);
  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h2 className="text-xl text-ink">Personal details</h2>
        <form action={profileAction} className="mt-5 grid gap-4 sm:grid-cols-2">
          <div><label className="field-label" htmlFor="dn">Name</label><input id="dn" name="displayName" defaultValue={p.displayName} className="field" required /></div>
          <div><label className="field-label" htmlFor="ph">Mobile</label><input id="ph" name="phone" defaultValue={p.phone} className="field" required type="tel" /></div>
          <div><label className="field-label" htmlFor="em">Email</label><input id="em" value={p.email} className="field bg-sage" disabled /></div>
          <div>
            <label className="field-label" htmlFor="lc">Language</label>
            <select id="lc" name="locale" defaultValue={p.locale} className="field"><option value="en">English</option><option value="ar">العربية</option></select>
          </div>
          <div className="sm:col-span-2 flex items-center gap-4">
            <button disabled={savingProfile} className="btn-primary">Save</button>
            {profileState?.ok && <span role="status" className="text-sm text-ok">Saved</span>}
            {profileState?.error && <span role="alert" className="text-sm text-alert">{profileState.error}</span>}
          </div>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="text-xl text-ink">Patient profiles</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {p.profiles.map((x) => (
            <li key={x.id} className="flex justify-between rounded-xl bg-sage px-4 py-3">
              <span>{x.name} <span className="text-muted">({x.relationship})</span></span>
              <span className={x.verified ? "text-ok" : "text-muted"}>{x.verified ? "Identity verified" : "Verify at your next visit"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-6">
        <h2 className="text-xl text-ink">Notifications & consent</h2>
        <form action={commAction} className="mt-4 space-y-3 text-sm">
          <p className="text-ink-soft">Appointment emails are always sent. Messages never contain medical details.</p>
          <label className="flex gap-3"><input type="checkbox" name="whatsapp" defaultChecked={p.whatsapp} className="size-4 accent-teal" /> WhatsApp appointment updates</label>
          <label className="flex gap-3"><input type="checkbox" name="marketing" defaultChecked={p.marketing} className="size-4 accent-teal" /> Occasional practice news (no health-based targeting)</label>
          <div className="flex items-center gap-4"><button disabled={savingComm} className="btn-secondary">Update preferences</button>{commState?.ok && <span className="text-ok">Saved</span>}</div>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="text-xl text-ink">Your data</h2>
        <form action={dataAction} className="mt-4 grid gap-3 text-sm">
          <label className="field-label" htmlFor="dt">Request</label>
          <select id="dt" name="type" className="field"><option value="access">A copy of my data</option><option value="correction">Correct my data</option><option value="deletion">Delete my account</option></select>
          <textarea name="notes" className="field min-h-20 py-3" placeholder="Details (optional)" maxLength={1000} />
          <p className="text-xs text-muted">Medical and financial records may need to be retained for the period required by UAE law even if you close your account.</p>
          <div className="flex items-center gap-4"><button disabled={sendingData} className="btn-secondary">Submit request</button>{dataState?.ok && <span className="text-ok">Request received — we&apos;ll respond within 30 days.</span>}</div>
          {p.deletionRequested && <p className="text-brass">An account deletion request is in progress.</p>}
        </form>
      </section>

      <section className="card p-6">
        <h2 className="text-xl text-ink">Security</h2>
        <form action={signOutEverywhere} className="mt-4"><button className="btn-secondary">Sign out on all devices</button></form>
      </section>
    </div>
  );
}
