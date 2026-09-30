import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against a production build with a dedicated database (see e2e/global-setup.ts).
const PORT = 3100;
// Lets tests cut off the offline worker's own requests too (context.setOffline does not).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
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
      DATABASE_URL: E2E_DATABASE_URL, APP_URL: `http://localhost:${PORT}`, MAIL_DRIVER: 'file', SMS_DRIVER: 'file', PLATFORM_ADMIN_EMAILS: 'ops@talentral.ng', STORAGE_DRIVER: 'local', CRON_SECRET: 'e2e-cron-secret', SIGN_IN_LINKS_PER_HOUR: '100',
      ROOT_DOMAIN: '', NEXT_TELEMETRY_DISABLED: '1', AI_DRIVER: 'fake', CRON_ALLOW_CLOCK: '1',
    },
  },
});
