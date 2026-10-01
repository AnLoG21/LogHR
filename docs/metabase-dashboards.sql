-- Metabase / любой SQL-клиент: подключите PostgreSQL (БД loghr) и создайте вопросы по этим SQL

-- 1. Кандидаты на воронке
SELECT fs.name AS stage, COUNT(c.id) AS cnt
FROM "Candidate" c
LEFT JOIN "FunnelStage" fs ON fs.id = c."stageId"
WHERE c."isDepersonalized" = false
GROUP BY fs.name
ORDER BY cnt DESC;

-- 2. Эффективность каналов
SELECT source, COUNT(*) AS cnt
FROM "Candidate"
GROUP BY source
ORDER BY cnt DESC;

-- 3. Занятость рекрутера
SELECT u."lastName", u."firstName",
  (SELECT COUNT(*) FROM "HiringRequest" hr WHERE hr."recruiterId" = u.id) AS requests,
  (SELECT COUNT(*) FROM "Task" t WHERE t."assigneeId" = u.id AND t.status = 'OPEN') AS open_tasks
FROM "User" u
WHERE u.role IN ('RECRUITER', 'RECRUITMENT_LEAD');

-- 4. Реестр заявок (план/факт по статусу)
SELECT title, status, priority, city, "createdAt", "updatedAt",
  CASE WHEN status = 'CLOSED'
    THEN ROUND(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) / 86400)
    ELSE ROUND(EXTRACT(EPOCH FROM (NOW() - "createdAt")) / 86400)
  END AS days_open
FROM "HiringRequest"
ORDER BY "createdAt" DESC;

-- 5. Срок закрытия заявок (факт)
SELECT title,
  ROUND(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) / 86400, 1) AS days_open
FROM "HiringRequest"
WHERE status = 'CLOSED'
ORDER BY days_open DESC;

-- 6. Средний срок закрытия
SELECT ROUND(AVG(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) / 86400)::numeric, 1) AS avg_days
FROM "HiringRequest"
WHERE status = 'CLOSED';

-- 7. Статусы проверок СБ
SELECT status, COUNT(*) AS cnt
FROM "Check"
GROUP BY status;
