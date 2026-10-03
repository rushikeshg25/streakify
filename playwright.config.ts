import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:5190',
    trace: 'retain-on-failure',
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'node --import tsx server/index.ts',
    url: 'http://127.0.0.1:5190/api/auth',
    env: { PORT: '5190', NODE_ENV: 'production', STREAKIFY_DB: '/tmp/streakify-e2e.sqlite', DATABASE_URL: '', APP_PASSWORD: 'e2e-workspace-password', SESSION_SECRET: 'e2e-only-session-secret-not-for-deployment' },
    reuseExistingServer: false,
  },
});
