-- Metabase: подключите PostgreSQL skillaz и создайте вопросы по этим SQL

-- 1. Кандидаты на воронке
SELECT fs.name AS stage, COUNT(c.id) AS cnt
FROM "Candidate" c
LEFT JOIN "FunnelStage" fs ON fs.id = c."stageId"
WHERE c."isDepersonalized" = false
GROUP BY fs.name
ORDER BY cnt DESC;

-- 2. Причины / статусы проверок (прокси отказов)
SELECT status, COUNT(*) AS cnt
FROM "Check"
GROUP BY status;

-- 3. Эффективность каналов
SELECT source, COUNT(*) AS cnt
FROM "Candidate"
GROUP BY source
ORDER BY cnt DESC;

-- 4. Занятость рекрутера
SELECT u."lastName", u."firstName",
  (SELECT COUNT(*) FROM "HiringRequest" hr WHERE hr."recruiterId" = u.id) AS requests,
  (SELECT COUNT(*) FROM "Task" t WHERE t."assigneeId" = u.id AND t.status = 'OPEN') AS open_tasks
FROM "User" u
WHERE u.role IN ('RECRUITER', 'RECRUITMENT_LEAD');

-- 5. Реестр заявок
SELECT title, status, priority, city, "createdAt", "updatedAt"
FROM "HiringRequest"
ORDER BY "createdAt" DESC;

-- 6. Срок закрытия заявок (дни)
SELECT title,
  EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) / 86400 AS days_open
FROM "HiringRequest"
WHERE status = 'CLOSED';
