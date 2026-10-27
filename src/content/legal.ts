/**
 * Legal documents. DRAFT TEMPLATES prepared for counsel review — they must be reviewed by a
 * UAE-qualified lawyer and completed with the verified legal entity details (merchant of record,
 * licensed facility, data controller) before production launch. See docs/COMPLIANCE.md.
 */
export type LegalDoc = { slug: string; title: string; version: string; sections: { h: string; p: string[] }[] };

const ENTITY = "[Legal entity — to be confirmed]";

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "privacy",
    title: "Privacy policy",
    version: "2026-10-draft",
    sections: [
      { h: "Who we are", p: [`This website is operated by ${ENTITY} ("we"). Clinical services are provided by the licensed healthcare facility named in your booking.`] },
      { h: "What we collect", p: ["Booking details (name, contact details, appointment time and location), payment status (never full card numbers — payments are processed by Stripe), account sign-in records, and, where authorised, documents and visit summaries shared with you by the doctor.", "With your consent, aggregate first-party analytics about how visitors use the site."] },
      { h: "How we use it", p: ["To arrange and manage appointments, process payments and refunds, send service messages, meet legal obligations and keep the service secure."] },
      { h: "What we never do", p: ["We do not share health information, appointment types or contact details with advertising platforms, and we do not build advertising audiences from health data.", "We do not include diagnoses or clinical details in email, SMS or WhatsApp messages."] },
      { h: "Where data is stored", p: ["Health-related data is stored in accordance with UAE health-data law, including Federal Law No. 2 of 2019 on the use of ICT in health fields, and applicable Dubai Health Authority requirements."] },
      { h: "Retention", p: ["Medical records are retained for the period required by UAE law. Other data is kept only as long as needed for the purposes above."] },
      { h: "Your rights", p: ["You can request access, correction or deletion of your data from your account (Privacy settings), subject to legal retention obligations for medical and financial records."] },
      { h: "Contact", p: ["For privacy questions, contact the practice through your patient account or the contact page."] },
    ],
  },
  {
    slug: "terms",
    title: "Terms of service",
    version: "2026-10-draft",
    sections: [
      { h: "The service", p: ["This website lets you view information about the doctor, request and book appointments, and manage your account. It is not an emergency service."] },
      { h: "Bookings", p: ["A booking is confirmed only when you receive a confirmation message. Appointment times are held briefly while you complete your booking."] },
      { h: "Payments", p: [`Where online payment is offered, the merchant of record is ${ENTITY}. Payments are processed securely by Stripe.`] },
      { h: "Medical advice", p: ["Content on this website is general information and does not replace an individual consultation."] },
      { h: "Governing law", p: ["These terms are governed by the laws of the Emirate of Dubai and the federal laws of the UAE."] },
    ],
  },
  {
    slug: "cancellation-refund",
    title: "Cancellation & refund policy",
    version: "2026-10-draft",
    sections: [
      { h: "Cancelling", p: ["You can cancel from your patient account. The cancellation window and refund percentage for each location are shown before you pay and in your booking confirmation."] },
      { h: "Refunds", p: ["Eligible refunds are returned to the original payment method. Banks usually take 5–10 business days to show the refund.", "If the facility or doctor cancels, you receive a full refund."] },
      { h: "Rescheduling", p: ["You can move your appointment to another available time from your account. Rescheduled appointments may need to be re-confirmed by the facility."] },
      { h: "Missed appointments", p: ["Appointments missed without notice may not be refundable."] },
    ],
  },
  {
    slug: "medical-disclaimer",
    title: "Medical disclaimer",
    version: "2026-10-draft",
    sections: [
      { h: "General information only", p: ["Information on this website is educational and does not constitute medical advice, diagnosis or treatment for any individual."] },
      { h: "Emergencies", p: ["If you think you may have a medical emergency, call 998 or go to the nearest emergency department immediately. Do not use online booking or home visits for emergencies."] },
      { h: "No doctor–patient relationship", p: ["Reading this website does not create a doctor–patient relationship."] },
    ],
  },
  {
    slug: "cookies",
    title: "Cookies & consent",
    version: "2026-10",
    sections: [
      { h: "Strictly necessary", p: ["Session sign-in, security and your consent choice. These cannot be switched off."] },
      { h: "Aggregate analytics (optional)", p: ["First-party, anonymous statistics about visits and the booking funnel. No third-party analytics or session recording is used on booking, account or medical pages."] },
      { h: "Advertising (off)", p: ["Third-party advertising pixels are not used. If this changes, they would only run on public marketing pages with your explicit consent, and never receive health information."] },
    ],
  },
  {
    slug: "accessibility",
    title: "Accessibility",
    version: "2026-10",
    sections: [
      { h: "Our commitment", p: ["We aim to meet WCAG 2.2 level AA. The site supports keyboard navigation, screen readers, text resizing, reduced motion and right-to-left languages."] },
      { h: "Feedback", p: ["If you have difficulty using any part of the site, please contact us and we will help you book by another means."] },
    ],
  },
];

export const getLegalDoc = (slug: string) => LEGAL_DOCS.find((d) => d.slug === slug);
