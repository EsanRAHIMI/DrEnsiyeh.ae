# Architecture

A single **Next.js 16 (App Router) + TypeScript** application — public site, patient portal,
admin console and versioned JSON API (`/api/v1`) — over **PostgreSQL** via **Drizzle ORM**.
No microservices: background work runs as idempotent jobs triggered by cron (`/api/v1/cron/*`).

```
Browser ──► Next.js (SSR/SSG pages, server actions, route handlers)
              │  src/server/*  (domain services — pure TypeScript, unit-testable)
              │     booking/engine.ts   state machine, holds, pricing, refunds
              │     payments/gateway.ts Stripe adapter (interface → fake in tests)
              │     notifications/*     templates (whitelisted params) + outbox + channels
              │     calendar/google.ts  OAuth + reconciliation sync
              │     emr/records.ts      encrypted notes, amendments, FHIR export
              │     cms/*               block content + medical review workflow
              │     seo/*               crawler, Search Console, link suggestions
              │     compliance.ts       capability gating
              ▼
           PostgreSQL ── exclusion constraint (no overlapping bookings per provider)
                      ── triggers (signed notes immutable, audit log append-only)
External: Stripe · Google Calendar · WhatsApp Cloud API · Email/SMS · Google Maps · Search Console
```

## Key decisions

- **Correctness in the database**: `bookings_no_overlap` (GiST exclusion on provider × time range
  incl. buffers) makes double-booking impossible even under races; app logic adds friendlier errors.
- **Optimistic concurrency** on bookings (`version`) and articles (`revision`).
- **Outbox pattern** for notifications and calendar sync: writes happen in the same transaction
  as the state change; delivery is retried independently.
- **Webhook-only payment truth** with reconciliation fallback.
- **Field-level encryption** (AES-256-GCM) for clinical notes, home addresses, OAuth tokens, TOTP secrets, documents.
- **Passwordless** patients; staff add TOTP step-up (sessions are not "elevated" until verified).
- **Compliance as configuration**: every regulated feature checks `capabilityBlockers()`.
- **Privacy-first measurement**: first-party, consent-gated, aggregate; nothing to ad platforms.
- **Local dev without Docker**: PGlite (Postgres in WASM) behind a wire-protocol socket; tests use in-memory PGlite with real migrations.

## Directory map

- `src/app/(site)/[locale]/…` public site + portal (en, ar) · `src/app/admin/…` console · `src/app/api/v1/…` API
- `src/db/schema.ts`, `drizzle/*.sql` schema & migrations
- `src/content/*` verified profile, service pages, legal docs, campaigns (code-reviewed content)
- `tests/` Vitest integration tests · `e2e/` Playwright · `scripts/` dev DB, migrate, seed, worker, backups
