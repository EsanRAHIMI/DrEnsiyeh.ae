# Regulatory & commercial operating model

The platform is built so that **every regulated capability is off by default** and can only be
switched on from *Admin → Settings & compliance* once the evidence is recorded (with an approval
reference that is stored in the audit trail). Code paths enforce this through
`src/lib/compliance-model.ts` (`capabilityBlockers` / `requireCapability`).

> Nothing in this repository constitutes legal advice. Each item below must be confirmed in writing
> by the responsible party (DHA, the licensed facility, the merchant of record, counsel).

## Open decisions — must be answered before production activation

| # | Question (directive §3) | Who confirms | Platform setting it unlocks | Status |
|---|---|---|---|---|
| 1 | Which licensed healthcare entity is the service provider for each encounter? | Facility / DHA | `serviceProviderEntity`, `facilities.legalEntityName` | **Open** |
| 2 | May Dr. Rahimi independently offer consultations and collect payment? | DHA licensing + counsel | `paymentsMode=live` | **Open** |
| 3 | Is there DHA authorisation for home healthcare (doctor home visits)? | DHA (home healthcare licence of a facility) | `homeVisitsMode=enabled` + `homeHealthcareAuthorizationRef` | **Open** |
| 4 | Which facility is clinically responsible per encounter? | Facility contract | `facilities.status=verified` | **Open** |
| 5 | Who is the merchant of record? | Counsel / facility | `merchantOfRecord` | **Open** |
| 6 | Which legal entity owns the Stripe account? (must equal #5) | Finance | `stripeAccountOwnerEntity` | **Open** |
| 7 | Who issues invoices & refunds (TRN)? | Finance | invoice issuer = merchant of record | **Open** |
| 8 | Who is the legal custodian of medical records? | Facility / DHA | `recordsCustodian`, `emrMode` | **Open** |
| 9 | Health-data hosting & retention requirements (Federal Law No. 2 of 2019 on ICT in health fields; DHA policies) — is in-country hosting with approved provider in place? | Counsel / hosting provider | `HEALTH_DATA_HOSTING_APPROVED=true` (env) for `emrMode=native` | **Open** |
| 10 | Do facility contracts permit external booking, payment and record management? | Facility | `facilityContractPermitsExternalBooking` | **Open** |
| 11 | Is a DHA advertising permit required for the website/ads content? | DHA | `dhaAdvertisingPermitRef`; campaign `approvedRef` | **Open** |
| 12 | Is insurance billing supported? | Facility | `insuranceBilling` (currently `excluded`, self-pay) | **Open** |

## How each regulated feature behaves until approved

| Feature | Behaviour while blocked |
|---|---|
| Online payments | Bookings become **requests** ("pay at facility"); facility staff confirm. Stripe **test mode** works only with an `sk_test_` key. Live keys are refused outside production, and live webhook events are rejected unless `paymentsMode=live`. |
| Home visits | Hidden from booking; page explains that home visits open once authorised. API returns `home_visits_disabled`. Home visits always require prepayment. |
| Clinical records | `emrMode=disabled`: nothing clinical is stored; the patient portal says records aren't available online. `document_reference`: only patient-facing visit summaries / follow-up instructions and references into the facility EMR (the facility EMR stays authoritative). `native`: full structured notes — requires hosting approval flag. |
| WhatsApp | Only approved templates via the official Cloud API; disabled/sandbox until the WABA and templates are approved. |
| Ad pixels / conversion APIs | Not loaded anywhere. Cannot be enabled from the UI. |
| Unverified facilities, services, zones, prices | Seeded as `isDemo` / `pending_verification`. Staging shows a banner; **production never serves demo rows** (`src/server/catalog.ts`). |

## Built-in safeguards (independent of approvals)

- A booking is **never** confirmed by the payment redirect; only the signature-verified Stripe
  webhook (or reconciliation job reading Stripe directly) moves money state, and facility
  confirmation rules decide `confirmed` vs `awaiting_confirmation`.
- Manual capture: payment is authorised at checkout and **captured only on facility confirmation**;
  declines release the authorisation.
- Neutral payment descriptor ("Medical consultation"), neutral calendar titles
  ("Medical Appointment — Booking #DR-XXXXXX") and template-whitelisted notifications — no
  diagnoses, service names that reveal a condition, or clinical notes leave the system.
- No health data to advertising platforms: no pixels, no conversion APIs, no customer match,
  no disease-based audiences. First-party attribution stores only UTM fields and click-platform
  *presence* (never the click id), and only with analytics consent.
- Emergency guidance precedes every booking (red-flag gate → "call 998"), on every service page and
  in the footer. It is not a symptom checker and makes no diagnosis.
- Medical content requires the doctor's approval per revision; edits to approved content stay
  unpublished until re-approved; review-due dates generate tasks.

## Consent records

Every consent (cookie banner, booking policy acceptance, WhatsApp opt-in, marketing messages) is an
append-only row in `consents` with the document version and source. Policy documents are versioned
(`src/content/legal.ts`); draft legal documents render `noindex` with a "pending legal review" badge.
