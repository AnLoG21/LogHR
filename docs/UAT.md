# UAT checklist — LogHR ATS (финал)

## A. Инфра / старт
- [x] `npm run bootstrap` / migrate + seed
- [x] `npm run dev:clean` освобождает :3000/:3001
- [x] API :3001 `/api/health` → `loghr-api`
- [x] Web :3000 login LogHR
- [x] `npm run test` (smoke) — SMOKE_OK
- [x] `npx playwright install chromium` + `npm run test:e2e` — 3 passed
- [x] `npm run ci` — Build OK + SMOKE_OK

## B. Процесс
- [x] Логин `admin@loghr.local` / admin123
- [x] Профиль `PATCH /api/auth/me` + e2e `/profile`
- [x] Заявка NEW → PENDING_HR_BP → APPROVED_HR_BP → IN_PROGRESS (+ vacancy)
- [x] Кандидат → этап (e2e)
- [x] Оффер public `GET /api/offers/public/{token}` → 200
- [x] Assessment public `GET /api/assessments/public/{token}` + `/public/assessment/{token}` → 200
- [x] Check СБ public `GET /api/checks/public/{token}` + `/public/check/{token}` → 200
- [x] XLSX `GET /api/import-export/export?entity=candidates` → 200
- [x] PATCH кандидата / комментарии / пользователи create+deactivate
- [x] Шаблоны публикаций CRUD + `templateId` на publish
- [x] HH Chat live при токене / stub без токена
- [x] e2e extended (7 tests) + smoke
- [x] AI parse stub (e2e)
- [x] HH chat stub без токена
- [x] Visibility list + funnel transitions

## C. Меню
- [x] Все пункты NAV без 500 (e2e)

## D. Интеграции
- [x] Статусы HH mock / SJ Avito disabled / SMTP SMS AI Redis S3 HH_CHAT
- [x] REDIS note: очередь offline без Redis
- [x] Публикация HH без ключа → MOCKED (не PUBLISHED)

## E. Metabase / prod
- [x] docs/ADMIN.md + metabase-dashboards.sql
- [x] `npm run metabase:bootstrap` (автоимпорт карточек/дашборда)
- [x] STORAGE_MODE=s3 signed PUT
- [x] prisma migrate deploy path + migrations/20260929120000_init
- [x] Extension README LogHR HH import
