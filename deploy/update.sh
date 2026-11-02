#!/usr/bin/env bash
# Pulls the latest code from GitHub, rebuilds and restarts the app.
#   sudo bash /opt/gst-portal/deploy/update.sh
set -euo pipefail

APP_DIR=/opt/gst-portal
APP_USER=gstportal
ENV_FILE=/etc/gst-portal.env

[[ $EUID -eq 0 ]] || { echo "Please run with sudo."; exit 1; }
set -a; source "$ENV_FILE"; set +a

as_app() {
  sudo -H -u "$APP_USER" --preserve-env=NODE_ENV,DATABASE_URL,UPLOAD_DIR,SESSION_SECRET \
    bash -c "cd '$APP_DIR' && $1"
}

echo "==> Backing up first"
/usr/local/bin/gst-portal-backup

echo "==> Getting the latest code"
as_app "git pull --ff-only"
as_app "npm ci --include=dev --no-audit --no-fund"

echo "==> Updating the database structure"
# Refuses changes that would lose data; nothing is deleted without asking.
as_app "npx prisma db push --skip-generate"

echo "==> Building"
as_app "npm run build"
# Scheduled jobs added after the first install
install -m 755 "$APP_DIR/deploy/backup.sh" /usr/local/bin/gst-portal-backup
echo "0 22 * * * root bash /opt/gst-portal/deploy/verify-audit.sh >/dev/null 2>&1" > /etc/cron.d/gst-portal-audit-check   # 22:00 UTC = 3:30 am IST, after the backup

systemctl restart gst-portal
echo "Updated. Check: sudo systemctl status gst-portal"
