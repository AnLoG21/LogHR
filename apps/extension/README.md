# Chrome extension — LogHR Job Boards Importer

Импорт резюме с **HH / SuperJob / Avito / Zarplata** в LogHR ATS.

## Локальная установка (developer mode)

1. `chrome://extensions` → «Режим разработчика»
2. «Загрузить распакованное» → папка `apps/extension`
3. Войдите в LogHR, скопируйте `accessToken` из Local Storage
4. Откройте резюме на поддерживаемом сайте → popup → вставьте token → «Добавить кандидата»

API: `POST /api/candidates`.

## Chrome Web Store

См. [STORE.md](./STORE.md) — чеклист публикации (иконки, privacy, zip). Сама модерация Google выполняется вручную владельцем аккаунта разработчика.
