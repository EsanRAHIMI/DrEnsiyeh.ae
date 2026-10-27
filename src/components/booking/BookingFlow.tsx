"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import { formatMoney } from "@/lib/money";
import { IconAlert, IconCheck, IconClinic, IconHome, IconLock } from "@/components/icons";
import { AddressPicker, type PickedAddress } from "./AddressPicker";

export type OfferingOption = {
  offeringId: string;
  kind: "clinic" | "home_visit";
  serviceSlug: string;
  serviceName: string;
  summary: string;
  preparation: string;
  facilityName: string | null;
  facilitySlug: string | null;
  facilityAddress: string | null;
  priceMinor: number;
  currency: string;
  durationMinutes: number;
  prepay: boolean;
  autoConfirm: boolean;
  cancellation: { freeCancelHours: number; lateCancelRefundPercent: number } | null;
};

type Zone = { id: string; name: string; lat: number; lng: number; surchargeMinor: number };

type Hold = { bookingId: string; token: string; reference: string; holdExpiresAt: string; totalMinor: number; surchargeMinor: number; currency: string; paymentMode: string };

const TZ = "Asia/Dubai";
const dayFmt = (locale: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
const timeFmt = (locale: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
const longFmt = (locale: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", { dateStyle: "full", timeStyle: "short", timeZone: TZ });

function dubaiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const RED_FLAGS = [
  "Difficulty breathing or chest pain",
  "Confusion, drowsiness or a seizure",
  "High fever with a stiff neck or a rapidly spreading rash",
  "Fainting, very low blood pressure or feeling severely unwell",
];

export function BookingFlow(props: {
  locale: string;
  t: Dictionary["booking"];
  options: OfferingOption[];
  homeEnabled: boolean;
  zones: Zone[];
  initialKind: "clinic" | "home_visit" | null;
  initialService: string | null;
  initialFacility: string | null;
  policyVersion: string;
  mapsKey: string | null;
  emergencyText: Dictionary["emergency"];
}) {
  const { t, locale } = props;
  const [safety, setSafety] = useState<"unknown" | "ok" | "urgent">("unknown");
  const [kind, setKind] = useState<"clinic" | "home_visit" | null>(props.initialKind);
  const kindOptions = useMemo(
    () => props.options.filter((o) => o.kind === kind && (!props.initialFacility || o.kind !== "clinic" || o.facilitySlug === props.initialFacility)),
    [props.options, kind, props.initialFacility],
  );
  const [chosenOfferingId, setOfferingId] = useState<string | null>(() => {
    const match = props.options.find((o) => o.serviceSlug === props.initialService && (!props.initialKind || o.kind === props.initialKind));
    return match?.offeringId ?? null;
  });
  // A single available option for the chosen kind is selected automatically.
  const offeringId = chosenOfferingId ?? (kindOptions.length === 1 ? kindOptions[0].offeringId : null);
  const offering = props.options.find((o) => o.offeringId === offeringId) ?? null;
  const [address, setAddress] = useState<PickedAddress | null>(null);
  const [eligibility, setEligibility] = useState<{ eligible: boolean; zoneName?: string; surchargeMinor?: number } | null>(null);
  const [date, setDate] = useState(dubaiToday());
  const [slots, setSlots] = useState<{ key: string; days: Record<string, string[]> } | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [hold, setHold] = useState<Hold | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requested, setRequested] = useState<string | null>(null);
  const idemRef = useRef<string>("");
  const stepRef = useRef<HTMLDivElement>(null);

  const homeReady = kind !== "home_visit" || !!(eligibility?.eligible && address);
  const slotsKey = offering && homeReady ? `${offering.offeringId}|${address?.lat ?? ""}|${address?.lng ?? ""}|${reloadTick}` : null;
  const slotsByDay = slots && slots.key === slotsKey ? slots.days : {};
  const slotsLoading = !!slotsKey && slots?.key !== slotsKey;
  const loadSlots = useCallback(() => setReloadTick((n) => n + 1), []);

  // Fetch availability whenever the service/address changes (state is only set in async callbacks).
  useEffect(() => {
    if (!slotsKey || !offering) return;
    const ctrl = new AbortController();
    const qs = new URLSearchParams({ offeringId: offering.offeringId, from: dubaiToday(), days: "14" });
    if (kind === "home_visit" && address) {
      qs.set("lat", String(address.lat));
      qs.set("lng", String(address.lng));
    }
    fetch(`/api/v1/slots?${qs}`, { cache: "no-store", signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setSlots({ key: slotsKey, days: body.days });
        const first = Object.keys(body.days).sort()[0];
        setDate((d) => (body.days[d] ? d : first ?? d));
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        void e;
        setSlots({ key: slotsKey, days: {} });
        setError("We couldn't load available times. Please try again.");
      });
    return () => ctrl.abort();
  }, [slotsKey, offering, kind, address]);

  async function checkEligibility(a: PickedAddress) {
    setAddress(a);
    setEligibility(null);
    const res = await fetch("/api/v1/home-eligibility", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: a.lat, lng: a.lng }) });
    setEligibility(await res.json());
  }

  async function pickSlot(iso: string) {
    if (!offering) return;
    setSelected(iso);
    setError(null);
    idemRef.current = crypto.randomUUID() + crypto.randomUUID().slice(0, 8);
    const res = await fetch("/api/v1/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offeringId: offering.offeringId,
        startsAt: iso,
        idempotencyKey: idemRef.current,
        home: kind === "home_visit" && address ? { lat: address.lat, lng: address.lng, address: address.formatted, accessNotes: address.accessNotes } : undefined,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setSelected(null);
      setError(body.error === "slot_unavailable" ? "Sorry — that time was just taken. Please choose another." : "We couldn't reserve that time. Please try again.");
      void loadSlots();
      return;
    }
    setHold(body);
    requestAnimationFrame(() => stepRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function submitDetails(form: FormData) {
    if (!hold) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/bookings/${hold.bookingId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: hold.token,
          fullName: form.get("fullName"),
          email: form.get("email"),
          phone: form.get("phone"),
          forSomeoneElse: form.get("forSomeoneElse") === "on",
          whatsappOptIn: form.get("whatsappOptIn") === "on",
          acceptedPolicyVersion: props.policyVersion,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.error === "hold_expired") {
          setHold(null);
          setSelected(null);
          setError("Your reserved time expired. Please choose a time again.");
          void loadSlots();
        } else if (body.error === "invalid_input") {
          setError(body.issues?.[0]?.message ?? "Please check your details.");
        } else setError("Something went wrong. Your card has not been charged. Please try again.");
        return;
      }
      if (body.type === "redirect") {
        window.location.assign(body.url);
        return;
      }
      setRequested(body.reference);
    } finally {
      setSubmitting(false);
    }
  }

  if (requested) {
    return (
      <div className="card fade-up p-8 text-center" role="status">
        <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-ok-tint text-ok"><IconCheck className="size-7" /></span>
        <h2 className="mt-5 text-2xl text-ink">Request received</h2>
        <p className="mt-2 text-ink-soft">Reference <strong className="text-ink">{requested}</strong>. We&apos;ve emailed you the details. Your appointment will be confirmed by the facility — you&apos;ll receive a message when it is.</p>
        <Link href={`/${locale}/portal`} className="btn-primary mt-6">Go to my account</Link>
      </div>
    );
  }

  if (safety !== "ok") {
    return (
      <section className="card p-6 sm:p-8" aria-labelledby="safety-q">
        <h2 id="safety-q" className="text-xl text-ink">Before you book</h2>
        <p className="mt-2 text-ink-soft">Do you have any of these right now?</p>
        <ul className="mt-4 space-y-2 text-ink">
          {RED_FLAGS.map((f) => (
            <li key={f} className="flex gap-2"><IconAlert className="mt-1 size-4 shrink-0 text-alert" /> {f}</li>
          ))}
        </ul>
        {safety === "urgent" ? (
          <div role="alert" className="mt-6 rounded-2xl bg-alert-tint p-5 text-alert">
            <p className="font-semibold">Please seek emergency care now.</p>
            <p className="mt-1 text-ink-soft">Call <a href="tel:998" className="font-semibold text-alert underline">998</a> for an ambulance or go to the nearest emergency department. Online appointments and home visits are not suitable for urgent symptoms.</p>
            <button type="button" className="btn-ghost mt-4 px-0 text-sm" onClick={() => setSafety("unknown")}>I answered by mistake</button>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" className="btn-primary" onClick={() => setSafety("ok")}>No — continue to booking</button>
            <button type="button" className="btn-secondary" onClick={() => setSafety("urgent")}>Yes, I have one of these</button>
          </div>
        )}
      </section>
    );
  }

  const dates = Array.from({ length: 14 }, (_, i) => addDays(dubaiToday(), i));
  const daySlots = slotsByDay[date] ?? [];
  const total = (offering?.priceMinor ?? 0) + (kind === "home_visit" ? eligibility?.surchargeMinor ?? 0 : 0);

  return (
    <div className="min-w-0 space-y-6">
      {/* Step 1: kind */}
      <Step n={1} title={t.stepKind} done={!!kind}>
        <div className="grid gap-3 sm:grid-cols-2">
          <KindButton active={kind === "clinic"} onClick={() => { setKind("clinic"); setOfferingId(null); setHold(null); }} icon={<IconClinic className="size-6" />} title={t.clinic} desc={t.clinicDesc} />
          <KindButton
            active={kind === "home_visit"}
            disabled={!props.homeEnabled}
            onClick={() => { setKind("home_visit"); setOfferingId(null); setHold(null); }}
            icon={<IconHome className="size-6" />}
            title={t.home}
            desc={props.homeEnabled ? t.homeDesc : t.homeUnavailable}
          />
        </div>
      </Step>

      {/* Step 2: service */}
      {kind && (
        <Step n={2} title={t.stepService} done={!!offering}>
          <fieldset className="grid gap-3">
            <legend className="sr-only">{t.stepService}</legend>
            {kindOptions.length === 0 && <p className="text-ink-soft">No services are available online yet.</p>}
            {kindOptions.map((o) => (
              <label key={o.offeringId} className={`flex cursor-pointer items-start justify-between gap-4 rounded-2xl border p-4 transition-colors ${offeringId === o.offeringId ? "border-teal bg-teal-tint/60" : "border-line bg-white hover:border-teal/50"}`}>
                <span className="flex gap-3">
                  <input type="radio" name="offering" className="mt-1.5 size-4 accent-teal" checked={offeringId === o.offeringId} onChange={() => { setOfferingId(o.offeringId); setHold(null); setSelected(null); }} />
                  <span>
                    <span className="block font-semibold text-ink">{o.serviceName}</span>
                    <span className="block text-sm text-ink-soft">{o.facilityName ?? t.home} · {o.durationMinutes} {t.minutes}</span>
                  </span>
                </span>
                <span className="font-semibold text-ink tabular-nums">{formatMoney(o.priceMinor, o.currency, locale)}</span>
              </label>
            ))}
          </fieldset>
        </Step>
      )}

      {/* Step 3 (home): address */}
      {kind === "home_visit" && offering && (
        <Step n={3} title={t.stepLocation} done={!!eligibility?.eligible}>
          <AddressPicker mapsKey={props.mapsKey} zones={props.zones} onPicked={checkEligibility} />
          {eligibility && (
            <p role="status" className={`mt-4 rounded-xl p-3 text-sm ${eligibility.eligible ? "bg-ok-tint text-ok" : "bg-alert-tint text-alert"}`}>
              {eligibility.eligible
                ? `Good news — this address is within the ${eligibility.zoneName} service area${eligibility.surchargeMinor ? ` (travel surcharge ${formatMoney(eligibility.surchargeMinor)})` : ""}.`
                : "Sorry — this address is outside the current home-visit area. You can book a clinic consultation instead."}
            </p>
          )}
        </Step>
      )}

      {/* Step: time */}
      {offering && homeReady && (
        <Step n={kind === "home_visit" ? 4 : 3} title={t.stepTime} done={!!hold}>
          <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2" role="listbox" aria-label="Choose a date">
            {dates.map((d) => {
              const n = slotsByDay[d]?.length ?? 0;
              return (
                <button
                  key={d}
                  type="button"
                  role="option"
                  aria-selected={d === date}
                  onClick={() => setDate(d)}
                  disabled={!slotsLoading && n === 0}
                  className={`flex min-w-[4.5rem] snap-start flex-col items-center rounded-2xl border px-3 py-2.5 text-sm transition-colors disabled:opacity-40 ${d === date ? "border-teal bg-teal text-white" : "border-line bg-white text-ink hover:border-teal/60"}`}
                >
                  {dayFmt(locale).format(new Date(`${d}T08:00:00Z`)).split(" ").map((p, i) => (
                    <span key={i} className={i === 1 ? "text-lg font-semibold" : "text-xs"}>{p.replace(",", "")}</span>
                  ))}
                </button>
              );
            })}
          </div>
          <div className="mt-4 min-h-24" aria-live="polite">
            {slotsLoading ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{Array.from({ length: 10 }, (_, i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-sage" />)}</div>
            ) : daySlots.length === 0 ? (
              <p className="text-ink-soft">{t.noSlots}</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {daySlots.map((iso) => (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => pickSlot(iso)}
                    aria-pressed={selected === iso}
                    className={`min-h-11 rounded-xl border text-sm font-medium tabular-nums transition-colors ${selected === iso ? "border-teal bg-teal text-white" : "border-line bg-white text-ink hover:border-teal"}`}
                  >
                    {timeFmt(locale).format(new Date(iso))}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Step>
      )}

      {error && <p role="alert" className="rounded-xl bg-alert-tint p-3 text-sm text-alert">{error}</p>}

      {/* Step: details + review */}
      {hold && offering && selected && (
        <div ref={stepRef}>
          <Step n={kind === "home_visit" ? 5 : 4} title={t.stepDetails} done={false}>
            <HoldTimer expiresAt={hold.holdExpiresAt} onExpire={() => { setHold(null); setSelected(null); setError("Your reserved time expired. Please choose a time again."); void loadSlots(); }} label={t.holdNotice} />
            <div className="mt-4 rounded-2xl bg-sage p-4 text-sm">
              <p className="font-semibold text-ink">{offering.serviceName}</p>
              <p className="text-ink-soft">{longFmt(locale).format(new Date(selected))} · {offering.facilityName ?? address?.formatted}</p>
              <dl className="mt-3 space-y-1">
                <div className="flex justify-between"><dt className="text-ink-soft">Consultation</dt><dd className="tabular-nums">{formatMoney(offering.priceMinor, offering.currency, locale)}</dd></div>
                {hold.surchargeMinor > 0 && <div className="flex justify-between"><dt className="text-ink-soft">Travel surcharge</dt><dd className="tabular-nums">{formatMoney(hold.surchargeMinor, hold.currency, locale)}</dd></div>}
                <div className="flex justify-between border-t border-line pt-2 font-semibold text-ink"><dt>{t.total}</dt><dd className="tabular-nums">{formatMoney(hold.totalMinor || total, hold.currency, locale)}</dd></div>
              </dl>
              {offering.cancellation && <p className="mt-3 text-xs text-ink-soft">Free cancellation up to {offering.cancellation.freeCancelHours} hours before. {offering.prepay ? "Paid online now." : "Payment at the facility."}</p>}
            </div>
            <form action={submitDetails} className="mt-5 grid gap-4" noValidate={false}>
              <div>
                <label htmlFor="fullName" className="field-label">{t.fullName}</label>
                <input id="fullName" name="fullName" required minLength={2} autoComplete="name" className="field" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="email" className="field-label">{t.email}</label>
                  <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" className="field" />
                </div>
                <div>
                  <label htmlFor="phone" className="field-label">{t.phone}</label>
                  <input id="phone" name="phone" type="tel" required autoComplete="tel" inputMode="tel" placeholder="+971 5x xxx xxxx" className="field" />
                </div>
              </div>
              <label className="flex items-start gap-3 text-sm text-ink">
                <input type="checkbox" name="forSomeoneElse" className="mt-1 size-4 accent-teal" /> {t.forSomeoneElse}
              </label>
              <label className="flex items-start gap-3 text-sm text-ink">
                <input type="checkbox" name="whatsappOptIn" className="mt-1 size-4 accent-teal" /> Send appointment updates by WhatsApp too (reference number only — never medical details).
              </label>
              <label className="flex items-start gap-3 text-sm text-ink">
                <input type="checkbox" required className="mt-1 size-4 accent-teal" />
                <span>
                  {t.acceptPolicy} <Link href={`/${locale}/legal/cancellation-refund`} target="_blank" className="text-teal underline">Policy</Link> ·{" "}
                  <Link href={`/${locale}/legal/medical-disclaimer`} target="_blank" className="text-teal underline">Disclaimer</Link>
                </span>
              </label>
              <button type="submit" disabled={submitting} className="btn-primary w-full sm:w-auto">
                <IconLock className="size-4" /> {submitting ? "Please wait…" : offering.prepay ? t.payNow : t.request}
              </button>
              {offering.prepay && <p className="text-xs text-muted">Card, Apple Pay and Google Pay are processed by Stripe. We never see or store your card number.</p>}
            </form>
          </Step>
        </div>
      )}
    </div>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6" aria-labelledby={`step-${n}`}>
      <h2 id={`step-${n}`} className="mb-4 flex items-center gap-3 font-sans text-base font-semibold text-ink">
        <span className={`inline-flex size-7 items-center justify-center rounded-full text-sm ${done ? "bg-teal text-white" : "bg-sage text-teal"}`}>{done ? <IconCheck className="size-4" /> : n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function KindButton(props: { active: boolean; disabled?: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      aria-pressed={props.active}
      onClick={props.onClick}
      className={`flex items-start gap-4 rounded-2xl border p-4 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${props.active ? "border-teal bg-teal-tint/60" : "border-line bg-white hover:border-teal/50"}`}
    >
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-teal shadow-[var(--shadow-soft)]">{props.icon}</span>
      <span>
        <span className="block font-semibold text-ink">{props.title}</span>
        <span className="mt-0.5 block text-sm text-ink-soft">{props.desc}</span>
      </span>
    </button>
  );
}

function HoldTimer({ expiresAt, onExpire, label }: { expiresAt: string; onExpire: () => void; label: string }) {
  const [left, setLeft] = useState(() => new Date(expiresAt).getTime() - Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setLeft(ms);
      if (ms <= 0) {
        clearInterval(id);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpire]);
  const m = Math.max(0, Math.floor(left / 60000));
  const s = Math.max(0, Math.floor((left % 60000) / 1000));
  return (
    <p className="text-sm text-brass">
      {label} <span className="font-semibold tabular-nums">{m}:{String(s).padStart(2, "0")}</span>
    </p>
  );
}
