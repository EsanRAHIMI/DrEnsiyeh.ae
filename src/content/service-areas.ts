/**
 * Service-area pages, mapped to the areas of focus listed on the doctor's hospital profile.
 *
 * MEDICAL CONTENT — status "pending_review": general, conservative educational copy drafted by
 * the build team. Each page must be reviewed and approved by Dr. Ensiyeh Rahimi before it is
 * indexed. Until `medicallyReviewedAt` is set, pages render with noindex and a review notice.
 */
export type ServiceArea = {
  slug: string;
  title: string;
  summary: string;
  intro: string;
  whenToSee: string[];
  whatToExpect: string[];
  faqs: { q: string; a: string }[];
  references: { title: string; url: string }[];
  medicallyReviewedAt: string | null;
  reviewer: string | null;
};

export const SERVICE_AREAS: ServiceArea[] = [
  {
    slug: "recurrent-urinary-tract-infections",
    title: "Recurrent urinary tract infections",
    summary: "Assessment when UTIs keep returning, or don't settle with the usual treatment.",
    intro:
      "Some people experience urinary tract infections again and again. A specialist review looks at previous urine cultures, the antibiotics used and possible contributing factors, to plan treatment and prevention that fits you.",
    whenToSee: [
      "Repeated urinary infections over the past months",
      "Infections that return soon after finishing antibiotics",
      "Urine cultures showing bacteria resistant to common antibiotics",
      "Uncertainty about whether ongoing symptoms are due to infection",
    ],
    whatToExpect: [
      "A detailed history and review of previous results and treatments",
      "Advice on which tests, if any, are needed",
      "A treatment and prevention plan agreed with you",
    ],
    faqs: [
      { q: "Should I bring my previous urine culture reports?", a: "Yes. Previous culture and sensitivity reports help guide the choice of treatment." },
    ],
    references: [{ title: "WHO — Antimicrobial resistance fact sheet", url: "https://www.who.int/news-room/fact-sheets/detail/antimicrobial-resistance" }],
    medicallyReviewedAt: null,
    reviewer: null,
  },
  {
    slug: "persistent-unexplained-fever",
    title: "Persistent or unexplained fever",
    summary: "A structured evaluation when a fever lasts longer than expected without a clear cause.",
    intro:
      "A fever that continues without an obvious explanation can be worrying. An infectious diseases specialist takes a systematic approach — reviewing your history, travel, exposures and previous tests — to decide on the next steps.",
    whenToSee: [
      "Fever lasting longer than expected despite initial assessment",
      "Recurring fevers without a clear diagnosis",
      "Fever after recent travel",
    ],
    whatToExpect: ["A thorough history including travel and exposures", "Review of existing test results", "A clear plan for further investigation where needed"],
    faqs: [
      {
        q: "When is fever an emergency?",
        a: "Seek emergency care immediately (call 998) for fever with confusion, a stiff neck, difficulty breathing, a rapidly spreading rash, or if you feel severely unwell.",
      },
    ],
    references: [],
    medicallyReviewedAt: null,
    reviewer: null,
  },
  {
    slug: "travel-related-infections",
    title: "Travel medicine & travel-related infections",
    summary: "Advice before you travel, and assessment of illness after returning.",
    intro:
      "Travel can expose you to infections not commonly seen at home. Consultations cover pre-travel advice, including adult vaccinations, and evaluation of symptoms that start during or after a trip.",
    whenToSee: ["Planning travel and need advice on vaccinations or preventive measures", "Fever or other symptoms after returning from travel", "Ongoing symptoms after an illness abroad"],
    whatToExpect: ["Review of your itinerary or recent travel", "Personalised preventive advice", "Assessment and testing for post-travel illness where needed"],
    faqs: [{ q: "How early should I seek pre-travel advice?", a: "Ideally several weeks before departure, as some vaccines need time or multiple doses." }],
    references: [{ title: "WHO — International travel and health", url: "https://www.who.int/health-topics/travel-and-health" }],
    medicallyReviewedAt: null,
    reviewer: null,
  },
  {
    slug: "antibiotic-resistant-infections",
    title: "Antibiotic-resistant infections",
    summary: "Specialist guidance when infections are caused by resistant organisms.",
    intro:
      "When laboratory results show that bacteria are resistant to commonly used antibiotics, treatment choices need careful thought. Antimicrobial stewardship means using the right antibiotic, at the right dose, for the right duration.",
    whenToSee: ["Culture results showing resistant bacteria", "Infections not improving despite antibiotics", "Questions about the appropriate use of antibiotics"],
    whatToExpect: ["Review of laboratory results and treatment history", "A tailored, stewardship-based treatment plan", "Follow-up to check response"],
    faqs: [],
    references: [{ title: "WHO — Antimicrobial resistance fact sheet", url: "https://www.who.int/news-room/fact-sheets/detail/antimicrobial-resistance" }],
    medicallyReviewedAt: null,
    reviewer: null,
  },
  {
    slug: "complex-and-recurrent-infections",
    title: "Complex & recurrent infections",
    summary: "Skin and soft-tissue, respiratory and other infections that are recurrent or hard to treat.",
    intro:
      "Some infections are complicated by other health conditions or keep returning. A specialist assessment brings together your history, previous treatments and results to agree a coordinated plan.",
    whenToSee: ["Recurrent skin or soft-tissue infections", "Respiratory infections that are frequent or slow to resolve", "Infections in the context of other medical conditions, such as diabetes"],
    whatToExpect: ["A comprehensive review of your history", "Coordination with your other doctors where appropriate", "A clear written plan"],
    faqs: [],
    references: [],
    medicallyReviewedAt: null,
    reviewer: null,
  },
  {
    slug: "hiv-sti-and-hepatitis-care",
    title: "HIV, sexually transmitted infections & viral hepatitis",
    summary: "Confidential testing advice, assessment and management.",
    intro:
      "Consultations about HIV, sexually transmitted infections and viral hepatitis are handled with discretion. The doctor can advise on testing and discuss assessment and management options available in Dubai.",
    whenToSee: ["Questions about testing after a possible exposure", "A recent positive or unclear test result", "Ongoing management and monitoring"],
    whatToExpect: ["A confidential, non-judgemental consultation", "Clear advice on testing and next steps", "Information on management and follow-up"],
    faqs: [
      {
        q: "Will the reason for my visit appear in messages or on my card statement?",
        a: "No. Booking messages and payment descriptions use neutral wording and a booking reference only.",
      },
    ],
    references: [],
    medicallyReviewedAt: null,
    reviewer: null,
  },
];

export const getServiceArea = (slug: string) => SERVICE_AREAS.find((a) => a.slug === slug);
