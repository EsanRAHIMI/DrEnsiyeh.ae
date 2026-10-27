# Acquisition, advertising & GEO playbook

## Healthcare advertising rules built into the platform

- **No third-party pixels or conversion APIs** are loaded (CSP also blocks them). Measurement is first-party,
  consent-gated and aggregate (Admin → Analytics).
- Never send names, emails, phones, appointment types, diagnoses or booking details to Google Ads,
  Meta, LinkedIn, TikTok or Snapchat. No customer-match uploads, no remarketing on health conditions.
- Campaign landing pages (`/[locale]/lp/<slug>`, `src/content/campaigns.ts`) are `noindex`, share the
  same claims as approved ad copy, show emergency guidance, and A/B-test **only** wording/layout.
- Record the DHA advertising permit reference per campaign (`approvedRef`) before launch.
- Platform policies: Google Ads healthcare & personalised-ads restrictions, Meta health-data restrictions
  (custom events about health are blocked), LinkedIn/TikTok/Snapchat sensitive-category rules — use
  URL-level UTM tagging and platform-side click metrics; import cost via CSV or authorised reporting APIs.

## UTM convention

`utm_source` = platform (google, meta, linkedin, tiktok, snapchat) · `utm_medium` = cpc / paid_social ·
`utm_campaign` = `<service>-<geo>-<yyyymm>` (no condition names in campaign ids visible to users) ·
`utm_content` = ad variant.

## GEO / AI-search strategy

1. Entity clarity: one consistent name ("Dr. Ensiyeh Rahimi"), title from the DHA licence, Physician
   JSON-LD with `sameAs`, `/llms.txt` summary, consistent directory listings (VERIFICATION.md).
2. Answer-first content: each article/service page opens with a 2–3 sentence direct answer, then
   detail; FAQs with concise answers (FAQPage schema only where genuinely Q&A).
3. Provenance: author, medical reviewer, review date and references on every article.
4. Freshness: review-due dates (default 12 months) create editorial tasks automatically.
5. Quality over volume: no mass-generated pages; content gaps from Search Console become *briefs*
   for the doctor, never auto-published text. GEO cannot guarantee inclusion in AI answers.

## Initial editorial calendar (drafts for medical review)

- Preparing for your infectious disease consultation (seeded draft)
- Recurrent UTIs: when to see a specialist
- Fever after travel: what to do
- Antibiotic resistance: why "just in case" antibiotics can harm
- Pre-travel vaccines for UAE residents
- Understanding hepatitis B and C test results
