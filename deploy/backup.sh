#!/usr/bin/env bash
# Daily backup of the database and uploaded invoice files; keeps 14 days.
set -euo pipefail

DATA_DIR=/var/lib/gst-portal
DEST=/var/backups/gst-portal
STAMP=$(date +%F)

mkdir -p "$DEST"
# .backup makes a consistent copy even while the app is running.
sqlite3 "$DATA_DIR/app.db" ".backup '$DEST/app-$STAMP.db'"
tar -czf "$DEST/uploads-$STAMP.tar.gz" -C "$DATA_DIR" uploads
find "$DEST" -type f -mtime +14 -delete
echo "Backup written to $DEST ($STAMP)"
