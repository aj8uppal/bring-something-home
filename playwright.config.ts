import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// CI has no GPU, so every page load builds the realm through a CPU rasterizer at about
// ten frames a second. The world is three times the radius it was when 45 seconds was
// chosen, and the tests that walk somewhere now sit close enough to that ceiling to fail
// on runner load rather than on anything they assert. A timeout is patience, not a
// claim: give the software path more of it and leave the assertions alone.
const software =
  !!process.env.SOFTWARE_RENDERING || (!existsSync(localChrome) && !process.env.NATIVE_RENDERING);
export default defineConfig({
  testDir: './e2e',
  timeout: software ? 120000 : 45000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:18177',
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: existsSync(localChrome) ? localChrome : undefined,
      args: software ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [],
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
