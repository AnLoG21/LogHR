# Автодеплой LogHR

Каждый пуш в `main` запускает [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml):

1. **check** — сборка `shared` и API, проверка типов веба.
2. **images** — сборка Docker-образов `loghr-api`, `loghr-web`, `loghr-worker` и публикация в GitHub Container Registry (`ghcr.io/anlog21/...`), теги `latest` и SHA коммита.
3. **deploy** — по SSH копирует `deploy/docker-compose.prod.yml` и `deploy/Caddyfile` на сервер, скачивает новые образы и перезапускает стек.

При каждом запуске сервис `migrate` выполняет `prisma migrate deploy` и `prisma/init-prod.cjs`: справочники (воронки, шаблоны писем, ПДн, источники, роли видимости) и первого администратора, если его ещё нет. Демо-данные (`db:seed`) на прод **не попадают**.

Пока не задана переменная `PUBLIC_URL`, выполняется только **check**. Пока не задан секрет `DEPLOY_HOST`, образы собираются, а деплой пропускается.

## Что нужно один раз

### 1. Сервер

Ubuntu 22.04/24.04, от 2 vCPU / 4 GB RAM, открыты порты 22, 80, 443. На сервере от root:

```bash
curl -fsSL https://raw.githubusercontent.com/AnLoG21/LogHR/main/deploy/server-setup.sh | bash
```

Скрипт ставит Docker, создаёт пользователя `deploy`, папку `/opt/loghr` и `.env` из [`deploy/.env.prod.example`](../deploy/.env.prod.example) с уже сгенерированными паролями Postgres/MinIO, JWT и `WORKER_TOKEN`.

Дальше в `/opt/loghr/.env` заполнить:
- `DOMAIN`, `ACME_EMAIL` — HTTPS-сертификат Caddy получит сам;
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` (от 10 символов) — после первого входа пароль из `.env` удалить;
- ключи интеграций по мере появления (SMTP, HH, DaData, AI…).

DNS: A-запись домена на IP сервера.

### 2. SSH-ключ для GitHub Actions

На своём компьютере:

```bash
ssh-keygen -t ed25519 -f loghr_deploy -N ""
```

Содержимое `loghr_deploy.pub` добавить на сервер в `/home/deploy/.ssh/authorized_keys`. Приватный `loghr_deploy` — в секрет `DEPLOY_SSH_KEY`.

### 3. Настройки репозитория

GitHub → Settings → Secrets and variables → Actions:

| Тип | Имя | Значение |
|---|---|---|
| Variable | `PUBLIC_URL` | `https://hr.example.ru` (тот же домен, что `DOMAIN`) |
| Secret | `DEPLOY_HOST` | IP или домен сервера |
| Secret | `DEPLOY_USER` | `deploy` |
| Secret | `DEPLOY_SSH_KEY` | приватный ключ целиком |
| Secret | `DEPLOY_PORT` | опционально, по умолчанию 22 |
| Secret | `DEPLOY_PATH` | опционально, по умолчанию `/opt/loghr` |

После этого — пуш в `main` или Actions → Build & Deploy → Run workflow.

## Эксплуатация

Команды на сервере из `/opt/loghr` (`.deploy.env` хранит тег текущего релиза):

```bash
C="docker compose --env-file .env --env-file .deploy.env -f docker-compose.prod.yml"
$C ps                      # статус
$C logs -f api             # логи API
$C restart api worker      # перезапуск после правки .env
$C --profile bi up -d metabase   # Metabase (по желанию)
```

**Откат:** Actions → старый успешный запуск → Re-run jobs (переразвернёт образы того коммита). Либо на сервере указать нужный SHA в `.deploy.env` и выполнить `$C up -d`.

**Бэкап БД:**

```bash
$C exec -T postgres pg_dump -U loghr loghr | gzip > backup-$(date +%F).sql.gz
```

## Если OpenRouter/AI недоступен из региона сервера

OpenRouter отвечает 403 с части IP. Задайте `AI_PROXY_URL=http://user:pass@proxy:port` в `.env` сервера или используйте основной провайдер `AI_BASE_URL`/`AI_API_KEY`, доступный из региона.
