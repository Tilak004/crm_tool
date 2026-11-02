#!/usr/bin/env bash
# One-time setup of the GST Sales Portal on a fresh Ubuntu server
# (written for a Google Cloud e2-micro, works on any Ubuntu 22.04/24.04 VM).
#
#   curl -fsSL https://raw.githubusercontent.com/Tilak004/crm_tool/main/deploy/setup.sh -o setup.sh
#   sudo bash setup.sh
#
# Installs Node.js, Caddy (automatic HTTPS) and the app; creates the database,
# the admin login, a background service, a DuckDNS updater and daily backups.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Tilak004/crm_tool.git}"
APP_DIR=/opt/gst-portal
DATA_DIR=/var/lib/gst-portal
BACKUP_DIR=/var/backups/gst-portal
ENV_FILE=/etc/gst-portal.env
APP_USER=gstportal

[[ $EUID -eq 0 ]] || { echo "Please run with sudo:  sudo bash setup.sh"; exit 1; }

echo
echo "GST Sales Portal setup"
echo "----------------------"
read -rp "Website address (e.g. mygst.duckdns.org): " DOMAIN </dev/tty
read -rp "DuckDNS token (press Enter to skip if you use your own domain): " DUCKDNS_TOKEN </dev/tty
read -rsp "Choose the CA admin password (at least 8 characters): " ADMIN_PASSWORD </dev/tty; echo
[[ -n "$DOMAIN" ]] || { echo "The website address is required."; exit 1; }
[[ ${#ADMIN_PASSWORD} -ge 8 ]] || { echo "The password must be at least 8 characters."; exit 1; }

step() { echo; echo "==> $*"; }

step "Adding 2 GB swap (the 1 GB server needs it to build the app)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

step "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git sqlite3 openssl debian-keyring debian-archive-keyring apt-transport-https

if ! command -v node >/dev/null || [[ $(node -v | sed 's/^v//; s/\..*//') -lt 20 ]]; then
  step "Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null; then
  step "Installing Caddy (HTTPS)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

step "Creating the app user and folders"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "/home/$APP_USER" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$DATA_DIR/uploads" "$BACKUP_DIR"
[[ -d "$APP_DIR/.git" ]] || git clone "$REPO_URL" "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  step "Writing settings to $ENV_FILE"
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
DATABASE_URL=file:$DATA_DIR/app.db
UPLOAD_DIR=$DATA_DIR/uploads
SESSION_SECRET=$(openssl rand -hex 32)
EOF
  chmod 600 "$ENV_FILE"
fi
set -a; source "$ENV_FILE"; set +a

# Runs a command in the app folder as the app user, with the settings loaded.
as_app() {
  sudo -H -u "$APP_USER" --preserve-env=NODE_ENV,DATABASE_URL,UPLOAD_DIR,SESSION_SECRET,SEED_ADMIN_PASSWORD \
    bash -c "cd '$APP_DIR' && $1"
}

step "Installing app dependencies"
as_app "npm ci --include=dev --no-audit --no-fund"

step "Creating the database"
as_app "npx prisma db push --skip-generate"
SEED_ADMIN_PASSWORD="$ADMIN_PASSWORD" as_app "npm run seed"

step "Loading the official HSN list from the GST portal"
as_app "npm run hsn:import" || echo "   Couldn't download it now. Load it later from the app: HSN codes → Load from GST portal."

step "Building the app (5–10 minutes on this small server)"
as_app "npm run build"

step "Creating the background service"
cat > /etc/systemd/system/gst-portal.service <<EOF
[Unit]
Description=GST Sales Portal
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now gst-portal
systemctl restart gst-portal

if [[ -n "$DUCKDNS_TOKEN" ]]; then
  step "Keeping $DOMAIN pointed at this server (DuckDNS, every 5 minutes)"
  SUB="${DOMAIN%%.duckdns.org}"
  cat > /usr/local/bin/duckdns-update <<EOF
#!/bin/sh
curl -fsS "https://www.duckdns.org/update?domains=$SUB&token=$DUCKDNS_TOKEN&ip=" -o /var/log/duckdns.log
EOF
  chmod 700 /usr/local/bin/duckdns-update
  echo "*/5 * * * * root /usr/local/bin/duckdns-update" > /etc/cron.d/duckdns
  /usr/local/bin/duckdns-update || true
fi

step "Setting up HTTPS for $DOMAIN"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
EOF
systemctl reload caddy || systemctl restart caddy

step "Scheduling daily backups (kept 14 days in $BACKUP_DIR)"
install -m 755 "$APP_DIR/deploy/backup.sh" /usr/local/bin/gst-portal-backup
echo "30 21 * * * root /usr/local/bin/gst-portal-backup" > /etc/cron.d/gst-portal-backup   # 21:30 UTC = 3:00 am IST

echo
echo "Done!"
echo "  Open:      https://$DOMAIN   (the HTTPS certificate can take a minute the first time)"
echo "  Clients:   https://$DOMAIN/login"
echo "  CA admin:  https://$DOMAIN/ca-login   (admin / the password you just chose;"
echo "             the first sign-in shows a QR code for Google/Microsoft Authenticator)"
echo "  Status:    sudo systemctl status gst-portal"
echo "  App logs:  sudo journalctl -u gst-portal -n 100"
echo "  Update:    sudo bash $APP_DIR/deploy/update.sh"
