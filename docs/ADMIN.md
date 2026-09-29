# Admin guide — LogHR

## Visual brand
- Primary `#0f2744`, accent `#0d9488` (LogHR)
- Настройка в Администрирование → Брендирование

## Roles
- ADMIN, HR_BP, RECRUITMENT_LEAD, HIRING_MANAGER, RECRUITER, SECURITY

## Status model (заявки)
Новая → На согласовании HR BP → Согласована / Отклонена → В работе → Приостановлена / Отменена / Закрыта

При «В работе» создаётся/привязывается вакансия (Профиль+Город или Профиль+Орг. единица).

## Public links
- Offer: `/public/offer/{externalToken}`
- Check: `/public/check/{externalToken}`
- Assessment: `/public/assessment/{externalToken}`

## OpenAPI
`/api/docs`

## Metabase
1. Поднимите compose: `npm run docker:up` (Metabase :3002).
2. Автоимпорт 6 вопросов + дашборд «LogHR ATS»:

```bash
npm run metabase:bootstrap
```

Env: `METABASE_URL`, `METABASE_EMAIL`, `METABASE_PASSWORD` (см. `.env.example`).  
Если первый setup ещё не пройден — скрипт создаёт админа и подключает БД сам.  
Вручную: Add database → PostgreSQL (`postgres`/`skillaz`) → SQL из [docs/metabase-dashboards.sql](metabase-dashboards.sql).  
Ссылка в UI: `/reports` → Metabase (`METABASE_URL`).

## AI
Env: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` — parse/score/hints на карточке кандидата.

## Интеграции
Статусы: Админка → Интеграции. Без ключей — «не настроено» / mock (HH) или disabled (SJ/Avito).
ProAction: webhook `POST /api/integrations/proaction/webhook` + авто-PENDING при сценарии с именем ProAction на этапе.
HH Chat: `GET/POST /api/integrations/hh-chat/:candidateId` — при `HH_CHAT_TOKEN` или `HH_ACCESS_TOKEN` грузит/шлёт сообщения HH negotiation (`externalId` кандидата или отклика). Без токена — честный stub.

## Пилот vs прод (env)
Источник: корневой `.env.example`.

| Назначение | Пилот (достаточно) | Прод (нужно) |
|---|---|---|
| База | `DATABASE_URL` (локальный Postgres / compose) | тот же, стабильный хост |
| JWT | любые длинные секреты в `.env` | уникальные `JWT_*_SECRET` |
| HH | пусто → mock | `HH_ACCESS_TOKEN` (+ client id/secret) |
| SJ / Avito / Zarplata | пусто → disabled | соответствующие `*_TOKEN` |
| Почта | пусто → MOCKED в логах | `SMTP_HOST/USER/PASS/FROM` |
| SMS / телефония | пусто | `SMS_*` / `TELEPHONY_API_KEY` |
| AI | пусто → stub | `AI_BASE_URL` + `AI_API_KEY` (+ `AI_MODEL`) |
| Файлы | `STORAGE_MODE=local` | `STORAGE_MODE=s3` + `S3_*` |
| Очереди | Redis опционален | `REDIS_URL` (иначе «очередь offline») |
| Отчёты | ссылка на Metabase | `METABASE_URL` + `npm run metabase:bootstrap` |
| ProAction / HH Chat | stub без ключей | `PROACTION_WEBHOOK_SECRET`, `HH_CHAT_TOKEN` или `HH_ACCESS_TOKEN` |
