#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/www/e-note-data}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/e-note}"
STAMP="$(date +%Y%m%d-%H%M%S)"

sudo mkdir -p "$BACKUP_DIR"
if [ ! -f "$DATA_DIR/db.json" ]; then
  echo "No db.json found at $DATA_DIR/db.json"
  exit 0
fi

sudo cp "$DATA_DIR/db.json" "$BACKUP_DIR/db-$STAMP.json"
echo "Backup created: $BACKUP_DIR/db-$STAMP.json"
