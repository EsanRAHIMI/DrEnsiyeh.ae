"use client";

import { useActionState, useState } from "react";
import { cancelAppointment, rescheduleAppointment } from "@/app/(site)/[locale]/portal/actions";

const ERR: Record<string, string> = {
  slot_unavailable: "That time is no longer available. Please choose another.",
  invalid_transition: "This appointment can no longer be changed online.",
  forbidden: "You can't change this appointment.",
};

export function AppointmentActions({ bookingId, offeringId, refundText }: { locale: string; bookingId: string; offeringId: string; refundText: string; serviceSlug: string }) {
  const [mode, setMode] = useState<"none" | "cancel" | "reschedule">("none");
  const [cancelState, cancelAction, cancelling] = useActionState(cancelAppointment, null);
  const [resState, resAction, rescheduling] = useActionState(rescheduleAppointment, null);
  const [slots, setSlots] = useState<Record<string, string[]> | null>(null);
  const [day, setDay] = useState<string | null>(null);

  async function openReschedule() {
    setMode("reschedule");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
    const res = await fetch(`/api/v1/slots?offeringId=${offeringId}&from=${today}&days=14`, { cache: "no-store" });
    const body = await res.json();
    setSlots(body.days ?? {});
    setDay(Object.keys(body.days ?? {}).sort()[0] ?? null);
  }

  if (cancelState?.ok) return <p role="status" className="rounded-xl bg-ok-tint p-4 text-ok">Your appointment has been cancelled. A confirmation has been sent to you.</p>;
  if (resState?.ok) return <p role="status" className="rounded-xl bg-ok-tint p-4 text-ok">Your appointment has been moved. We&apos;ve sent you the new details.</p>;

  const tf = new Intl.DateTimeFormat("en-AE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Dubai" });
  const df = new Intl.DateTimeFormat("en-AE", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Dubai" });

  return (
    <div className="card p-6">
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-secondary" onClick={openReschedule}>Reschedule</button>
        <button type="button" className="btn-ghost text-alert hover:bg-alert-tint" onClick={() => setMode("cancel")}>Cancel appointment</button>
      </div>
      {mode === "cancel" && (
        <form action={cancelAction} className="mt-5 space-y-3 rounded-2xl bg-alert-tint/60 p-4">
          <input type="hidden" name="bookingId" value={bookingId} />
          <p className="text-sm text-ink">{refundText}</p>
          <label htmlFor="reason" className="field-label">Reason (optional)</label>
          <input id="reason" name="reason" className="field" maxLength={300} placeholder="Please don't include medical details" />
          {cancelState?.error && <p role="alert" className="text-sm text-alert">{ERR[cancelState.error] ?? "Something went wrong."}</p>}
          <button disabled={cancelling} className="btn btn-primary bg-alert hover:bg-alert/90">{cancelling ? "Cancelling…" : "Confirm cancellation"}</button>
        </form>
      )}
      {mode === "reschedule" && (
        <div className="mt-5">
          {!slots ? (
            <p className="text-ink-soft">Loading available times…</p>
          ) : Object.keys(slots).length === 0 ? (
            <p className="text-ink-soft">No alternative times available in the next two weeks.</p>
          ) : (
            <form action={resAction}>
              <input type="hidden" name="bookingId" value={bookingId} />
              <div className="flex gap-2 overflow-x-auto pb-2">
                {Object.keys(slots).sort().map((d) => (
                  <button key={d} type="button" onClick={() => setDay(d)} className={`shrink-0 rounded-xl border px-3 py-2 text-sm ${d === day ? "border-teal bg-teal text-white" : "border-line bg-white"}`}>
                    {df.format(new Date(`${d}T08:00:00Z`))}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {(day ? slots[day] : []).map((iso) => (
                  <button key={iso} name="startsAt" value={iso} disabled={rescheduling} className="min-h-11 rounded-xl border border-line bg-white text-sm font-medium tabular-nums hover:border-teal">
                    {tf.format(new Date(iso))}
                  </button>
                ))}
              </div>
              {resState?.error && <p role="alert" className="mt-3 text-sm text-alert">{ERR[resState.error] ?? "Something went wrong."}</p>}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
