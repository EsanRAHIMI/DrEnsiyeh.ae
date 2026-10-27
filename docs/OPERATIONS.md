# Operations runbook

## Monitoring & alerts

- `/api/v1/health` (DB reachability) — uptime monitor every minute.
- Ops alerts (email to `OPS_ALERT_EMAIL`): failed notification after 6 attempts, calendar sync
  failure/revocation, unexpected live Stripe events. Admin dashboard banners show the same.
- Admin → Settings → Notifications lists failed deliveries; Admin → SEO shows crawl issues and
  real-user Core Web Vitals (p75).
- Logs never contain clinical content, tokens or codes (errors log messages only).

## Recovery of automated processes (all idempotent)

| Symptom | Action |
|---|---|
| Webhook outage | Nothing to do: `reconcile` asks Stripe for open checkouts > 40 min and applies results through the same handlers. |
| Paid but slot lost (hold lapsed) | Automatic: authorisation released / refund issued, patient notified, audit entry `booking.slot_lost_after_payment`. |
| Calendar out of sync | Reconnect in Settings; dirty links are retried (up to 10 attempts each). The database is authoritative. |
| Notification provider down | Outbox retries with exponential backoff; re-queue by setting `status='queued'` for affected rows. |

## Backups & disaster recovery

- Primary: managed PITR (RPO ≤ 5 min, RTO ≤ 4 h target).
- Secondary: `scripts/backup.sh` nightly encrypted (`gpg` AES-256) logical dumps, 35-day retention, stored in a separate account/region within the UAE.
- **Monthly restore test**: `scripts/restore.sh <file>` into an empty database; verify counts; record result.
- Key management: `APP_ENCRYPTION_KEY` encrypts clinical fields, addresses, tokens and documents —
  store it in the secret manager with versioned backup; losing it makes encrypted data unrecoverable.
  Rotation: add re-encryption job before rotating (v1 prefix in ciphertext supports versioning).

## Data retention & deletion

- Medical records: retain per UAE law (currently 25 years from last encounter under Federal Law No. 2 of 2019 — confirm with counsel).
- Financial records: per UAE tax law (5+ years).
- Deletion requests (`data_requests`): close the account (`disabledAt`), revoke sessions, delete
  non-retained data (marketing consents, attribution, funnel ids); keep legally retained records.

## Incident response

1. Contain (revoke sessions: `update sessions set revoked_at=now()`; rotate secrets).
2. Assess scope via `audit_log` (append-only).
3. Notify per DHA / UAE data-protection requirements and facility agreements.
4. Post-incident review.
