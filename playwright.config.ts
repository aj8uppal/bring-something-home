import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export default defineConfig({
  testDir: './e2e',
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:18177',
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: existsSync(localChrome) ? localChrome : undefined,
      args:
        process.env.SOFTWARE_RENDERING ||
        (!existsSync(localChrome) && !process.env.NATIVE_RENDERING)
          ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
          : [],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'PORT=18177 DATA_PATH=data/e2e.sqlite node dist-server/server/main.js',
    url: 'http://127.0.0.1:18177/api/health',
    reuseExistingServer: false,
    timeout: 30000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
