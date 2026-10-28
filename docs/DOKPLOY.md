# Dokploy deployment

This deployment uses three services on the existing server:
- PostgreSQL 17, with a persistent volume and no public database port.
- Web, built with Dockerfile.dokploy, listening on internal port 3000.
- Worker, built with Dockerfile.worker, calling the web service on the private network.

The deployment branch is deploy/dokploy. No production data or secrets are committed.
The Docker build uses a disposable PGlite database with migrations, without demo seed data.
The real database is migrated before the web process starts. Keep the web replica count at one
until migration locking and shared caching are configured. An unsuccessful migration prevents startup.

Web runtime variables: DATABASE_URL, APP_BASE_URL=https://drensiyeh.ae, DEPLOY_ENV=production,
APP_ENCRYPTION_KEY (32 bytes, base64), TOKEN_PEPPER, BOOKING_TOKEN_SECRET, CRON_SECRET,
HEALTH_DATA_HOSTING_APPROVED=false. Store secrets in Dokploy Environment.
Optional build arguments APP_BASE_URL and DEPLOY_ENV must agree with runtime values.
Use /api/v1/health to verify both the web server and its database.

Worker variables: APP_BASE_URL=http://<web-service-internal-name>:3000 and the same CRON_SECRET.
No database access, external ports, or package installation are required by the worker.
The existing worker covers holds, notifications, calendar, reconcile, and content.
daily-summary, seo-crawl and search-console require separate schedules and provider setup.

Persist /app/.data for application files. Back up the database and encryption key separately.
Configure an approved backup destination and test restoration before accepting real patient data.
Leave live payments, medical records, home visits and WhatsApp gated by the existing application.

The production database starts empty: do not run the development seed in production.
Verified facilities, services, staff and notification credentials must be onboarded before
booking and staff sign-in can be considered operational. Public website deployment does not
constitute approval for health-data processing.
