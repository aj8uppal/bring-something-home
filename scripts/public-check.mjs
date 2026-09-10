/** Public-host smoke check. Creates two disposable travelers and deletes only those accounts. */
import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const origin = process.argv[2];
if (!origin || !/^https?:\/\//.test(origin)) throw new Error('Pass the game origin explicitly.');
const output = resolve(process.argv[3] || '/tmp/bring-something-home-public-check');
mkdirSync(output, { recursive: true });
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const options = existsSync(chrome)
  ? { executablePath: chrome, args: [] }
  : { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] };
const browsers = [];
const accounts = [];
const errors = [];
const checks = [];
let failed;
let cleanedUp = 0;
const monitor = (page) => page.on('pageerror', (error) => errors.push(error.message));
try {
  for (let index = 0; index < 2; index++) {
    const browser = await chromium.launch(options);
    browsers.push(browser);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    monitor(page);
    await page.goto(origin);
    await expect(page).toHaveTitle('Bring Something Home — A cooperative bullet-hell RPG');
    const name = `Launch ${index} ${Date.now().toString(36).slice(-6)}`;
    await page.getByRole('textbox', { name: 'Traveler name' }).fill(name);
    if (index) await page.locator('[data-class="sentinel"]').click();
    await page.getByRole('button', { name: 'Enter the wilds', exact: true }).click();
    await expect(page.locator('#hud')).toBeVisible({ timeout: 20000 });
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('ew:token')));
    accounts.push({ page, name, token });
    await page.getByRole('button', { name: 'Follow the trail', exact: true }).click();
    await expect(page.locator('#player-name')).toHaveText(name);
  }
  checks.push('HTTPS signup and live WebSocket entry for Arcanist and Sentinel');
  const [first, second] = accounts;
  await expect(first.page.locator('.player-label').filter({ hasText: second.name })).toBeVisible();
  await expect(second.page.locator('.player-label').filter({ hasText: first.name })).toBeVisible();
  checks.push('Two independent browser processes see each other in the same realm');

  await first.page.bringToFront();
  await first.page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
  await expect.poll(() => first.page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await first.page.screenshot({ path: resolve(output, 'public-fullscreen.png') });
  await first.page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await expect.poll(() => first.page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  checks.push('Fullscreen enters and exits over HTTPS during a live expedition');

  await first.page.locator('#world').click({ position: { x: 400, y: 400 } });
  const before = await first.page.locator('#coordinates').textContent();
  await first.page.keyboard.down('KeyW');
  await first.page.waitForTimeout(500);
  await first.page.keyboard.up('KeyW');
  await expect(first.page.locator('#coordinates')).not.toHaveText(before);
  await first.page.keyboard.press('KeyR');
  await expect(first.page.locator('#safe-state')).toContainText('Sanctuary');
  checks.push('Movement and recall work after the fullscreen transition');

  const recovery = await first.page.evaluate(() => JSON.parse(localStorage.getItem('ew:recovery')));
  await first.page.reload();
  await first.page.getByRole('button', { name: 'Continue journey', exact: true }).click();
  await expect(first.page.locator('#player-name')).toHaveText(first.name);
  checks.push('Reload resumes the saved traveler');

  const restored = await browsers[1].newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  monitor(restored);
  await restored.goto(origin);
  await restored.getByRole('button', { name: /Already have a flame/ }).click();
  await restored.getByRole('textbox', { name: 'YOUR PRIVATE RECOVERY CODE' }).fill(recovery);
  await restored.getByRole('button', { name: 'Restore my traveler' }).click();
  await restored.getByRole('button', { name: 'Continue journey', exact: true }).click();
  await expect(restored.locator('#player-name')).toHaveText(first.name);
  first.token = await restored.evaluate(() => JSON.parse(localStorage.getItem('ew:token')));
  first.page = restored;
  await expect(restored.locator('#move-stick')).toBeVisible();
  await expect(restored.locator('#aim-stick')).toBeVisible();
  await restored.screenshot({ path: resolve(output, 'public-phone.png') });
  checks.push('A fresh touch browser restores the account using its private recovery code');

  const health = await (await restored.request.get(`${origin}/api/health`)).json();
  expect(health.status).toBe('ok');
  const privacy = await restored.request.get(`${origin}/privacy.html`);
  expect(privacy.status()).toBe(200);
  expect(await privacy.text()).toContain('Privacy & support');
  expect(
    (
      await restored.request.get(`${origin}/api/health`, {
        headers: { Origin: 'https://unrelated.invalid' },
      })
    ).status(),
  ).toBe(403);
  checks.push('Health, privacy page and foreign-origin rejection');
  expect(errors).toEqual([]);
} catch (error) {
  failed = error;
} finally {
  for (const account of accounts) {
    try {
      const response = await account.page.request.delete(`${origin}/api/account`, {
        headers: { Authorization: `Bearer ${account.token}` },
        data: { name: account.name },
      });
      if (!response.ok()) throw new Error(`Smoke account cleanup failed: ${response.status()}`);
      cleanedUp++;
    } catch (error) {
      failed ??= error;
    }
  }
  for (const browser of browsers) await browser.close();
  const result = {
    origin,
    checks,
    errors,
    cleanedUp,
    passed: !failed,
    failure: failed?.message,
  };
  writeFileSync(resolve(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
if (failed) throw failed;
