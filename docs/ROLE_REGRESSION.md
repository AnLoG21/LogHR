# Регресс по ролям (после visibility / аудита)

Проверить под каждой ролью: `ADMIN`, `RECRUITMENT_LEAD`, `RECRUITER`, `HR_BP`, `HIRING_MANAGER`, `SECURITY`.

## Автопрогоны
- API ролей: `scripts/prod-role-regression.mjs` → **59/59 PASS** (2026-10-02)
- UI-чеклист (фикстуры): `scripts/ui-checklist-regression.mjs` → **12/12 PASS** (2026-10-02)

## Кандидаты
- [x] Список показывает только разрешённых кандидатов (API: SECURITY total=0 vs ADMIN=1)
- [x] Открытие чужой карточки → 403 (scope=assigned, assignee≠user)
- [x] Смена этапа по воронке вакансии (API → этап «Интервью»)
- [x] Удаление: SECURITY 403, ADMIN 200

## Офферы и проверки
- [x] Список офферов/проверок доступен по ролям (API 200)
- [x] Одобрение проверки (API) + UI `ConfirmDelete` на `/checks`
- [x] Публичная ссылка `/checks/public/:token` без логина → 200

## MAX
- [x] Диалоги/inbox фильтруются visibility (API)
- [~] Вложения исходящие/входящие — реализованы в коде/деплое; live E2E зависит от реального MAX-чата
- [x] Быстрые ответы API доступны
- [x] Непрочитанные сбрасываются при markRead (3 → 0)

## Auth
- [x] 8+ неверных логинов → 429 (Redis)
- [x] Logout сбрасывает refresh → 401
- [x] Истёкший refresh → 401

## Админ
- [x] Журнал `/audit` виден ADMIN/HR_BP/LEAD; остальным 403
- [x] Отключение пользователя (API) + UI `ConfirmDelete` на `/admin`; disabled → login 401
