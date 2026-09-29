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

  const shots = [
    ['/candidates', 'loghr-candidates.png'],
    ['/requests', 'loghr-requests.png'],
    ['/admin', 'loghr-admin.png'],
    ['/funnels', 'loghr-funnels.png'],
    ['/dashboard', 'loghr-dashboard.png'],
    ['/visibility', 'loghr-visibility.png'],
  ];
  for (const [route, file] of shots) {
    await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, file), fullPage: false });
    console.log('ok', file);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
