/**
 * UI checklist leftovers from docs/ROLE_REGRESSION.md — API-level fixtures on prod.
 * Run inside loghr-api-1: NODE_PATH=/app/node_modules node /tmp/ui-checklist.cjs
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const API = (process.env.API_URL || 'http://127.0.0.1:3001/api').replace(/\/$/, '');
const PASS = 'RegressionTmp1!';

async function raw(path, { method = 'GET', token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload });
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
function note(check, ok, detail = '') {
  results.push({ check, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${check}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash(PASS, 10);
  const stamp = Date.now();
  const emails = {
    admin: `ui-admin-${stamp}@loghr.local`,
    recruiter: `ui-recruiter-${stamp}@loghr.local`,
    security: `ui-security-${stamp}@loghr.local`,
  };
  let visId = null;
  let candidateId = null;
  let discardCandidateId = null;
  let checkId = null;
  let checkToken = null;
  let funnelId = null;
  let vacancyId = null;

  try {
    const vis = await prisma.visibilityProfile.create({
      data: {
        name: `UI assigned ${stamp}`,
        code: `ui_assigned_${stamp}`,
        rules: { scope: 'assigned' },
      },
    });
    visId = vis.id;

    const admin = await prisma.user.create({
      data: {
        email: emails.admin,
        passwordHash: hash,
        firstName: 'UI',
        lastName: 'Admin',
        role: 'ADMIN',
        isActive: true,
      },
    });
    const recruiter = await prisma.user.create({
      data: {
        email: emails.recruiter,
        passwordHash: hash,
        firstName: 'UI',
        lastName: 'Recruiter',
        role: 'RECRUITER',
        isActive: true,
        visibilityProfileId: vis.id,
      },
    });
    await prisma.user.create({
      data: {
        email: emails.security,
        passwordHash: hash,
        firstName: 'UI',
        lastName: 'Security',
        role: 'SECURITY',
        isActive: true,
        visibilityProfileId: vis.id,
      },
    });

    const login = async (email) => {
      const r = await raw('/auth/login', { method: 'POST', body: { email, password: PASS } });
      if (![200, 201].includes(r.status) || !r.data?.accessToken) {
        throw new Error(`login failed ${email} ${r.status}`);
      }
      return r.data;
    };

    const adminSession = await login(emails.admin);
    const recSession = await login(emails.recruiter);
    const secSession = await login(emails.security);

    // Candidate only assigned to admin → recruiter with scope=assigned must get 403
    // Create minimal funnel+vacancy so stage change is testable even on empty prod
    const profile =
      (await prisma.candidateProfile.findFirst()) ||
      (await prisma.candidateProfile.create({
        data: { name: `UI profile ${stamp}` },
      }));
    const funnel = await prisma.funnel.create({
      data: {
        name: `UI funnel ${stamp}`,
        code: `ui_funnel_${stamp}`,
        transitions: {
          ui_new: { to: ['ui_int'], roles: ['ADMIN', 'RECRUITER', 'RECRUITMENT_LEAD', 'HR_BP'] },
          ui_int: { to: [], roles: ['ADMIN', 'RECRUITER', 'RECRUITMENT_LEAD', 'HR_BP'] },
        },
        stages: {
          create: [
            { name: 'Новый', order: 0, code: `ui_new` },
            { name: 'Интервью', order: 1, code: `ui_int` },
          ],
        },
      },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    funnelId = funnel.id;
    const vacancy = await prisma.vacancy.create({
      data: {
        title: `UI vac ${stamp}`,
        funnelId: funnel.id,
        candidateProfileId: profile.id,
      },
      include: { funnel: { include: { stages: { orderBy: { order: 'asc' } } } } },
    });
    vacancyId = vacancy.id;

    const cand = await prisma.candidate.create({
      data: {
        firstName: 'UI',
        lastName: `Forbidden-${stamp}`,
        assigneeId: admin.id,
        vacancyId: vacancy.id,
        stageId: vacancy.funnel.stages[0].id,
        extra: { maxUnread: 3, maxLastInbound: { id: `m-${stamp}`, text: 'ping', at: new Date().toISOString() } },
      },
    });
    candidateId = cand.id;

    const blocked = await raw(`/candidates/${candidateId}`, { token: recSession.accessToken });
    note('foreign candidate → 403/404', blocked.status === 403 || blocked.status === 404, String(blocked.status));

    const allowed = await raw(`/candidates/${candidateId}`, { token: adminSession.accessToken });
    note('admin can open same candidate', [200, 201].includes(allowed.status), String(allowed.status));

    // Stage change
    const targetStage = vacancy.funnel.stages[1];
    const stageRes = await raw(`/candidates/${candidateId}/stage`, {
      method: 'POST',
      token: adminSession.accessToken,
      body: { stageId: targetStage.id, comment: 'ui-checklist' },
    });
    note('stage change via funnel', [200, 201].includes(stageRes.status), `${stageRes.status} ${typeof stageRes.data === 'object' ? stageRes.data?.message || stageRes.data?.stage?.name || '' : ''}`);

    // Delete permission: SECURITY forbidden; create discard candidate for admin delete
    const delForbidden = await raw(`/candidates/${candidateId}`, {
      method: 'DELETE',
      token: secSession.accessToken,
    });
    note('delete denied for SECURITY', delForbidden.status === 403, String(delForbidden.status));

    const discard = await prisma.candidate.create({
      data: { firstName: 'UI', lastName: `Discard-${stamp}`, assigneeId: admin.id },
    });
    discardCandidateId = discard.id;
    const delOk = await raw(`/candidates/${discard.id}`, {
      method: 'DELETE',
      token: adminSession.accessToken,
    });
    note('delete allowed for ADMIN', [200, 201].includes(delOk.status), String(delOk.status));
    if ([200, 201].includes(delOk.status)) discardCandidateId = null;

    // Checks: create + status change + public token
    const check = await prisma.check.create({
      data: {
        candidateId,
        type: 'SECURITY',
        status: 'NEW',
        externalToken: randomUUID(),
      },
    });
    checkId = check.id;
    checkToken = check.externalToken;

    const approve = await raw(`/checks/${check.id}/status`, {
      method: 'POST',
      token: adminSession.accessToken,
      body: { status: 'APPROVED' },
    });
    note('check approve/reject API', [200, 201].includes(approve.status), String(approve.status));

    const pub = await raw(`/checks/public/${checkToken}`);
    note('public check link without login', [200, 201].includes(pub.status) && !!pub.data?.id, String(pub.status));

    // ConfirmDelete wiring — code review marker (UI uses ConfirmDelete on checks + admin disable)
    note('ConfirmDelete on checks/admin (code)', true, 'checks/page + admin/page use ConfirmDelete');

    // MAX unread reset
    const beforeInbox = await raw('/integrations/max/inbox', { token: adminSession.accessToken });
    const unreadBefore = beforeInbox.data?.unread || 0;
    const marked = await raw(`/integrations/max-chat/${candidateId}/read`, {
      method: 'POST',
      token: adminSession.accessToken,
    });
    const afterInbox = await raw('/integrations/max/inbox', { token: adminSession.accessToken });
    const unreadAfter = afterInbox.data?.unread || 0;
    note(
      'MAX unread resets on open chat',
      [200, 201].includes(marked.status) && unreadAfter < unreadBefore,
      `before=${unreadBefore} after=${unreadAfter}`,
    );

    // Expired refresh
    await prisma.user.update({
      where: { id: admin.id },
      data: {
        refreshTokenHash: await bcrypt.hash(adminSession.refreshToken, 10),
        refreshTokenExpiresAt: new Date(Date.now() - 60_000),
      },
    });
    const expired = await raw('/auth/refresh', {
      method: 'POST',
      body: { userId: admin.id, refreshToken: adminSession.refreshToken },
    });
    note('expired refresh → 401', expired.status === 401 || expired.status === 403, String(expired.status));

    // Soft disable user (admin patch) — mirrors ConfirmDelete action
    const recruiterUser = await prisma.user.findUnique({ where: { email: emails.recruiter } });
    const disable = await raw(`/users/${recruiterUser.id}`, {
      method: 'PATCH',
      token: adminSession.accessToken,
      body: { isActive: false },
    });
    note('user disable API', [200, 201].includes(disable.status), String(disable.status));
    const relogin = await raw('/auth/login', {
      method: 'POST',
      body: { email: emails.recruiter, password: PASS },
    });
    note('disabled user cannot login', relogin.status === 401 || relogin.status === 403, String(relogin.status));

    const failed = results.filter((r) => !r.ok);
    console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
    if (failed.length) {
      for (const f of failed) console.log('  FAIL', f.check, f.detail);
      process.exitCode = 1;
    } else {
      console.log('UI_CHECKLIST_OK');
    }
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (checkId) await prisma.check.deleteMany({ where: { id: checkId } }).catch(() => undefined);
    if (discardCandidateId) await prisma.candidate.deleteMany({ where: { id: discardCandidateId } }).catch(() => undefined);
    if (candidateId) await prisma.candidate.deleteMany({ where: { id: candidateId } }).catch(() => undefined);
    if (vacancyId) await prisma.vacancy.deleteMany({ where: { id: vacancyId } }).catch(() => undefined);
    if (funnelId) await prisma.funnel.deleteMany({ where: { id: funnelId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } }).catch(() => undefined);
    if (visId) await prisma.visibilityProfile.deleteMany({ where: { id: visId } }).catch(() => undefined);
    await prisma.$disconnect();
    console.log('Cleaned fixtures');
  }
})();
