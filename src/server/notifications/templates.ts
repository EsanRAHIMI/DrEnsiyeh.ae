/**
 * Notification templates. Each declares the ONLY parameters it may carry.
 * Parameters are privacy-safe by construction: booking reference, local date/time,
 * location display name, a dashboard link. Never diagnoses, symptoms, service names
 * that reveal a condition, or clinical notes.
 */
export type TemplateId =
  | "booking_awaiting_confirmation"
  | "booking_requested"
  | "booking_confirmed"
  | "booking_rescheduled"
  | "booking_cancelled"
  | "booking_reminder"
  | "home_visit_coordination"
  | "payment_received"
  | "refund_issued"
  | "follow_up_reminder"
  | "login_code"
  | "account_ready"
  | "staff_new_booking"
  | "staff_daily_summary"
  | "ops_alert";

type Def = { params: readonly string[]; whatsappTemplate?: string; subject: (p: Record<string, string>) => string; text: (p: Record<string, string>) => string };

const dash = (p: Record<string, string>) => (p.link ? `\n\nOpen your secure dashboard: ${p.link}` : "");

export const TEMPLATES: Record<TemplateId, Def> = {
  booking_awaiting_confirmation: {
    params: ["reference", "when", "location", "link"],
    whatsappTemplate: "booking_received_v1",
    subject: (p) => `Appointment request received — #${p.reference}`,
    text: (p) => `We have received your appointment request #${p.reference} for ${p.when} (${p.location}). It is not yet confirmed — you will hear from us once the facility confirms.${dash(p)}`,
  },
  booking_requested: {
    params: ["reference", "when", "location", "link"],
    whatsappTemplate: "booking_received_v1",
    subject: (p) => `Appointment request received — #${p.reference}`,
    text: (p) => `Your appointment request #${p.reference} for ${p.when} (${p.location}) has been received and is awaiting confirmation. Payment is collected at the facility.${dash(p)}`,
  },
  booking_confirmed: {
    params: ["reference", "when", "location", "link"],
    whatsappTemplate: "booking_confirmed_v1",
    subject: (p) => `Appointment confirmed — #${p.reference}`,
    text: (p) => `Your appointment #${p.reference} is confirmed for ${p.when} at ${p.location}.${dash(p)}`,
  },
  booking_rescheduled: {
    params: ["reference", "when", "location", "link"],
    whatsappTemplate: "booking_rescheduled_v1",
    subject: (p) => `Appointment rescheduled — #${p.reference}`,
    text: (p) => `Appointment #${p.reference} has been moved to ${p.when} (${p.location}).${dash(p)}`,
  },
  booking_cancelled: {
    params: ["reference", "link"],
    whatsappTemplate: "booking_cancelled_v1",
    subject: (p) => `Appointment cancelled — #${p.reference}`,
    text: (p) => `Appointment #${p.reference} has been cancelled. Any eligible refund will be processed to the original payment method.${dash(p)}`,
  },
  booking_reminder: {
    params: ["reference", "when", "location", "link"],
    whatsappTemplate: "booking_reminder_v1",
    subject: (p) => `Reminder: appointment #${p.reference}`,
    text: (p) => `Reminder: your appointment #${p.reference} is on ${p.when} at ${p.location}.${dash(p)}`,
  },
  home_visit_coordination: {
    params: ["reference", "when", "link"],
    whatsappTemplate: "home_visit_update_v1",
    subject: (p) => `Home visit update — #${p.reference}`,
    text: (p) => `There is an update about your home visit #${p.reference} scheduled for ${p.when}.${dash(p)}`,
  },
  payment_received: {
    params: ["reference", "amount", "link"],
    whatsappTemplate: "payment_received_v1",
    subject: (p) => `Payment received — #${p.reference}`,
    text: (p) => `We received your payment of ${p.amount} for booking #${p.reference}. Your receipt is available in your dashboard.${dash(p)}`,
  },
  refund_issued: {
    params: ["reference", "amount", "link"],
    whatsappTemplate: "refund_issued_v1",
    subject: (p) => `Refund issued — #${p.reference}`,
    text: (p) => `A refund of ${p.amount} for booking #${p.reference} has been issued. It may take 5–10 business days to appear.${dash(p)}`,
  },
  follow_up_reminder: {
    params: ["link"],
    whatsappTemplate: "follow_up_reminder_v1",
    subject: () => `A follow-up is recommended`,
    text: (p) => `Your doctor has recommended a follow-up appointment.${dash(p)}`,
  },
  login_code: {
    params: ["code", "link"],
    whatsappTemplate: "login_code_v1",
    subject: () => `Your sign-in code`,
    text: (p) => `Your sign-in code is ${p.code}. It expires in 10 minutes. If you did not request it, ignore this message.${p.link ? `\n\nOr sign in with this link: ${p.link}` : ""}`,
  },
  account_ready: {
    params: ["reference", "link"],
    subject: () => `Your patient account is ready`,
    text: (p) => `Your secure patient account has been prepared for booking #${p.reference}. Sign in with a one-time code — we never send passwords.${dash(p)}`,
  },
  staff_new_booking: {
    params: ["reference", "when", "location", "status", "link"],
    whatsappTemplate: "staff_new_booking_v1",
    subject: (p) => `New appointment #${p.reference} (${p.status})`,
    text: (p) => `New appointment #${p.reference} — ${p.when}, ${p.location}. Status: ${p.status}.${dash(p)}`,
  },
  staff_daily_summary: {
    params: ["date", "count", "pending", "link"],
    subject: (p) => `Daily summary — ${p.date}`,
    text: (p) => `${p.count} appointments today, ${p.pending} awaiting confirmation.${dash(p)}`,
  },
  ops_alert: {
    params: ["kind", "detail"],
    subject: (p) => `Operations alert: ${p.kind}`,
    text: (p) => `${p.kind}: ${p.detail}`,
  },
};

export class TemplateParamError extends Error {}

/** Rejects any parameter not declared by the template (defence against leaking clinical data). */
export function validateParams(template: TemplateId, params: Record<string, string>) {
  const allowed = new Set(TEMPLATES[template].params);
  for (const k of Object.keys(params)) {
    if (!allowed.has(k)) throw new TemplateParamError(`Parameter "${k}" is not allowed in template ${template}`);
  }
}

export function render(template: TemplateId, params: Record<string, string>) {
  const def = TEMPLATES[template];
  return { subject: def.subject(params), text: def.text(params), whatsappTemplate: def.whatsappTemplate };
}
