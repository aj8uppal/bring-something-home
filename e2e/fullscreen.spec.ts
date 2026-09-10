import { test, expect } from '@playwright/test';
import { freshAccount } from './fixtures';

test('fullscreen follows title, gameplay and settings through browser exits and resizing', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await freshAccount(page, 'Full Screen');
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.tagName)).toBe('HTML');
  await expect(page.locator('#title-screen [data-action="fullscreen"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const canvas = document.querySelector('canvas')!.getBoundingClientRect();
        return Math.abs(canvas.width - innerWidth) < 2 && Math.abs(canvas.height - innerHeight) < 2;
      }),
    )
    .toBe(true);

  await page.getByRole('button', { name: 'Enter the wilds', exact: true }).click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#hearth-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await expect(page.locator('#hud [data-action="fullscreen"]')).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  const setting = page
    .getByRole('dialog')
    .getByRole('button', { name: 'Enter fullscreen', exact: true });
  await setting.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Exit fullscreen', exact: true }),
  ).toBeFocused();
  // A browser-owned exit must update every control, including the open settings panel.
  await page.evaluate(() => document.exitFullscreen());
  await expect(setting).toHaveText('Enter fullscreen');
  await expect(setting).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('#world').click({ position: { x: 400, y: 400 } });
  const before = await page.locator('#coordinates').textContent();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyW');
  await expect(page.locator('#coordinates')).not.toHaveText(before!);
  await page.keyboard.press('KeyR');
  await expect(page.locator('#safe-state')).toContainText('Sanctuary');
  expect(errors).toEqual([]);
});
