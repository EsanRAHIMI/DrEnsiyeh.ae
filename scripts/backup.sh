#!/usr/bin/env bash
# Encrypted logical backup. Usage: DATABASE_URL=... BACKUP_PASSPHRASE_FILE=... scripts/backup.sh /secure/backups
# Restore: scripts/restore.sh <file>. Managed Postgres PITR remains the primary recovery mechanism;
# these dumps are an independent, encrypted secondary copy (test restores monthly — docs/OPERATIONS.md).
set -euo pipefail
out_dir="${1:?backup directory required}"
: "${DATABASE_URL:?}"; : "${BACKUP_PASSPHRASE_FILE:?}"
ts=$(date -u +%Y%m%dT%H%M%SZ)
file="$out_dir/drensiyeh-$ts.dump.gpg"
pg_dump --format=custom --no-owner "$DATABASE_URL" \
  | gpg --batch --symmetric --cipher-algo AES256 --passphrase-file "$BACKUP_PASSPHRASE_FILE" -o "$file"
sha256sum "$file" > "$file.sha256"
echo "Backup written: $file"
# Retention: keep 35 daily copies
ls -1t "$out_dir"/drensiyeh-*.dump.gpg | tail -n +36 | xargs -r rm -f
