#!/usr/bin/env bash
# One-time server preparation (Ubuntu 22.04/24.04). Run as root:
#   curl -fsSL https://raw.githubusercontent.com/AnLoG21/LogHR/main/deploy/server-setup.sh | bash
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/loghr}"

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"

mkdir -p "$DEPLOY_PATH" "/home/$DEPLOY_USER/.ssh"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_PATH" "/home/$DEPLOY_USER/.ssh"
chmod 700 "/home/$DEPLOY_USER/.ssh"

if [ ! -f "$DEPLOY_PATH/.env" ]; then
  curl -fsSL https://raw.githubusercontent.com/AnLoG21/LogHR/main/deploy/.env.prod.example -o "$DEPLOY_PATH/.env"
  for key in POSTGRES_PASSWORD MINIO_ROOT_PASSWORD JWT_ACCESS_SECRET JWT_REFRESH_SECRET WORKER_TOKEN; do
    sed -i "s|^$key=.*|$key=$(openssl rand -hex 32)|" "$DEPLOY_PATH/.env"
  done
  chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_PATH/.env"
  chmod 600 "$DEPLOY_PATH/.env"
fi

if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
fi

cat <<EOF

Server is ready.
1. Edit $DEPLOY_PATH/.env: DOMAIN, ACME_EMAIL, ADMIN_EMAIL, ADMIN_PASSWORD (+ SMTP/HH/AI keys when available).
   Secrets (Postgres, MinIO, JWT, WORKER_TOKEN) are already generated.
2. Add the GitHub Actions public key to /home/$DEPLOY_USER/.ssh/authorized_keys.
3. Point the DOMAIN A-record to this server, then push to main (or run the workflow manually).
EOF
