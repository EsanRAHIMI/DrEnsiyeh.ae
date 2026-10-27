#!/usr/bin/env bash
# Restore an encrypted backup into an EMPTY database (never into production without a change ticket).
set -euo pipefail
file="${1:?backup file required}"
: "${RESTORE_DATABASE_URL:?}"; : "${BACKUP_PASSPHRASE_FILE:?}"
sha256sum -c "$file.sha256"
gpg --batch --decrypt --passphrase-file "$BACKUP_PASSPHRASE_FILE" "$file" | pg_restore --no-owner --dbname "$RESTORE_DATABASE_URL"
psql "$RESTORE_DATABASE_URL" -c "select count(*) as bookings from bookings; select count(*) as audit_rows from audit_log;"
