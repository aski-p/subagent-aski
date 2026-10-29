#!/bin/sh
# Root-reviewed installation only. Never bootstrap/replace an existing authority DB.
set -eu
[ "$#" -eq 2 ] || { echo 'usage: install-pgx.sh ABSOLUTE_PRIVATE_MODULE_DIR ABSOLUTE_EXISTING_DB' >&2; exit 2; }
case "$1" in /*) ;; *) exit 2;; esac
case "$2" in /*) ;; *) exit 2;; esac
[ -f "$2" ] || exit 2
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
umask 077
mkdir -p -- "$1"
chmod 700 -- "$1"
backup="$1/backup-$(date -u +%Y%m%dT%H%M%S)-$$"
mkdir -m 700 -- "$backup"
for name in ledger.py commands.py command_authority.py office_cli.py; do
 if [ -f "$1/$name" ]; then cp -p -- "$1/$name" "$backup/$name"; fi
 install -m 600 -- "$source_dir/$name" "$1/$name"
done
# CommandStore's compatible migration runs in the existing private DB; no bootstrap.
PYTHONPATH="$1" /usr/bin/python3 -c 'import sys; from commands import CommandStore; CommandStore(sys.argv[1])' "$2"
printf '%s\n' 'Installed fixed command helper modules and compatible schema. Existing adapter owns hourly purge; no timer/listener started.'
