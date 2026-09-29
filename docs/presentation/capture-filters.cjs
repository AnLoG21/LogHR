const { chromium } = require('@playwright/test');
const path = require('path');
const out = path.join(__dirname, 'assets');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const API = 'http://localhost:3001/api';
  const WEB = 'http://localhost:3000';

  const login = await page.request.post(`${API}/auth/login`, {
    data: { email: 'admin@loghr.local', password: 'admin123' },
  });
  const { accessToken, refreshToken, user } = await login.json();

  await page.goto(`${WEB}/login`);
  await page.evaluate(({ accessToken, refreshToken, user }) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('userId', user.id);
  }, { accessToken, refreshToken, user });

  await page.goto(`${WEB}/candidates`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(out, 'loghr-candidates.png'), fullPage: false });

  await page.getByText('+ Добавить фильтры', { exact: false }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, 'loghr-filters-process.png'), fullPage: false });

  await page.getByRole('button', { name: 'Источники' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, 'loghr-filters-sources.png'), fullPage: false });

  await page.getByRole('button', { name: 'По резюме' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, 'loghr-filters-resume.png'), fullPage: false });

  await page.getByRole('button', { name: 'Остальные' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, 'loghr-filters-other.png'), fullPage: false });

  console.log('captured filter shots');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
