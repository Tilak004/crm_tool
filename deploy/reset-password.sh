#!/usr/bin/env bash
# Emergency: set a new password for any user (e.g. a forgotten admin password).
#   sudo bash /opt/gst-portal/deploy/reset-password.sh admin
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Please run with sudo."; exit 1; }
[[ "${1:-}" =~ ^[a-z0-9._-]{3,32}$ ]] || { echo "Usage: sudo bash $0 <username>"; exit 1; }

read -rsp "New password for $1 (at least 8 characters): " NEW_PASSWORD </dev/tty; echo
read -rsp "Type it again: " CONFIRM </dev/tty; echo
[[ "$NEW_PASSWORD" == "$CONFIRM" ]] || { echo "The two passwords don't match. Nothing changed."; exit 1; }
[[ ${#NEW_PASSWORD} -ge 8 ]] || { echo "Too short. Nothing changed."; exit 1; }

set -a; source /etc/gst-portal.env; set +a
export NEW_PASSWORD
sudo -H -u gstportal --preserve-env=NODE_ENV,DATABASE_URL,SESSION_SECRET,NEW_PASSWORD \
  bash -c "cd /opt/gst-portal && npm run --silent reset-password -- '$1'"
