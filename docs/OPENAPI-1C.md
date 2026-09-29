# OpenAPI для 1С

Swagger UI: `http://localhost:3001/api/docs`

## Auth
`POST /api/auth/login` → `{ accessToken, refreshToken, user }`

Header: `Authorization: Bearer <accessToken>`

## Основные методы
| Метод | Описание |
|---|---|
| GET /api/org-units | Орг. единицы |
| GET /api/hiring-requests | Заявки |
| POST /api/hiring-requests | Создать заявку |
| POST /api/hiring-requests/:id/status | Смена статуса |
| GET /api/vacancies | Вакансии |
| GET /api/candidates | Кандидаты |
| POST /api/candidates | Создать кандидата |
| POST /api/candidates/:id/stage | Этап воронки |
| GET /api/users | Пользователи |
| POST /api/integrations/proaction/webhook | Результаты ProAction |

Импорт/экспорт: `/api/import-export/*`
