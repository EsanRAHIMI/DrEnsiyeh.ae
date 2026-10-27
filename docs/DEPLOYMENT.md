# Deployment

## Environments

| Env | Purpose | `DEPLOY_ENV` | Indexing | Payments |
|---|---|---|---|---|
| local | development | `development` | noindex | disabled / Stripe test |
| staging | QA, UAT, doctor review | `staging` | noindex + robots disallow | Stripe **test** only |
| production | patients | `production` | indexable (reviewed locales) | live only when COMPLIANCE.md items 1–10 approved |

## Hosting requirements (healthcare data)

- Health-related personal data should be hosted in the UAE (Federal Law No. 2 of 2019 and DHA
  policy) — e.g. a UAE region of a major cloud (Azure UAE North, AWS me-central-1, Oracle Dubai,
  G42/Core42). Confirm with counsel before setting `HEALTH_DATA_HOSTING_APPROVED=true`.
- Managed PostgreSQL 15+ with `btree_gist`, encryption at rest, automated backups + PITR (≥ 35 days).
- Object storage for documents (encrypted at rest; the app also encrypts each file).
- Secrets in the platform secret manager — never in the repo or images.

## Release steps

1. Create the database; set env vars from `.env.example` (generate secrets with `openssl rand -base64 32`).
2. `npm run db:migrate` (idempotent; run on every release before switching traffic).
3. Staging only: `npm run db:seed` (demo rows are flagged and never served in production).
4. Build the image: `docker build --build-arg DATABASE_URL=... -t drensiyeh-web .`
   (public pages are pre-rendered at build time from the catalogue).
5. Run the container behind HTTPS (TLS 1.2+), health check `/api/v1/health`.
6. Schedule jobs (cron/K8s CronJob or `npm run worker` on a single host), all `POST /api/v1/cron/<job>`
   with `Authorization: Bearer $CRON_SECRET`:
   - `holds` every minute · `notifications` every 15 s–1 min · `calendar` every 5 min ·
     `reconcile` every 10 min · `content` every 15 min · `daily-summary` 07:00 Dubai ·
     `seo-crawl` daily · `search-console` daily.
7. Smoke test: `/api/v1/health`, home, booking flow to the request step, admin sign-in with MFA.

## Third-party setup checklists

**Stripe** (merchant-of-record's own account): enable AED, cards, Apple Pay (verify domain), Google Pay;
set statement descriptor neutral (e.g. "DRENSIYEH CLINIC"); webhook endpoint
`/api/v1/webhooks/stripe` with events `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.expired`, `payment_intent.payment_failed`, `charge.refunded`. Use test keys on staging.

**Google Calendar**: OAuth client (Web), redirect `https://<host>/api/v1/calendar/oauth/callback`,
scopes `calendar.events`, `calendar.freebusy`. Connect from Admin → Settings (tech admin, MFA).

**WhatsApp Business Platform**: WABA + phone number; submit utility templates named in
`src/server/notifications/templates.ts` (`booking_confirmed_v1`, …) with body parameters in the
declared order; webhook `/api/v1/webhooks/whatsapp` (verify token + app secret).

**Email**: transactional provider with SPF, DKIM, DMARC on drensiyeh.ae.

**Search Console / Bing**: verify `sc-domain:drensiyeh.ae`; add the service account as a user;
submit `/sitemap.xml`.

## DNS (requires explicit authorisation — not changed by this project)

When authorised: apex + `www` → hosting; `staging.drensiyeh.ae` → staging; email records
(SPF/DKIM/DMARC); Apple Pay domain verification file; CAA for the TLS issuer. Redirect `www` → apex.
