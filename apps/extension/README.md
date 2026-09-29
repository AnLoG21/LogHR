# Chrome extension — LogHR HH parser

Импорт резюме с hh.ru в LogHR ATS.

1. Откройте `chrome://extensions`
2. Включите «Режим разработчика»
3. «Загрузить распакованное» → папка `apps/extension`
4. Войдите в LogHR (http://localhost:3000), DevTools → Application → Local Storage → скопируйте `accessToken`
5. На странице резюме HH откройте popup расширения, вставьте token, нажмите «Добавить кандидата»

API: `POST /api/candidates` с полями из DOM резюме.  
Без валидного JWT импорт вернёт 401.

Env UI: `NEXT_PUBLIC_API_URL` (по умолчанию `http://localhost:3001`).
