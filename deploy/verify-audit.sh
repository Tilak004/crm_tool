#!/usr/bin/env bash
# Nightly full check of the edit log (the Edit log page checks only new entries).
#   sudo bash /opt/gst-portal/deploy/verify-audit.sh
# Result: shown on the Edit log page, and appended to /var/log/gst-portal-audit-check.log
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Please run with sudo."; exit 1; }
set -a; source /etc/gst-portal.env; set +a
{
  echo "== $(date -u '+%F %T UTC')"
  sudo -H -u gstportal --preserve-env=NODE_ENV,DATABASE_URL,SESSION_SECRET \
    bash -c "cd /opt/gst-portal && npm run --silent audit:verify" 2>&1
} | tee -a /var/log/gst-portal-audit-check.log
