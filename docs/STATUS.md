# Implementation status

Last updated 27 Oct 2026. Legend — **Implemented**: code exists · **Tested**: automated tests pass ·
**Deployed**: running on a hosted environment · **Approved**: regulatory/business sign-off recorded ·
**Live**: serving real patients.

Nothing is **Deployed**, **Approved** or **Live** yet: no hosting, credentials, DNS or
authorisations have been provided. Everything below was verified locally against a production
build (`next build && next start`) and a real Postgres engine (PGlite).

| Area | Implemented | Tested | Notes / blockers |
|---|---|---|---|
| Public website (Home, About, Qualifications, Services + 6 service pages, Clinic visit, Home visit, Locations, Patient info, Articles, FAQ, Contact, Login, Register, 6 legal pages, campaign landing pages) | ✅ | ✅ E2E + axe | Service-page medical copy awaits doctor review (pages noindex until approved) |
| Design system (tokens, typography, components, RTL, reduced motion) | ✅ | ✅ axe WCAG 2.2 AA, 0 serious/critical on 13 pages × desktop & mobile | Approved photography pending usage rights |
| Booking engine (slots, holds, expiry, buffers, travel buffers, conflict detection, idempotency, state machine, reschedule, cancel, refunds policy, no-show, staff override + audit) | ✅ | ✅ 21 integration tests incl. 8-way concurrency | DB exclusion constraint is the final arbiter |
| Home visits (zones, eligibility, surcharge, travel buffer, map/geo picker) | ✅ | ✅ | **Disabled** until DHA home-healthcare authorisation (COMPLIANCE.md #3) |
| Stripe Checkout (AED, cards/Apple Pay/Google Pay via dynamic methods, manual capture on confirmation, webhooks w/ signature + idempotency, refunds full/partial, reconciliation, invoices, fees) | ✅ | ✅ with fake gateway; webhook signature path not exercised against Stripe | Needs test keys to run against Stripe test mode; **live blocked** (#2, #5, #6) |
| Passwordless auth (email OTP + magic link, rate limits, lockout), sessions, staff TOTP MFA | ✅ | ✅ unit + E2E | SMS/WhatsApp OTP channel ready once providers configured |
| Automatic account creation & safe linking | ✅ | ✅ | Clinical visibility requires in-person identity verification |
| Patient portal (appointments, reschedule, cancel, payments, invoices, records, settings, consents, data requests, sign-out everywhere) | ✅ | ✅ E2E (booking visible, records gated) | |
| Clinical records (encrypted notes, sign, immutable after sign via DB trigger, amendments, documents w/ encrypted storage + signed URLs, FHIR R4 export) | ✅ | ✅ | **Disabled** until custodian/hosting decisions (#8, #9) |
| Admin portal (dashboard, appointments, patients, schedule, pricing/facilities/zones, payments, CMS, SEO, analytics, settings/compliance, users/roles, audit) | ✅ | ✅ E2E doctor MFA + confirm | |
| RBAC (6 staff roles, least privilege, no clinical for reception/marketing/finance/tech) | ✅ | ✅ | |
| Google Calendar (OAuth, encrypted refresh token, neutral events, update/delete, free/busy import, retries, alerts) | ✅ | ✅ with mocked Google API | Needs OAuth client + doctor consent |
| WhatsApp/Email/SMS notifications (templates w/ param whitelist, outbox, dedupe, retries, quiet hours, escalation, delivery webhook) | ✅ | ✅ | Needs WABA + approved templates (names in `templates.ts`), email & SMS provider keys |
| CMS (block editor, revisions, medical review workflow, scheduling, SEO fields, references, redirects on slug change, preview, link suggestions, review-due tasks) | ✅ | ✅ | |
| SEO (SSR/SSG, metadata, canonical, hreflang for reviewed locales, sitemap, robots, JSON-LD Physician/MedicalWebPage/FAQ/Breadcrumb, redirects) | ✅ | ✅ | Indexing only when `DEPLOY_ENV=production` |
| GEO (`/llms.txt`, entity JSON-LD, concise FAQs, citations, review dates) | ✅ | manual | |
| SEO operations (crawler: titles, descriptions, canonical, h1, alt, broken links, duplicates; Search Console import; RUM Core Web Vitals; editorial tasks; content gaps) | ✅ | ✅ (HTML inspector) | Needs Search Console service-account access |
| Marketing attribution (consent-gated UTM, funnel, campaigns, A/B landing pages, ad-spend CSV import, CPA, net contribution) | ✅ | ✅ (no-PHI checks) | Ad-platform cost APIs require account access |
| i18n (EN published; AR implemented, RTL, noindex until reviewed) | ✅ | ✅ axe | Persian locale not yet added (needs reviewed translations) |
| Security headers/CSP/HSTS, field encryption, audit trail (append-only), rate limiting, CSRF (server actions + SameSite), zod validation | ✅ | partial | Pen-test and ASVS L2 review recommended before launch |
| CI (lint, typecheck, unit, audit, migrate, build, E2E, a11y, gitleaks), Dependabot, Dockerfile, staging compose, backups | ✅ | lint/type/test/build run locally | GitHub repo + runners not yet configured |

## Measured performance (local production build, Lighthouse 13.5, mobile emulation, simulated throttling)

| Page | Performance | Accessibility | Best practices | SEO* | LCP (lab) | TBT | CLS |
|---|---|---|---|---|---|---|---|
| /en | 95 | 100 | 100 | 66 | 2.9 s | 80 ms | 0 |
| /en/clinic-visit | 96 | 100 | 100 | 66 | 2.8 s | 30 ms | 0 |
| /en/book | 95 | 100 | 100 | 66 | 2.8 s | 70 ms | 0 |
| /en/services/travel-related-infections | 96 | 100 | 100 | 66 | 2.8 s | 40 ms | 0 |

\* SEO 66 is solely `is-crawlable`: non-production builds deliberately send `noindex`.
Lab LCP (2.8–2.9 s under Lighthouse's simulated slow 4G) is above the 2.5 s target; the target is
defined at the field 75th percentile, which the RUM collector (`/api/v1/vitals` → Admin → SEO) will
measure once deployed. Not yet measured: field data, INP (needs real interactions), server TTFB on
production hosting.

## Test inventory

- `npm test` — 48 integration tests (Vitest + real Postgres via PGlite): booking concurrency,
  idempotency, holds, webhooks, refunds, lost-slot auto-release, home-visit gating, auth, TOTP,
  encryption, RBAC, compliance gating, clinical record immutability, CMS workflow, notification
  privacy/dedupe/retry/quiet hours, calendar privacy, SEO inspector.
- `npm run e2e` — 31 Playwright tests: Scenario A (guest booking → emailed code → portal) and D
  (doctor sign-in → MFA enrolment → confirm), axe WCAG 2.2 AA on 13 pages (desktop + mobile),
  mobile overflow.

Directive scenarios B (home visit), C (returning patient follow-up with payment), E (CMS publish via
UI) and F (ad visitor attribution) are covered at the integration level but not yet as browser E2E;
B and the payment legs of A/C need Stripe test keys and the home-visit authorisation flag.
