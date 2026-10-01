# Деплой и автодеплой LogHR

Сервер сам себя обновляет. На нём лежит клон репозитория в `/opt/loghr`, systemd-таймер `loghr-deploy.timer` раз в 2 минуты проверяет `origin/main` и, если появился новый коммит, запускает [`deploy/deploy.sh`](../deploy/deploy.sh):

1. `git reset --hard origin/main`;
2. сборка образов `api`, `worker`, `web` по очереди (на маленьком сервере параллельная сборка Next.js не помещается в память);
3. `docker compose up -d`: сервис `migrate` выполняет `prisma migrate deploy` и `prisma/init-prod.cjs` (справочники, воронки, шаблоны писем, ПДн и первый ADMIN, если его ещё нет), затем стартуют API, worker, web и Caddy;
4. проверка `/api/health`; при неудаче печатаются логи, а коммит не помечается как выкаченный, так что на следующем тике будет новая попытка.

Демо-данные (`db:seed`) на прод **не попадают**.

GitHub Actions ([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)) проверяет сборку на каждый пуш и PR. Если сервер доступен из интернета и заданы секреты `DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_SSH_KEY`, Actions дополнительно запускает `deploy.sh` по SSH сразу после проверки. Для серверов во внутренней сети (как `10.11.0.176`) хватает таймера.

## Первичная установка

Debian/Ubuntu, от 2 vCPU / 2 GB RAM (скрипт добавит 4 GB swap), открыты порты 22 и 80 (и 443 для домена). От root:

```bash
curl -fsSL https://raw.githubusercontent.com/AnLoG21/LogHR/main/deploy/server-setup.sh \
  | PUBLIC_URL=http://10.11.0.176 bash
```

Для домена с HTTPS: `PUBLIC_URL=https://hr.example.ru SITE_ADDRESS=hr.example.ru` (A-запись домена на сервер, Caddy сам получит сертификат).

Скрипт ставит Docker и git, включает swap, клонирует репозиторий и создаёт `deploy/.env` из [`deploy/.env.prod.example`](../deploy/.env.prod.example) с уже сгенерированными паролем Postgres, JWT и `WORKER_TOKEN`. Файлы кандидатов хранятся в Docker-volume `api_uploads`; для внешнего S3 задайте `STORAGE_MODE=s3` и `S3_*`.

Дальше:

```bash
cd /opt/loghr
nano deploy/.env                       # ADMIN_EMAIL, ADMIN_PASSWORD (от 10 символов), ключи интеграций
deploy/deploy.sh --force               # первый деплой (сборка 10–20 минут)
systemctl enable --now loghr-deploy.timer
```

После первого входа удалите `ADMIN_PASSWORD` из `deploy/.env` — админ уже создан.

## Эксплуатация

```bash
cd /opt/loghr
C="docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env"
$C ps                              # статус контейнеров
$C logs -f api                     # логи API
$C up -d                           # применить правки deploy/.env
journalctl -u loghr-deploy -f      # логи автодеплоя
systemctl list-timers loghr-deploy.timer
deploy/deploy.sh --force           # пересобрать и перезапустить вручную
$C --profile bi up -d metabase     # Metabase (по желанию)
```

**Пауза автодеплоя:** `systemctl stop loghr-deploy.timer`.

**Откат:** откатите коммит в `main` (`git revert`) и запушьте — сервер выкатит его сам. Срочно на сервере: `systemctl stop loghr-deploy.timer && git reset --hard <sha>`, затем `$C build api worker web && $C up -d`.

**Бэкап БД:**

```bash
$C exec -T postgres pg_dump -U loghr loghr | gzip > backup-$(date +%F).sql.gz
```

## AI из региона сервера

OpenRouter отвечает 403 с части IP. Задайте `AI_PROXY_URL=http://user:pass@proxy:port` в `deploy/.env` или используйте основной провайдер `AI_BASE_URL`/`AI_API_KEY`, доступный из региона.
