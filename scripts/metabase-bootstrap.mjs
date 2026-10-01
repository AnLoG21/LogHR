/**
 * Auto-import LogHR dashboards into Metabase via REST API.
 *
 * Env:
 *   METABASE_URL          default http://localhost:3002
 *   METABASE_EMAIL        admin email (after first setup)
 *   METABASE_PASSWORD     admin password
 *   METABASE_SETUP_TOKEN  optional — if Metabase is not set up yet
 *   METABASE_DB_HOST      host of ATS Postgres as seen by Metabase container (default postgres)
 *   METABASE_DB_PORT      default 5432
 *   METABASE_DB_NAME      default skillaz
 *   METABASE_DB_USER      default skillaz
 *   METABASE_DB_PASS      default skillaz
 *
 * Usage: node scripts/metabase-bootstrap.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.METABASE_URL || 'http://localhost:3002').replace(/\/$/, '');
const EMAIL = process.env.METABASE_EMAIL || 'admin@loghr.local';
const PASSWORD = process.env.METABASE_PASSWORD || 'admin12345';
const DB_HOST = process.env.METABASE_DB_HOST || 'postgres';
const DB_PORT = Number(process.env.METABASE_DB_PORT || 5432);
const DB_NAME = process.env.METABASE_DB_NAME || process.env.POSTGRES_DB || 'loghr';
const DB_USER = process.env.METABASE_DB_USER || process.env.POSTGRES_USER || 'loghr';
const DB_PASS = process.env.METABASE_DB_PASS || process.env.POSTGRES_PASSWORD || 'loghr';

const QUESTIONS = [
  {
    name: 'LogHR: Кандидаты на воронке',
    sql: `SELECT fs.name AS stage, COUNT(c.id) AS cnt
FROM "Candidate" c
LEFT JOIN "FunnelStage" fs ON fs.id = c."stageId"
WHERE c."isDepersonalized" = false
GROUP BY fs.name
ORDER BY cnt DESC`,
  },
  {
    name: 'LogHR: Статусы проверок СБ',
    sql: `SELECT status, COUNT(*) AS cnt FROM "Check" GROUP BY status`,
  },
  {
    name: 'LogHR: Эффективность каналов',
    sql: `SELECT source, COUNT(*) AS cnt FROM "Candidate" GROUP BY source ORDER BY cnt DESC`,
  },
  {
    name: 'LogHR: Занятость рекрутера',
    sql: `SELECT u."lastName", u."firstName",
  (SELECT COUNT(*) FROM "HiringRequest" hr WHERE hr."recruiterId" = u.id) AS requests,
  (SELECT COUNT(*) FROM "Task" t WHERE t."assigneeId" = u.id AND t.status = 'OPEN') AS open_tasks
FROM "User" u
WHERE u.role IN ('RECRUITER', 'RECRUITMENT_LEAD')`,
  },
  {
    name: 'LogHR: Реестр заявок',
    sql: `SELECT title, status, priority, city, "createdAt", "updatedAt"
FROM "HiringRequest" ORDER BY "createdAt" DESC`,
  },
  {
    name: 'LogHR: Срок закрытия заявок',
    sql: `SELECT title,
  EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) / 86400 AS days_open
FROM "HiringRequest" WHERE status = 'CLOSED'`,
  },
];

async function api(method, p, body, session) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { 'X-Metabase-Session': session } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

async function waitReady(maxMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function ensureSession() {
  const login = await api('POST', '/api/session', { username: EMAIL, password: PASSWORD });
  if (login.ok && login.data?.id) return login.data.id;

  const props = await api('GET', '/api/session/properties');
  const setupToken = process.env.METABASE_SETUP_TOKEN || props.data?.['setup-token'];
  if (!setupToken) {
    throw new Error(
      `Не удалось войти в Metabase (${login.status}). Задайте METABASE_EMAIL/METABASE_PASSWORD или пройдите первый setup на ${BASE}`,
    );
  }

  const setup = await api('POST', '/api/setup', {
    token: setupToken,
    user: {
      email: EMAIL,
      password: PASSWORD,
      first_name: 'LogHR',
      last_name: 'Admin',
      site_name: 'LogHR',
    },
    database: {
      engine: 'postgres',
      name: 'LogHR ATS',
      details: {
        host: DB_HOST,
        port: DB_PORT,
        dbname: DB_NAME,
        user: DB_USER,
        password: DB_PASS,
        ssl: false,
      },
    },
    prefs: { site_name: 'LogHR', allow_tracking: false },
  });
  if (!setup.ok) {
    throw new Error(`Metabase setup failed: ${setup.status} ${JSON.stringify(setup.data)}`);
  }
  const again = await api('POST', '/api/session', { username: EMAIL, password: PASSWORD });
  if (!again.ok || !again.data?.id) throw new Error('Login after setup failed');
  return again.data.id;
}

async function ensureDatabase(session) {
  const list = await api('GET', '/api/database', null, session);
  const dbs = Array.isArray(list.data) ? list.data : list.data?.data || [];
  const existing = dbs.find(
    (d) => d.name === 'LogHR ATS' || (d.details?.dbname === DB_NAME && d.engine === 'postgres'),
  );
  if (existing) return existing.id;

  const created = await api(
    'POST',
    '/api/database',
    {
      engine: 'postgres',
      name: 'LogHR ATS',
      details: {
        host: DB_HOST,
        port: DB_PORT,
        dbname: DB_NAME,
        user: DB_USER,
        password: DB_PASS,
        ssl: false,
        'tunnel-enabled': false,
      },
      is_full_sync: true,
      auto_run_queries: true,
    },
    session,
  );
  if (!created.ok) throw new Error(`Create database failed: ${created.status} ${JSON.stringify(created.data)}`);
  return created.data.id;
}

async function ensureCollection(session) {
  const list = await api('GET', '/api/collection', null, session);
  const cols = Array.isArray(list.data) ? list.data : [];
  const found = cols.find((c) => c.name === 'LogHR');
  if (found) return found.id;
  const created = await api('POST', '/api/collection', { name: 'LogHR', color: '#0d9488' }, session);
  if (!created.ok) throw new Error(`Create collection failed: ${JSON.stringify(created.data)}`);
  return created.data.id;
}

async function ensureCard(session, databaseId, collectionId, q) {
  const search = await api('GET', `/api/card?f=all`, null, session);
  const cards = Array.isArray(search.data) ? search.data : [];
  const existing = cards.find((c) => c.name === q.name);
  const payload = {
    name: q.name,
    dataset_query: {
      type: 'native',
      native: { query: q.sql },
      database: databaseId,
    },
    display: 'table',
    visualization_settings: {},
    collection_id: collectionId,
  };
  if (existing) {
    const upd = await api('PUT', `/api/card/${existing.id}`, payload, session);
    if (!upd.ok) throw new Error(`Update card ${q.name}: ${JSON.stringify(upd.data)}`);
    return existing.id;
  }
  const created = await api('POST', '/api/card', payload, session);
  if (!created.ok) throw new Error(`Create card ${q.name}: ${JSON.stringify(created.data)}`);
  return created.data.id;
}

async function ensureDashboard(session, collectionId, cardIds) {
  const list = await api('GET', '/api/dashboard', null, session);
  const dashboards = Array.isArray(list.data) ? list.data : [];
  let dash = dashboards.find((d) => d.name === 'LogHR ATS');
  if (!dash) {
    const created = await api(
      'POST',
      '/api/dashboard',
      { name: 'LogHR ATS', description: 'Автоимпорт из docs/metabase-dashboards.sql', collection_id: collectionId },
      session,
    );
    if (!created.ok) throw new Error(`Create dashboard: ${JSON.stringify(created.data)}`);
    dash = created.data;
  }

  const detail = await api('GET', `/api/dashboard/${dash.id}`, null, session);
  const existingCards = detail.data?.ordered_cards || detail.data?.dashcards || [];
  if (existingCards.length >= cardIds.length) return dash.id;

  // Metabase 0.49+: PUT /api/dashboard/:id with dashcards
  const dashcards = cardIds.map((cardId, i) => ({
    id: -1 - i,
    card_id: cardId,
    row: Math.floor(i / 2) * 4,
    col: (i % 2) * 12,
    size_x: 12,
    size_y: 4,
  }));
  const put = await api(
    'PUT',
    `/api/dashboard/${dash.id}`,
    {
      name: 'LogHR ATS',
      description: 'Автоимпорт из docs/metabase-dashboards.sql',
      collection_id: collectionId,
      dashcards,
    },
    session,
  );
  if (!put.ok) {
    // Fallback older API
    for (let i = 0; i < cardIds.length; i++) {
      await api(
        'POST',
        `/api/dashboard/${dash.id}/cards`,
        { cardId: cardIds[i], row: Math.floor(i / 2) * 4, col: (i % 2) * 12, sizeX: 12, sizeY: 4 },
        session,
      );
    }
  }
  return dash.id;
}

async function main() {
  console.log(`Metabase bootstrap → ${BASE}`);
  const ready = await waitReady();
  if (!ready) {
    console.error('Metabase не отвечает. Поднимите: npm run docker:up');
    process.exit(1);
  }

  const session = await ensureSession();
  console.log('session ok');
  const databaseId = await ensureDatabase(session);
  console.log('database id', databaseId);
  const collectionId = await ensureCollection(session);
  console.log('collection id', collectionId);

  const cardIds = [];
  for (const q of QUESTIONS) {
    const id = await ensureCard(session, databaseId, collectionId, q);
    cardIds.push(id);
    console.log('card', q.name, id);
  }

  const dashId = await ensureDashboard(session, collectionId, cardIds);
  console.log('dashboard id', dashId);
  console.log(`METABASE_OK ${BASE}/dashboard/${dashId}`);

  // Keep SQL pack in sync note
  const sqlPath = path.join(__dirname, '..', 'docs', 'metabase-dashboards.sql');
  if (fs.existsSync(sqlPath)) {
    console.log('SQL source:', sqlPath);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
