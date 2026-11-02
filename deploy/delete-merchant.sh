#!/usr/bin/env bash
# Permanently delete a merchant (e.g. a test merchant) with all their data.
#   sudo bash /opt/gst-portal/deploy/delete-merchant.sh <merchant's login username>
# Take a backup first: sudo gst-portal-backup
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Please run with sudo."; exit 1; }
[[ "${1:-}" =~ ^[a-z0-9._-]{3,32}$ ]] || { echo "Usage: sudo bash $0 <merchant's login username>"; exit 1; }

set -a; source /etc/gst-portal.env; set +a
run() {
  sudo -H -u gstportal --preserve-env=NODE_ENV,DATABASE_URL,UPLOAD_DIR,SESSION_SECRET \
    bash -c "cd /opt/gst-portal && npm run --silent delete-merchant -- '$1' $2"
}

run "$1" ""
read -rp "This can't be undone. Type DELETE to delete it: " ANSWER </dev/tty
[[ "$ANSWER" == "DELETE" ]] || { echo "Nothing deleted."; exit 1; }
run "$1" "--yes"
