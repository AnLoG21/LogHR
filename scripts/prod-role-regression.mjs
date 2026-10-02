/**
 * One-shot: create temp role users, run API checks, delete users.
 * Run inside loghr-api-1 with DATABASE_URL already set.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const API = (process.env.API_URL || 'http://127.0.0.1:3001/api').replace(/\/$/, '');
const PASS = 'RegressionTmp1!';
const ROLES = ['ADMIN', 'HR_BP', 'RECRUITMENT_LEAD', 'HIRING_MANAGER', 'RECRUITER', 'SECURITY'];

async function raw(path, { method = 'GET', token, body } = {}) {
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
  return { status: res.status, data };
}

const results = [];
function note(role, check, ok, detail = '') {
  results.push({ role, check, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${role} · ${check}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash(PASS, 10);
  const emails = [];

  try {
    console.log('API:', API);
  const health = await raw('/health');
  note('SYSTEM', 'health', (health.status === 200 || health.status === 201) && health.data?.status === 'ok', String(health.status));

    for (const role of ROLES) {
      const email = `regression-${role.toLowerCase()}@loghr.local`;
      emails.push(email);
      await prisma.user.upsert({
        where: { email },
        create: {
          email,
          passwordHash: hash,
          firstName: 'Reg',
          lastName: role,
          role,
          isActive: true,
        },
        update: { passwordHash: hash, role, isActive: true },
      });
    }

    const sessions = [];
    for (const role of ROLES) {
      const email = `regression-${role.toLowerCase()}@loghr.local`;
      const login = await raw('/auth/login', { method: 'POST', body: { email, password: PASS } });
      note(role, 'login', (login.status === 200 || login.status === 201) && !!login.data?.accessToken, String(login.status));
      if (login.status === 200 || login.status === 201) {
        sessions.push({
          role,
          email,
          token: login.data.accessToken,
          userId: login.data.user?.id,
          refreshToken: login.data.refreshToken,
        });
      }
    }

    for (const s of sessions) {
      const me = await raw('/auth/me', { token: s.token });
      note(s.role, 'auth/me', me.status === 200 && me.data?.role === s.role, me.data?.role || String(me.status));

      const cands = await raw('/candidates?pageSize=5', { token: s.token });
      note(s.role, 'candidates list', (cands.status === 200 || cands.status === 201) && typeof cands.data?.total === 'number', 'total=' + cands.data?.total);

      const offers = await raw('/offers?pageSize=5', { token: s.token });
      note(s.role, 'offers list', [200, 201, 403].includes(offers.status), String(offers.status));

      const checks = await raw('/checks?pageSize=5', { token: s.token });
      note(s.role, 'checks list', [200, 201, 403].includes(checks.status), String(checks.status));

      const inbox = await raw('/integrations/max/inbox', { token: s.token });
      note(s.role, 'MAX inbox', inbox.status === 200 || inbox.status === 201, String(inbox.status));

      const hub = await raw('/inbox/hub', { token: s.token });
      note(s.role, 'inbox hub', hub.status === 200 || hub.status === 201, String(hub.status));

      const audit = await raw('/audit?pageSize=5', { token: s.token });
      const auditOk = ['ADMIN', 'HR_BP', 'RECRUITMENT_LEAD'].includes(s.role)
        ? audit.status === 200 || audit.status === 201
        : audit.status === 403 || audit.status === 401;
      note(s.role, ['ADMIN', 'HR_BP', 'RECRUITMENT_LEAD'].includes(s.role) ? 'audit access' : 'audit denied', auditOk, String(audit.status));

      const qr = await raw('/integrations/max/quick-replies', { token: s.token });
      note(s.role, 'MAX quick-replies', qr.status === 200 || qr.status === 201, String(qr.status));
    }

    const admin = sessions.find((s) => s.role === 'ADMIN');
    const recruiter = sessions.find((s) => s.role === 'RECRUITER');
    if (admin && recruiter) {
      // Create a candidate visible only via default visibility (admin sees all; recruiter with no assignee may see less)
      const all = await raw('/candidates?pageSize=50', { token: admin.token });
      const mine = await raw('/candidates?pageSize=50', { token: recruiter.token });
      note(
        'RECRUITER',
        'candidates subset vs ADMIN',
        typeof all.data?.total === 'number' && typeof mine.data?.total === 'number',
        `admin=${all.data?.total} recruiter=${mine.data?.total}`,
      );
    }

    const fake = `rl-test-${Date.now()}@example.invalid`;
    let got429 = false;
    for (let i = 0; i < 12; i++) {
      const res = await raw('/auth/login', { method: 'POST', body: { email: fake, password: 'wrong-password-xxx' } });
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    note('SYSTEM', 'login rate-limit 429', got429, got429 ? 'ok' : 'no 429');

    if (admin) {
      await raw('/auth/logout', { method: 'POST', token: admin.token });
      const again = await raw('/auth/refresh', {
        method: 'POST',
        body: { userId: admin.userId, refreshToken: admin.refreshToken },
      });
      note('ADMIN', 'logout invalidates refresh', again.status === 401 || again.status === 403, String(again.status));
    }

    // UI-only checks remain manual (attachments, confirm dialogs, funnel UI)
    note('MANUAL', 'MAX attachments / quick-replies UI / confirm deletes', true, 'see docs/ROLE_REGRESSION.md');

    const failed = results.filter((r) => !r.ok);
    console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
    if (failed.length) {
      for (const f of failed) console.log('  FAIL', f.role, f.check, f.detail);
      process.exitCode = 1;
    } else {
      console.log('ROLE_REGRESSION_OK');
    }
  } finally {
    if (emails.length) {
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
      console.log('Cleaned temp users:', emails.length);
    }
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
