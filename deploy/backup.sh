#!/bin/sh
set -eu
umask 077
backup() {
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  target="/backups/creator-${stamp}.dump"
  pg_dump --format=custom --no-owner --no-acl --file="${target}.partial"
  pg_restore --list "${target}.partial" >/dev/null
  mv "${target}.partial" "${target}"
  printf '%s backup_complete\n' "${stamp}"
  find /backups -maxdepth 1 -name 'creator-*.dump' -mtime +14 -delete
}
if [ "${1:-}" = "--once" ]; then backup; exit 0; fi
while true; do
  if ! backup; then printf 'backup_failed\n' >&2; sleep 300; continue; fi
  sleep 86400
done
