/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: './e2e',
  timeout: 60000,
  use: {
    baseURL: process.env.WEB_URL || 'http://localhost:3000',
    headless: true,
  },
};
