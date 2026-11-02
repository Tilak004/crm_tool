#!/usr/bin/env bash
# Emergency: reset a CA user's authenticator (lost or replaced phone).
#   sudo bash /opt/gst-portal/deploy/reset-2fa.sh admin
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Please run with sudo."; exit 1; }
[[ "${1:-}" =~ ^[a-z0-9._-]{3,32}$ ]] || { echo "Usage: sudo bash $0 <username>"; exit 1; }
set -a; source /etc/gst-portal.env; set +a
sudo -H -u gstportal --preserve-env=NODE_ENV,DATABASE_URL,SESSION_SECRET \
  bash -c "cd /opt/gst-portal && npm run --silent reset-2fa -- '$1'"
