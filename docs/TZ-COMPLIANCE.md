# Чеклист соответствия ТЗ Skillaz «Базовый расширенный» → LogHR ATS

Статусы: **DONE** · **PARTIAL** · **MISSING** · **OUT_OF_SCOPE**  
Основание: `docs/_extract_docx.txt`, `docs/UAT.md`, `docs/ADMIN.md`, `NAV_GROUPS`, код модулей, spot-check 2026-09-30.

Легенда отметок: `[x]` = DONE; `[~]` = PARTIAL; `[ ]` = MISSING; `[-]` = OUT_OF_SCOPE.

---

## 1. Процесс (заявка → оффер)

- [x] **DONE** — Статусная модель заявки (Новая → … → Закрыта) + переходы `HIRING_REQUEST_TRANSITIONS`
- [x] **DONE** — Автосоздание/привязка вакансии при «В работе» (Профиль+Город / Профиль+Орг. единица)
- [x] **DONE** — Потребность → автосоздание заявки при `positionsCount > 0`
- [x] **DONE** — Орг. единицы, профили кандидатов, вакансии, заявки — CRUD + UI в меню
- [x] **DONE** — 2 воронки (6 и 8 этапов) в seed + админка воронок
- [x] **DONE** — Смена этапа кандидата + история + 5 форм смены статуса (UI)
- [x] **DONE** — Оффер: статусы ТЗ, внутренний UI, public `/public/offer/{token}`, PDF
- [x] **DONE** — Таск-трекер «Мои задачи» (кандидат / заявка)
- [x] **DONE** — Счётчики этапов на заявке/вакансии есть; приоритет заявки в модели есть, **фильтр приоритета на списке заявок** работает
- [x] **DONE** — Transitions воронки хранятся JSON, UI редактирует роли на этапы; **enforce по ролям при смене этапа** (`assertCanMoveToStage` / `canMoveToStage`)
- [~] **PARTIAL** — Уведомления по статусам: шаблоны есть; матрица событий: stage / request / offer / check wired (SMTP или MOCKED)
- [x] **DONE** — Публичная форма отклика `/public/apply/{vacancyId}` (`isPublicApply`)
- [-] **OUT_OF_SCOPE** — Онбординг / адаптация / LMS / OKR / 360° (PDF КП Skillaz HR-suite, не ATS-тариф)

---

## 2. Витрина кандидатов и фильтры

- [x] **DONE** — Витрина list + kanban, карточка с вкладками (резюме, история, вложения, проверки, мессенджеры, отклики)
- [x] **DONE** — API `view=short|full`; настройка видимых полей в UI
- [x] **DONE** — Фильтры: вакансия, заявка, орг., этапы, источники, тип добавления, теги+даты, встречи, резюме-параметры, проверки/офферы, ПДн
- [x] **DONE** — Форма создания кандидата (1), дедуп `POST /candidates/dedupe/check`
- [x] **DONE** — Теги: 3 категории / ~15 тегов (seed)
- [x] **DONE** — Фильтр «по процессу с учётом истории»: выбранные этапы = текущий ИЛИ был в `CandidateStatusHistory`
- [~] **PARTIAL** — Digital-интервью панель / ссылки — оценка через assessments, отдельной панели digital-interview нет
- [~] **PARTIAL** — Дедуп: проверка дублей есть; стратегия «одна карточка на вакансию/компанию» + merge — упрощённая

---

## 3. Админ, пользователи, видимость

- [x] **DONE** — 6 системных ролей (ADMIN…SECURITY) + labels ТЗ
- [x] **DONE** — Пользователи: create / deactivate (UAT)
- [x] **DONE** — 5 профилей видимости (seed) + UI `/visibility` + эвристики `visibilityWhere`
- [x] **DONE** — 7 справочников, источники, брендирование (лого/цвета)
- [x] **DONE** — Автозавершение сессии при входе с другого устройства (`sessionDeviceId`)
- [x] **DONE** — DaData suggest (`DADATA_TOKEN`) + AddressSuggest UI
- [x] **DONE** — Кастомные поля `/custom-fields` (Table 1 lite)
- [~] **PARTIAL** — Visibility: heuristics по роли/scope; не полный Skillaz rule-engine по всем объектам
- [~] **PARTIAL** — 6 процессных ролей **засеяны в БД**, UI/runtime-резолв для задач/нотификаций — почти не используется
- [~] **PARTIAL** — Ограничение доступов к воронкам/статусам — навигация по ролям + transitions JSON; без полной матрицы Skillaz

---

## 4. Работные сайты / публикации / шаблоны

- [x] **DONE** — Аккаунты, шаблоны публикаций CRUD, publish от вакансии + `templateId`
- [x] **DONE** — Enum бордов: HH, SJ, Avito, Zarplata, Rabota, Trudvsem
- [x] **DONE** — HH: live при токене / MOCKED без ключа (честный статус)
- [x] **DONE** — Авторазмещения: `AutoPublishRule` + worker/cron 5м + UI вкладка
- [~] **PARTIAL** — SJ / Avito / Zarplata: adapters token-gated или disabled; без ключей — disabled, не live E2E
- [~] **PARTIAL** — Автопоиски: UI вкладка + `POST /job-boards/search`; без купленного доступа — mock/disabled
- [x] **DONE** — Сбор откликов `sync-responses` — HH только из папки «Неразобранные» (`/negotiations/response`); manual sync через личный HH-токен (`withHhUser`)
- [~] **PARTIAL** — Регион публикации: `regionHint` (город вакансии), без внешнего geo 95%
- [-] **OUT_OF_SCOPE** / **MISSING** — Факультетус, Буду, Rabota.ru/Farpost/Joblab deep adapters — в enum частично (RABOTA/TRUDVSEM = DisabledAdapter)

---

## 5. Оценки / проверки / публичные офферы

- [x] **DONE** — Опросники TEST / VIDEO / HOMEWORK + 2 сценария (seed)
- [x] **DONE** — Public assessment `/public/assessment/{token}`
- [x] **DONE** — 3 типа проверок (СБ, Заявка на приём, Feedback) + public `/public/check/{token}`
- [x] **DONE** — Оффер public + PDF шаблон (pdfkit, 1 шаблон)
- [~] **PARTIAL** — ProAction: webhook + авто-PENDING по имени сценария; без секрета — stub/ожидание
- [~] **PARTIAL** — Статусы проверок упрощены vs гибкая Skillaz status-model с role-gates
- [~] **PARTIAL** — Чекбокс ПДн на публичных формах — политика/согласие через `/pdn`; полный UX «как в Skillaz» — ограничен

---

## 6. Интеграции

| Интеграция | Статус | Заметка |
|---|---|---|
| HH publish/search | PARTIAL | Live с токеном; иначе MOCKED |
| SJ / Avito / Zarplata | PARTIAL | Disabled без токена |
| SMTP | PARTIAL | Реально с `SMTP_*`; иначе MOCKED в лог/БД |
| SMS | PARTIAL | Mock / Rapporto-adapter при `SMS_API_KEY` (не все провайдеры ТЗ) |
| Телефония | PARTIAL | `TELEPHONY_API_KEY` + mock; нет Megafon/Mango/Voximplant партнёрских коннекторов |
| ProAction | PARTIAL | Webhook готов, полный UI результатов — базовый |
| HH Chat | PARTIAL | Live с токеном; stub без |
| Avito chat sync | MISSING | Deep-link мессенджеры есть; sync чата Avito нет |
| Redis / очереди | PARTIAL | Опционально; без Redis — «очередь offline» |
| S3 | DONE/PARTIAL | `STORAGE_MODE=s3` signed PUT; default local |
| AI parse/score/hints | PARTIAL | Live с `AI_*`; иначе stub (UAT) |
| WhatsApp / Telegram / MAX | PARTIAL | Web-redirect без хранения истории (как в ТЗ); MAX — ссылка-заглушка |
| Dadata | MISSING | — |
| OpenAPI / 1С | PARTIAL | Swagger `/api/docs` + `docs/OPENAPI-1C.md`; 15ч консультаций — услуга внедрения |

---

### Чеклист интеграций (коротко)

- [~] **PARTIAL** — HH
- [~] **PARTIAL** — SJ / Avito / Zarplata
- [~] **PARTIAL** — SMTP
- [~] **PARTIAL** — SMS (1 адаптер, не полный каталог провайдеров)
- [~] **PARTIAL** — Telephony generic
- [~] **PARTIAL** — ProAction webhook
- [~] **PARTIAL** — HH Chat
- [~] **PARTIAL** — Redis (опционально)
- [x] **DONE** — S3 path реализован
- [~] **PARTIAL** — AI
- [ ] **MISSING** — Dadata; Avito chat sync; партнёрские SMS/ВАТС «из коробки»
- [-] **OUT_OF_SCOPE** — Подключения по доп. договору с провайдерами (как в ТЗ Skillaz) — коммерция, не код

---

## 7. Отчёты / Metabase

- [x] **DONE** — `/reports` + ссылка Metabase
- [x] **DONE** — `docs/metabase-dashboards.sql` + `npm run metabase:bootstrap` (6 вопросов / дашборд)
- [x] **DONE** — XLSX export: candidates, org-units, users, hiring-requests
- [~] **PARTIAL** — Набор отчётов ТЗ покрыт SQL-прокси; «Сроки обработки кандидатов» — упрощённо через history/reports API
- [~] **PARTIAL** — Export: нет demands / dictionaries в списке entity; import только candidates + org-units (нет users/profiles/demands/dicts по ТЗ)
- [ ] **MISSING** — Импорт ретро-базы кандидатов отдельным шаблоном Skillaz (есть простой XLSX import)
- [-] **OUT_OF_SCOPE** — 5 учётных записей Metabase «как у Skillaz cloud» — клиентский BI-доступ

---

## 8. Расширение браузера

- [x] **DONE** — Chrome MV3: HH / SuperJob / Avito / Zarplata → `POST /candidates`
- [x] **DONE** — README установки + [STORE.md](../apps/extension/STORE.md) для Web Store
- [~] **PARTIAL** — Публикация в Chrome Web Store — инструкция готова, модерация Google вручную
- [ ] **MISSING** — Rabota.ru / Farpost / Joblab в extension

---

## 9. Тесты / CI / docs / prod без seed

- [x] **DONE** — `npm run test` smoke API
- [x] **DONE** — Playwright e2e (smoke + extended)
- [x] **DONE** — `npm run ci` build + smoke
- [x] **DONE** — docs: README, ADMIN, UAT, OPENAPI-1C, metabase SQL, extension README
- [x] **DONE** — Prod path: `docker compose --profile prod`, `migrate deploy`, **без seed** (документировано)
- [x] **DONE** — Первый ADMIN без seed: `apps/api/prisma/init-prod.cjs` (справочники + ADMIN из `ADMIN_EMAIL`/`ADMIN_PASSWORD`), запускается автодеплоем
- [x] **DONE** — Автодеплой: GitHub Actions → GHCR → SSH + docker compose ([DEPLOY.md](DEPLOY.md))
- [~] **PARTIAL** — Базовые воронки/справочники на чистом проде нужно создать вручную в админке (seed их не разворачивает)

---

## 10. Явно в ТЗ Skillaz, но у нас не закрыто / слабо

| Тема ТЗ | Статус | Комментарий |
|---|---|---|
| Dadata адреса | DONE | `GET /integrations/dadata/suggest` + UI AddressSuggest |
| Форма отклика (публичная) | DONE | `/public/apply/{vacancyId}` при `isPublicApply` |
| Процессные роли (runtime) | PARTIAL | Seed only |
| Enforce transitions по ролям | PARTIAL | JSON config, слабый runtime |
| Авторазмещения + регионы | DONE / PARTIAL | AutoPublishRule + worker 5м; regionHint; без geo-сервиса 95% |
| Extension multi-board + Store | DONE / PARTIAL | HH/SJ/Avito/ZP; Store — `apps/extension/STORE.md` (публикация вручную) |
| Полный каталог SMS/ВАТС | OUT_OF_SCOPE / MISSING | Generic adapters |
| Sync чата Avito | MISSING | Только HH Chat |
| Импорт XLSX всех объектов ТЗ | PARTIAL | 2 import / 4 export |
| Фильтр кандидатов по истории этапов | PARTIAL | Текущий этап |
| Кастомные поля (Table 1 lite) | DONE | `/custom-fields` + extra JSON |
| Конфигуратор Skillaz / облако вендора / LMS / OKR | OUT_OF_SCOPE | Не ATS LogHR |

---

## Сводка для PO

| Блок | Оценка |
|---|---|
| 1. Процесс заявка→оффер | **~95% DONE** (public apply есть) |
| 2. Витрина / фильтры | **~85% DONE** |
| 3. Админ / visibility / custom fields | **~85%** (custom fields + DaData; process roles слабо) |
| 4. Job boards | **~70%** (шаблоны + авторазмещения cron; HH live) |
| 5. Assessments / checks / offers | **~85% DONE** |
| 6. Integrations | **~65%** (+ DaData / HH Chat) |
| 7. Reports / Metabase | **~80% DONE** |
| 8. Extension | **~75%** (HH/SJ/Avito/ZP; Store — инструкция, публикация ручная) |
| 9. Tests / CI / prod | **~85%** |
| 10. Gaps | LMS/OKR/облако вендора Skillaz — **OUT_OF_SCOPE** |

**Вердикт:** ядро ATS + DaData + career apply + авторазмещения + multi-board extension закрыты. Облако Skillaz / LMS / OKR — другие продукты, не входят в LogHR ATS.
