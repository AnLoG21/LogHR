// @ts-check
const { test, expect } = require('@playwright/test');

const WEB = process.env.WEB_URL || 'http://localhost:3000';
const API = process.env.API_URL || 'http://localhost:3001/api';

async function apiLogin(request) {
  let loginRes = await request.post(`${API}/auth/login`, {
    data: { email: 'admin@loghr.local', password: 'admin123' },
  });
  if (!loginRes.ok()) {
    loginRes = await request.post(`${API}/auth/login`, {
      data: { email: 'admin@taimyr.local', password: 'admin123' },
    });
  }
  expect(loginRes.ok()).toBeTruthy();
  const { accessToken } = await loginRes.json();
  return { Authorization: `Bearer ${accessToken}` };
}

async function uiLogin(page) {
  await page.goto(`${WEB}/login`);
  await page.fill('input[type="email"]', 'admin@loghr.local');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL(/candidates|dashboard|profile/, { timeout: 15000 });
  } catch {
    await page.fill('input[type="email"]', 'admin@taimyr.local');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/candidates/, { timeout: 20000 });
  }
}

test.describe('LogHR extended acceptance', () => {
  test('PATCH candidate + comment + flags', async ({ request }) => {
    const h = await apiLogin(request);
    const list = await request.get(`${API}/candidates?pageSize=1`, { headers: h });
    expect(list.ok()).toBeTruthy();
    const { items } = await list.json();
    expect(items?.length).toBeGreaterThan(0);
    const id = items[0].id;
    const city = `E2E-${Date.now()}`;
    const patch = await request.patch(`${API}/candidates/${id}`, {
      headers: h,
      data: { city },
    });
    expect(patch.ok()).toBeTruthy();
    const got = await request.get(`${API}/candidates/${id}`, { headers: h });
    expect((await got.json()).city).toBe(city);

    const comment = await request.post(`${API}/candidates/${id}/comments`, {
      headers: h,
      data: { body: 'e2e comment' },
    });
    expect(comment.ok()).toBeTruthy();

    const fav = await request.patch(`${API}/candidates/${id}/flags`, {
      headers: h,
      data: { isFavorite: true },
    });
    expect(fav.ok()).toBeTruthy();
  });

  test('admin users create + deactivate', async ({ request }) => {
    const h = await apiLogin(request);
    const email = `e2e_${Date.now()}@loghr.local`;
    const created = await request.post(`${API}/users`, {
      headers: h,
      data: {
        email,
        password: 'test1234',
        firstName: 'E2E',
        lastName: 'User',
        role: 'RECRUITER',
      },
    });
    expect(created.ok()).toBeTruthy();
    const user = await created.json();
    const off = await request.patch(`${API}/users/${user.id}`, {
      headers: h,
      data: { isActive: false },
    });
    expect(off.ok()).toBeTruthy();
    expect((await off.json()).isActive).toBe(false);
  });

  test('visibility profile create', async ({ request }) => {
    const h = await apiLogin(request);
    const stamp = Date.now();
    const name = `E2E profile ${stamp}`;
    const res = await request.post(`${API}/visibility`, {
      headers: h,
      data: { name, code: `e2e_${stamp}`, rules: { scope: 'orgUnit', description: 'e2e' } },
    });
    expect(res.ok()).toBeTruthy();
    const list = await request.get(`${API}/visibility`, { headers: h });
    expect(list.ok()).toBeTruthy();
    const rows = await list.json();
    expect(rows.some((r) => r.name === name)).toBeTruthy();
  });

  test('XLSX candidates export', async ({ request }) => {
    const h = await apiLogin(request);
    const res = await request.get(`${API}/import-export/export?entity=candidates`, { headers: h });
    expect(res.ok()).toBeTruthy();
    const buf = await res.body();
    expect(buf.byteLength).toBeGreaterThan(100);
  });

  test('publication templates CRUD + list UI', async ({ request, page }) => {
    const h = await apiLogin(request);
    const name = `E2E tpl ${Date.now()}`;
    const created = await request.post(`${API}/publications/templates`, {
      headers: h,
      data: { name, board: 'HH', body: { title: 'E2E title', pay: true } },
    });
    expect(created.ok()).toBeTruthy();
    const tpl = await created.json();
    const patched = await request.patch(`${API}/publications/templates/${tpl.id}`, {
      headers: h,
      data: { isActive: true, body: { title: 'E2E title 2' } },
    });
    expect(patched.ok()).toBeTruthy();

    await uiLogin(page);
    await page.goto(`${WEB}/publications?tab=templates`);
    await expect(page.getByText(name)).toBeVisible({ timeout: 15000 });
  });

  test('HH chat stub without token', async ({ request }) => {
    const h = await apiLogin(request);
    const list = await request.get(`${API}/candidates?pageSize=1`, { headers: h });
    const { items } = await list.json();
    const res = await request.get(`${API}/integrations/hh-chat/${items[0].id}`, { headers: h });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('configured');
    expect(body).toHaveProperty('messages');
    expect(Array.isArray(body.messages)).toBeTruthy();
  });

  test('public assessment + check flows', async ({ request, page }) => {
    const h = await apiLogin(request);
    const cands = await request.get(`${API}/candidates?pageSize=1`, { headers: h });
    const candidateId = (await cands.json()).items[0].id;

    const qs = await request.get(`${API}/assessments/questionnaires`, { headers: h });
    expect(qs.ok()).toBeTruthy();
    const questionnaires = await qs.json();
    const qid = Array.isArray(questionnaires) ? questionnaires[0]?.id : questionnaires?.items?.[0]?.id;
    expect(qid).toBeTruthy();

    const assigned = await request.post(`${API}/assessments/assign`, {
      headers: h,
      data: { candidateId, questionnaireId: qid },
    });
    expect(assigned.ok()).toBeTruthy();
    const asg = await assigned.json();
    const aToken = asg.externalToken;
    expect(aToken).toBeTruthy();

    const aApi = await request.get(`${API}/assessments/public/${aToken}`);
    expect(aApi.ok()).toBeTruthy();
    const aPage = await page.goto(`${WEB}/public/assessment/${aToken}`);
    expect(aPage?.status() || 200).toBeLessThan(500);

    const checks = await request.get(`${API}/checks?pageSize=5`, { headers: h });
    let cToken = null;
    if (checks.ok()) {
      const data = await checks.json();
      const items = data.items || data || [];
      cToken = items.find((x) => x.externalToken)?.externalToken;
    }
    if (!cToken) {
      const created = await request.post(`${API}/checks`, {
        headers: h,
        data: { candidateId, type: 'SECURITY' },
      });
      if (created.ok()) {
        cToken = (await created.json()).externalToken;
      }
    }
    if (cToken) {
      const cApi = await request.get(`${API}/checks/public/${cToken}`);
      expect(cApi.ok()).toBeTruthy();
      const cPage = await page.goto(`${WEB}/public/check/${cToken}`);
      expect(cPage?.status() || 200).toBeLessThan(500);
    }
  });
});
