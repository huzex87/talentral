import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against a production build with a dedicated database (see e2e/global-setup.ts).
const PORT = 3100;
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://talentral:talentral@localhost:5432/talentral_e2e';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Pixel 7'],
    screenshot: 'only-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `pnpm start --port ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: E2E_DATABASE_URL, APP_URL: `http://localhost:${PORT}`, MAIL_DRIVER: 'file', SMS_DRIVER: 'file', STORAGE_DRIVER: 'local',
      ROOT_DOMAIN: '', NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
