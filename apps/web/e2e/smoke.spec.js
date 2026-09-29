// @ts-check
const { test, expect } = require('@playwright/test');

const WEB = process.env.WEB_URL || 'http://localhost:3000';
const API = process.env.API_URL || 'http://localhost:3001/api';

async function login(page, email = 'admin@loghr.local') {
  await page.goto(`${WEB}/login`);
  await page.fill('input[type="email"]', email);
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

test.describe('LogHR acceptance', () => {
  test('login and profile', async ({ page }) => {
    await login(page);
    await page.goto(`${WEB}/profile`);
    await expect(page.getByText('Мой профиль')).toBeVisible({ timeout: 15000 });
  });

  test('menu routes load without 500', async ({ page }) => {
    await login(page);
    const routes = [
      '/candidates', '/vacancies', '/requests', '/org-units', '/demands', '/profiles', '/tasks',
      '/assessments', '/offers', '/checks', '/messengers', '/publications',
      '/admin', '/funnels', '/dictionaries', '/tags', '/notifications', '/pdn', '/visibility', '/reports', '/dashboard',
    ];
    for (const r of routes) {
      const res = await page.goto(`${WEB}${r}`);
      expect(res?.status() || 200, r).toBeLessThan(500);
    }
  });

  test('API happy-path: request → candidate stage', async ({ request }) => {
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
    const h = { Authorization: `Bearer ${accessToken}` };

    const funnels = await request.get(`${API}/funnels`, { headers: h });
    expect(funnels.ok()).toBeTruthy();

    const cands = await request.get(`${API}/candidates?pageSize=5`, { headers: h });
    expect(cands.ok()).toBeTruthy();
    const body = await cands.json();
    if (body.items?.[0]?.id && body.items[0].vacancy?.funnel?.stages?.[1]?.id) {
      const stageId = body.items[0].vacancy.funnel.stages[1].id;
      const st = await request.post(`${API}/candidates/${body.items[0].id}/stage`, {
        headers: h,
        data: { stageId, comment: 'e2e' },
      });
      expect(st.ok()).toBeTruthy();
    }

    const ai = await request.post(`${API}/ai/resume/parse`, {
      headers: h,
      data: { text: 'Тест Тестов\n+70000000000' },
    });
    expect(ai.ok()).toBeTruthy();
  });
});
