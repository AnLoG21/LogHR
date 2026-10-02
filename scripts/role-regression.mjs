/**
 * API-level role regression for LogHR (docs/ROLE_REGRESSION.md).
 *
 * Usage:
 *   API_URL=https://hrm.infiit.ru/api node scripts/role-regression.mjs
 *   REGRESSION_PASSWORD=...  (shared password for seed users, default admin123)
 *
 * Env overrides per role:
 *   REGRESSION_ADMIN_EMAIL / REGRESSION_ADMIN_PASSWORD
 *   REGRESSION_RECRUITER_EMAIL / ...
 */
const API = (process.env.API_URL || 'https://hrm.infiit.ru/api').replace(/\/$/, '');
const DEFAULT_PASSWORD = process.env.REGRESSION_PASSWORD || 'admin123';

const ROLES = [
  { key: 'ADMIN', email: process.env.REGRESSION_ADMIN_EMAIL || 'admin@loghr.local' },
  { key: 'HR_BP', email: process.env.REGRESSION_HRBP_EMAIL || 'hrbp@loghr.local' },
  { key: 'RECRUITMENT_LEAD', email: process.env.REGRESSION_LEAD_EMAIL || 'lead@loghr.local' },
  { key: 'HIRING_MANAGER', email: process.env.REGRESSION_MANAGER_EMAIL || 'manager@loghr.local' },
  { key: 'RECRUITER', email: process.env.REGRESSION_RECRUITER_EMAIL || 'recruiter@loghr.local' },
  { key: 'SECURITY', email: process.env.REGRESSION_SECURITY_EMAIL || 'security@loghr.local' },
];

const results = [];

function note(role, check, ok, detail = '') {
  const row = { role, check, ok, detail };
  results.push(row);
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${role} · ${check}${detail ? ` — ${detail}` : ''}`);
}

async function raw(path, { method = 'GET', token, body, email } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, email };
}

async function login(email, password) {
  return raw('/auth/login', { method: 'POST', body: { email, password }, email });
}

async function main() {
  console.log(`API: ${API}\n`);

  const health = await raw('/health');
  note('SYSTEM', 'health', health.status === 200 && health.data?.status === 'ok', String(health.status));

  const sessions = [];
  for (const r of ROLES) {
    const password =
      process.env[`REGRESSION_${r.key}_PASSWORD`] ||
      process.env[`REGRESSION_${r.key.replace(/_/g, '')}_PASSWORD`] ||
      DEFAULT_PASSWORD;
    const res = await login(r.email, password);
    if ((res.status === 200 || res.status === 201) && res.data?.accessToken) {
      note(r.key, 'login', true, r.email);
      sessions.push({ ...r, token: res.data.accessToken, userId: res.data.user?.id || res.data.userId });
    } else {
      note(r.key, 'login', false, `${res.status} ${r.email} (skip role checks)`);
    }
  }

  for (const s of sessions) {
    const me = await raw('/auth/me', { token: s.token });
    note(s.key, 'auth/me', me.status === 200 && me.data?.role === s.key, me.data?.role || String(me.status));

    const cands = await raw('/candidates?pageSize=5', { token: s.token });
    note(s.key, 'candidates list', cands.status === 200 && typeof cands.data?.total === 'number', `total=${cands.data?.total}`);

    if (cands.data?.items?.[0]?.id) {
      const id = cands.data.items[0].id;
      const one = await raw(`/candidates/${id}`, { token: s.token });
      note(s.key, 'candidate get (visible)', one.status === 200, one.status === 200 ? id.slice(0, 8) : String(one.status));
    }

    const offers = await raw('/offers?pageSize=5', { token: s.token });
    note(s.key, 'offers list', offers.status === 200 || offers.status === 403, String(offers.status));

    const checks = await raw('/checks?pageSize=5', { token: s.token });
    note(s.key, 'checks list', checks.status === 200 || checks.status === 403, String(checks.status));

    const inbox = await raw('/integrations/max/inbox', { token: s.token });
    note(s.key, 'MAX inbox', inbox.status === 200 && typeof inbox.data?.unread === 'number', `unread=${inbox.data?.unread}`);

    const hub = await raw('/inbox/hub', { token: s.token });
    note(s.key, 'inbox hub', hub.status === 200 && Array.isArray(hub.data?.items), `total=${hub.data?.total}`);

    const audit = await raw('/audit?pageSize=5', { token: s.token });
    const auditAllowed = ['ADMIN', 'HR_BP', 'RECRUITMENT_LEAD'].includes(s.key);
    if (auditAllowed) {
      note(s.key, 'audit access', audit.status === 200, String(audit.status));
    } else {
      note(s.key, 'audit denied', audit.status === 403 || audit.status === 401, String(audit.status));
    }

    const qr = await raw('/integrations/max/quick-replies', { token: s.token });
    note(s.key, 'MAX quick-replies', qr.status === 200 && Array.isArray(qr.data), String(qr.status));
  }

  // Cross-role: recruiter must not open a candidate only visible to admin if we can find one
  const admin = sessions.find((s) => s.key === 'ADMIN');
  const recruiter = sessions.find((s) => s.key === 'RECRUITER');
  if (admin && recruiter) {
    const all = await raw('/candidates?pageSize=50', { token: admin.token });
    const mine = await raw('/candidates?pageSize=50', { token: recruiter.token });
    const adminIds = new Set((all.data?.items || []).map((c) => c.id));
    const recIds = new Set((mine.data?.items || []).map((c) => c.id));
    const onlyAdmin = [...adminIds].find((id) => !recIds.has(id));
    if (onlyAdmin) {
      const blocked = await raw(`/candidates/${onlyAdmin}`, { token: recruiter.token });
      note('RECRUITER', 'foreign candidate blocked', blocked.status === 403 || blocked.status === 404, String(blocked.status));
    } else {
      note('RECRUITER', 'foreign candidate blocked', true, 'no exclusive admin candidate in sample (skipped assert)');
    }
  }

  // Auth: rate-limit with disposable email (must not lock real users)
  const fake = `rl-test-${Date.now()}@example.invalid`;
  let got429 = false;
  for (let i = 0; i < 12; i++) {
    const res = await login(fake, 'wrong-password-xxx');
    if (res.status === 429) {
      got429 = true;
      break;
    }
  }
  note('SYSTEM', 'login rate-limit 429', got429, got429 ? 'locked after failures' : 'no 429 — check Redis/LOGIN_*');

  // Logout / refresh invalidation for first session
  if (sessions[0]) {
    const s = sessions[0];
    const login2 = await login(s.email, process.env[`REGRESSION_${s.key}_PASSWORD`] || DEFAULT_PASSWORD);
    if (login2.status === 200) {
      const refreshToken = login2.data.refreshToken;
      const userId = login2.data.user?.id || login2.data.userId;
      await raw('/auth/logout', { method: 'POST', token: login2.data.accessToken });
      const again = await raw('/auth/refresh', {
        method: 'POST',
        body: { userId, refreshToken },
      });
      note(s.key, 'logout invalidates refresh', again.status === 401 || again.status === 403, String(again.status));
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('Failed:');
    for (const f of failed) console.log(`  - ${f.role}: ${f.check} (${f.detail})`);
    process.exit(1);
  }
  console.log('ROLE_REGRESSION_OK');
}

main().catch((e) => {
  console.error('ROLE_REGRESSION_FAIL', e.message);
  process.exit(1);
});
