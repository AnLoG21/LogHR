# Публикация в Chrome Web Store

LogHR extension готов как MV3 unpacked. Публикация в Store — ручной шаг владельца.

## Подготовка ZIP

1. Сгенерируйте иконки 16/48/128 (бренд LogHR, буква L) и положите в `apps/extension/icons/`
2. Добавьте блок `icons` в `manifest.json`
3. Уберите `http://localhost:3001/*` из `host_permissions` для прод-сборки (оставьте ваш API host)
4. Упакуйте содержимое папки `apps/extension` в ZIP (без лишних README при желании)

```powershell
Compress-Archive -Path apps\extension\* -DestinationPath loghr-extension.zip -Force
```

## Листинг

- **Name:** LogHR Job Boards Importer  
- **Summary:** Импорт резюме с HH, SuperJob, Avito, Zarplata в ATS LogHR  
- **Category:** Productivity  
- **Permissions justification:** `activeTab` — чтение DOM резюме; `storage` — API URL/token; host — job boards + ваш API  

## Privacy

Укажите: токен хранится локально в `chrome.storage`; резюме отправляется только на ваш LogHR API; данные не передаются третьим лицам.

## Аккаунт

Нужен [Chrome Web Store Developer](https://chrome.google.com/webstore/devconsole) (~$5 one-time). Загрузка ZIP → Review → Publish.
