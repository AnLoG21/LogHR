# LogHR ATS

Production ATS (Base Extended): Next.js + NestJS + PostgreSQL. Brand: **LogHR**.

## Старт с нуля

```powershell
npm run bootstrap      # docker (если есть) + migrate + seed
npm run dev:clean      # освободить :3000 / :3001
npm run dev:api
npm run dev:web
```

- UI http://localhost:3000  
- API http://localhost:3001/api  
- Swagger http://localhost:3001/api/docs  
- Metabase http://localhost:3002  

**Логин:** `admin@loghr.local` / `admin123`  
(также `*@taimyr.local` из seed)

### Без Docker
Локальный PostgreSQL (`skillaz`/`skillaz`, часто `:5433`) — задайте `DATABASE_URL` в `.env` (см. `.env.example`: compose = `15432` / Redis `16379`).

## Тесты

```powershell
npm run test           # API smoke (нужен запущенный API)
npx playwright install chromium
npm run test:e2e       # Playwright
npm run ci             # build + optional smoke
```

## Prod

```bash
docker compose --profile prod up -d --build
npm run db:migrate:deploy -w @skillaz/api
```

**Без тестовых данных:** не запускайте `npm run db:seed` / `bootstrap` на проде — seed создаёт демо-кандидатов, заявки и логины `admin123`.

Минимальный чистый старт:
1. Заполнить `.env` по таблице ниже (JWT, `DATABASE_URL`, при необходимости HH/SMTP/S3/Redis).
2. Поднять infra + `migrate deploy` (только схема).
3. Создать первого ADMIN вручную (SQL или UI после одноразового bootstrap-admin) и базовые воронки/справочники в админке.
4. Branding подтянется из `BRAND_NAME` при первом обращении к `/api/branding`.

Local migrate: `npm run db:migrate` (`prisma db push`).  
Prod: только `prisma migrate deploy` — без seed.

## Документация
- [docs/ADMIN.md](docs/ADMIN.md) — роли, Metabase, AI
- [docs/UAT.md](docs/UAT.md) — чеклист приёмки
- [docs/OPENAPI-1C.md](docs/OPENAPI-1C.md)
- [docs/metabase-dashboards.sql](docs/metabase-dashboards.sql)
- [apps/extension/README.md](apps/extension/README.md)

## Env-ключи (пилот vs прод)
Полный список — [.env.example](.env.example). Сводная таблица пилот/прод — [docs/ADMIN.md](docs/ADMIN.md#пилот-vs-прод-env).

| Переменная | Пилот | Прод |
|---|---|---|
| `HH_ACCESS_TOKEN` | пусто → mock | обязательно для publish |
| `SUPERJOB_TOKEN` / `AVITO_TOKEN` / `ZARPLATA_TOKEN` | пусто → disabled | токены бордов |
| `SMTP_*` | пусто → MOCKED | реальная почта |
| `SMS_API_KEY` / `TELEPHONY_API_KEY` | опционально | при SMS/звонках |
| `AI_BASE_URL` + `AI_API_KEY` | пусто → stub | LLM |
| `STORAGE_MODE` + `S3_*` | `local` | `s3` + бакет |
| `REDIS_URL` | опционально | очереди worker |
| `PROACTION_WEBHOOK_SECRET` / `HH_CHAT_TOKEN` | stub | боевые интеграции (HH Chat также принимает `HH_ACCESS_TOKEN`) |
| `METABASE_URL` (+ email/password) | ссылка на дашборд | `npm run metabase:bootstrap` |
