/**
 * Campaign landing pages. Claims must match the approved ad copy and the DHA advertising permit.
 * Variants differ only in presentation (headline wording, CTA order) — never in medical claims,
 * emergency guidance, pricing or legal disclosures.
 */
export type Campaign = {
  slug: string;
  serviceArea?: string; // service-area slug for context
  kind: "clinic" | "home_visit";
  variants: Record<"A" | "B", { headline: string; sub: string; cta: string }>;
  points: string[];
  approvedRef: string | null; // DHA advertising permit / internal approval reference
};

export const CAMPAIGNS: Campaign[] = [
  {
    slug: "infectious-disease-specialist-dubai",
    kind: "clinic",
    variants: {
      A: { headline: "See an infectious diseases specialist in Dubai", sub: "Clear prices, live availability and secure online booking.", cta: "See available times" },
      B: { headline: "Infections that keep coming back? Get a specialist view.", sub: "Book an in-clinic consultation online in a few minutes.", cta: "Book a consultation" },
    },
    points: ["Specialist in infectious diseases", "Consultations in English and Persian", "Transparent pricing before you book", "Secure patient account — no passwords"],
    approvedRef: null,
  },
  {
    slug: "doctor-home-visit-dubai",
    kind: "home_visit",
    variants: {
      A: { headline: "A specialist doctor visit at home", sub: "Scheduled, non-emergency home visits within the Dubai service area.", cta: "Check your address" },
      B: { headline: "Can't get to the clinic? The doctor can come to you.", sub: "Check eligibility and see the full price before booking.", cta: "Check eligibility" },
    },
    points: ["Infectious diseases specialist", "Instant service-area check", "Full price shown upfront", "Not an emergency service"],
    approvedRef: null,
  },
];

export const getCampaign = (slug: string) => CAMPAIGNS.find((c) => c.slug === slug);
