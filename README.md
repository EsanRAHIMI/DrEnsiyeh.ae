# DrEnsiyeh.ae — practice platform

Website, booking, payments, patient portal, clinical records, CMS and practice administration for
**Dr. Ensiyeh Rahimi**, Infectious Diseases Specialist, Dubai.

> Regulated features (live payments, home visits, clinical records, WhatsApp) are **disabled until
> authorised** — see [docs/COMPLIANCE.md](docs/COMPLIANCE.md). Current state: [docs/STATUS.md](docs/STATUS.md).

## Quick start (no Docker needed)

```bash
npm install
cp .env.example .env.local     # fill the secrets (see comments)
npm run db:dev                 # terminal 1: local Postgres (PGlite) on :5433
npm run db:migrate && npm run db:seed
npm run dev                    # http://localhost:3000
npm run worker                 # optional: background jobs (notifications, holds, calendar…)
```

Seeded staff sign in at `/en/login` with `SEED_DOCTOR_EMAIL` / `SEED_ADMIN_EMAIL`. Codes are printed to the
server console (or `.data/outbox.jsonl` with `EMAIL_TRANSPORT=file`). Staff enrol an authenticator app on first sign-in.

## Scripts

| Command | |
|---|---|
| `npm test` | integration tests (real Postgres engine in memory) |
| `npm run e2e` | Playwright E2E + axe accessibility (needs a running server) |
| `npm run lint` / `npm run typecheck` | static checks |
| `npm run db:generate` | new migration from `src/db/schema.ts` |
| `scripts/backup.sh` / `scripts/restore.sh` | encrypted backups |

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Compliance & blockers](docs/COMPLIANCE.md) ·
[Source verification](docs/VERIFICATION.md) · [Deployment](docs/DEPLOYMENT.md) ·
[Operations](docs/OPERATIONS.md) · [Marketing & GEO](docs/MARKETING.md) · [Status](docs/STATUS.md)
