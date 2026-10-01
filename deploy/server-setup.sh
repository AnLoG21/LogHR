#!/usr/bin/env bash
# One-time server preparation (Debian/Ubuntu), run as root:
#   curl -fsSL https://raw.githubusercontent.com/AnLoG21/LogHR/main/deploy/server-setup.sh | PUBLIC_URL=http://10.0.0.5 bash
# PUBLIC_URL  — address users open (http://IP or https://domain)
# SITE_ADDRESS — Caddy site: ":80" for HTTP by IP (default) or the bare domain for automatic HTTPS
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/AnLoG21/LogHR.git}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/loghr}"
PUBLIC_URL="${PUBLIC_URL:?set PUBLIC_URL, e.g. http://10.0.0.5 or https://hr.example.ru}"
SITE_ADDRESS="${SITE_ADDRESS:-:80}"
SWAP_SIZE="${SWAP_SIZE:-4G}"

export DEBIAN_FRONTEND=noninteractive
command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq git openssl curl; }
command -v docker >/dev/null 2>&1 || curl -fsSL https://get.docker.com | sh

if ! swapon --show | grep -q .; then
  fallocate -l "$SWAP_SIZE" /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if [ ! -d "$DEPLOY_PATH/.git" ]; then
  git clone -q "$REPO_URL" "$DEPLOY_PATH"
fi
cd "$DEPLOY_PATH"
chmod +x deploy/deploy.sh

if [ ! -f deploy/.env ]; then
  cp deploy/.env.prod.example deploy/.env
  for key in POSTGRES_PASSWORD JWT_ACCESS_SECRET JWT_REFRESH_SECRET WORKER_TOKEN; do
    sed -i "s|^$key=.*|$key=$(openssl rand -hex 32)|" deploy/.env
  done
  sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=$PUBLIC_URL|; s|^SITE_ADDRESS=.*|SITE_ADDRESS=$SITE_ADDRESS|" deploy/.env
  chmod 600 deploy/.env
fi

cat > /etc/systemd/system/loghr-deploy.service <<EOF
[Unit]
Description=LogHR pull-based deploy
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/bin/bash $DEPLOY_PATH/deploy/deploy.sh
TimeoutStartSec=45min
EOF

cat > /etc/systemd/system/loghr-deploy.timer <<EOF
[Unit]
Description=Check GitHub for new LogHR commits

[Timer]
OnBootSec=2min
OnUnitInactiveSec=2min

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable docker >/dev/null 2>&1 || true

cat <<EOF

Server is ready: $DEPLOY_PATH
1. Set ADMIN_EMAIL and ADMIN_PASSWORD (min 10 chars) in $DEPLOY_PATH/deploy/.env, plus integration keys when available.
2. First deploy: $DEPLOY_PATH/deploy/deploy.sh --force
3. Enable auto-deploy: systemctl enable --now loghr-deploy.timer
   Logs: journalctl -u loghr-deploy -f
EOF
