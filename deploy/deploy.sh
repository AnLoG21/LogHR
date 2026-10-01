#!/usr/bin/env bash
# Pull-based deploy: fetch origin/main, rebuild images and restart the stack when a new commit appears.
# Run by the loghr-deploy.timer every 2 minutes; manual run: deploy/deploy.sh --force
set -euo pipefail

main() {
  local repo branch force=0
  repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  branch="${DEPLOY_BRANCH:-main}"
  [ "${1:-}" = "--force" ] && force=1
  cd "$repo"

  exec 9>/tmp/loghr-deploy.lock
  flock -n 9 || { echo "deploy already running"; exit 0; }

  git fetch -q origin "$branch"
  local target last=""
  target="$(git rev-parse "origin/$branch")"
  [ -f deploy/.last-deployed ] && last="$(cat deploy/.last-deployed)"
  if [ "$force" = 0 ] && [ "$target" = "$last" ]; then
    exit 0
  fi

  echo "[deploy] $(date -Is) deploying ${target:0:7}"
  git reset -q --hard "$target"

  test -f deploy/.env || { echo "[deploy] missing deploy/.env (copy deploy/.env.prod.example)"; exit 1; }
  # tls.caddy is gitignored so a corporate cert config survives git reset; seed from example once.
  if [ ! -f deploy/tls.caddy ]; then
    cp deploy/tls.caddy.example deploy/tls.caddy
  fi
  mkdir -p deploy/certs deploy/sites
  local profiles
  profiles="$(sed -n 's/^COMPOSE_PROFILES=//p' deploy/.env | tail -1)"
  export COMPOSE_PROFILES="$profiles"
  local c="docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env"

  if [[ ",$profiles," == *",bi,"* ]]; then
    $c up -d --wait postgres
    local pguser
    pguser="$(sed -n 's/^POSTGRES_USER=//p' deploy/.env | tail -1)"
    pguser="${pguser:-loghr}"
    if ! $c exec -T postgres psql -U "$pguser" -d postgres -tAc "select 1 from pg_database where datname='metabase'" | grep -q 1; then
      $c exec -T postgres createdb -U "$pguser" metabase
    fi
  fi

  # One at a time: small servers run out of memory building Next.js in parallel
  for svc in api worker web; do
    $c build "$svc"
  done
  $c up -d --remove-orphans
  $c exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true

  local i
  for i in $(seq 1 40); do
    if $c exec -T api wget -qO- http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
      echo "[deploy] API healthy"
      break
    fi
    if [ "$i" = 40 ]; then
      echo "[deploy] API did not become healthy"
      $c logs --tail=80 migrate api
      exit 1
    fi
    sleep 5
  done

  $c logs --tail=5 migrate
  echo "$target" > deploy/.last-deployed
  docker image prune -f >/dev/null
  echo "[deploy] done ${target:0:7}"
}

main "$@"
