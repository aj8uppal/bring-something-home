import { test, expect } from '@playwright/test';
import { veteran } from './fixtures';

const inventorySlot = (id: string) => `#hud-kit [data-hud-item="${id}"]`;
test('full satchels bulk salvage only outclassed gear and support protected, recoverable drops', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await veteran(page, 'Bag Keeper', {
    prepare: (p) => {
      const c = p.character!,
        weak = c.inventory[1];
      c.inventory.push(
        ...Array.from({ length: 13 }, (_, i) => ({ ...weak, id: `junk-${i}` })),
        { ...weak, id: 'protected', locked: true },
        { ...weak, id: 'collectible', relicId: 'archivist' },
      );
    },
  });
  const salvage = page.locator('#hud-kit [data-game="salvage"]');
  await expect(salvage).toContainText('14');
  await salvage.click();
  await expect(page.locator('#hud-kit .hud-inventory [data-hud-item]')).toHaveCount(4);
  await expect(page.locator(inventorySlot('test-tradeoff'))).toBeVisible();
  await expect(page.locator(inventorySlot('protected'))).toBeVisible();
  await expect(page.locator(inventorySlot('collectible'))).toBeVisible();
  await page.locator(inventorySlot('protected')).click({ button: 'right' });
  await expect(page.locator('#hud-kit .hud-inventory [data-hud-item]')).toHaveCount(4);
  await page.locator(inventorySlot('test-upgrade')).click({ button: 'right' });
  await expect(page.locator('#ground-loot .hud-slot[data-hud-item]')).toHaveCount(1);
  await page.keyboard.press('KeyB');
  await page.locator('[data-item="protected"]').click();
  await expect(page.locator('.item-detail [data-game="drop"]')).toBeDisabled();
  await page.locator('.item-detail [data-game="lock"]').click();
  await page.locator('.item-detail [data-game="drop"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#ground-loot .hud-slot[data-hud-item]')).toHaveCount(2);
  await page.keyboard.press('KeyX');
  await expect(page.locator('#hud-kit .hud-inventory [data-hud-item]')).toHaveCount(4);
  await expect(page.locator('#ground-loot')).toBeHidden();
  await page.screenshot({ path: 'docs/playtests/v5-inventory-hud.png' });
  expect(errors).toEqual([]);
});

test('ground bag has eight fixed slots, supports full-satchel swaps, and wheel input zooms without scrolling', async ({
  page,
}) => {
  await veteran(page, 'Quick Hands', {
    prepare: (p) => {
      const c = p.character!;
      c.inventory.push(
        ...Array.from({ length: 15 }, (_, i) => ({ ...c.inventory[1], id: `spare-${i}` })),
      );
    },
  });
  await page.locator(inventorySlot('test-upgrade')).click({ button: 'right' });
  await page.locator(inventorySlot('test-weaker')).click({ button: 'right' });
  await page.keyboard.press('KeyB');
  await page.locator('.panel-tabs [data-panel="forge"]').click();
  await page.locator('[data-game="craft"][data-id="archivist"]').click();
  await expect(page.locator('[data-game="craft"][data-id="archivist"]')).toBeEnabled();
  await page.locator('[data-game="craft"][data-id="archivist"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#hud-kit .hud-inventory [data-hud-item]')).toHaveCount(18);
  const bag = page.locator('#ground-loot');
  await expect(bag.locator('.hud-slot')).toHaveCount(8);
  await expect(bag.locator('[data-game="loot-all"]')).toBeDisabled();
  await bag.locator('[data-hud-item="test-upgrade"]').hover();
  const position = await page.locator('#coordinates').textContent();
  await bag.locator('[data-hud-item="test-upgrade"]').click({ modifiers: ['Shift'] });
  await expect(page.locator('.hud-equipment [data-hud-item="test-upgrade"]')).toBeVisible();
  await expect(page.locator('#hud-kit .hud-inventory [data-hud-item]')).toHaveCount(18);
  await expect(bag).toBeVisible();
  await expect(page.locator('#coordinates')).toHaveText(position!);
  await expect(bag.locator('[data-hud-item]')).toHaveCount(2);
  await bag.locator('[data-hud-item="test-weaker"]').hover();
  await expect(page.locator('#item-tooltip')).toContainText('Outclassed');
  await expect(bag.locator('table')).toHaveCount(0);
  const zoom = Number(await page.locator('#world').getAttribute('data-camera-zoom'));
  const box = (await bag.boundingBox())!;
  await page.mouse.move(box.x + 15, box.y + 20);
  await page.mouse.wheel(0, -120);
  await expect
    .poll(async () => Number(await page.locator('#world').getAttribute('data-camera-zoom')))
    .toBeLessThan(zoom);
  expect(await bag.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  for (let i = 0; i < 3; i++)
    await page.locator(inventorySlot(`spare-${i}`)).click({ button: 'right' });
  await expect(bag.locator('[data-hud-item]')).toHaveCount(5);
  await page.screenshot({ path: 'docs/playtests/v5-bag-comparison.png' });
  await page.mouse.move(500, 400);
  await expect(page.locator('#item-tooltip')).toBeHidden();
  await page.screenshot({ path: 'docs/playtests/v5-bag-hud.png' });
  await page.keyboard.press('KeyX');
  await expect(page.locator('#hud-kit .hud-inventory [data-hud-item]')).toHaveCount(18);
  await expect(bag.locator('[data-hud-item]')).toHaveCount(2);
  const vitals = (await page.locator('.player-panel').boundingBox())!,
    hotbar = (await page.locator('.hotbar').boundingBox())!;
  expect(Math.abs(vitals.x + vitals.width / 2 - hotbar.x - hotbar.width / 2)).toBeLessThan(2);
  expect(hotbar.y - vitals.y - vitals.height).toBeLessThan(20);
});

test('touch bag inspection and swapping fit portrait and landscape beside the combat HUD', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await veteran(page, 'Pocket Ember');
    await page.getByRole('button', { name: 'Open satchel', exact: true }).click();
    for (const id of ['test-upgrade', 'test-weaker']) {
      await page.locator(`[data-item="${id}"]`).click();
      await page.locator('.item-detail [data-game="drop"]').click();
    }
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    const bag = page.locator('#ground-loot');
    await expect(bag.locator('.hud-slot')).toHaveCount(8);
    await bag.locator('[data-hud-item="test-upgrade"]').tap();
    await expect(page.locator('#item-tooltip')).toBeVisible();
    await page.locator('#item-tooltip [data-game="loot-equip"]').tap();
    await expect(bag.locator('[data-hud-item="test-upgrade"]')).toHaveCount(0);
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      const rect = (await bag.boundingBox())!,
        hotbar = (await page.locator('.hotbar').boundingBox())!;
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);
      expect(rect.y + rect.height <= hotbar.y || rect.x >= hotbar.x + hotbar.width).toBeTruthy();
      const stick = (await page.locator('#aim-stick').boundingBox())!;
      expect(
        stick.y + stick.height <= hotbar.y ||
          stick.x >= hotbar.x + hotbar.width ||
          stick.x + stick.width <= hotbar.x,
      ).toBeTruthy();
      expect(
        rect.y + rect.height <= stick.y ||
          rect.x >= stick.x + stick.width ||
          rect.x + rect.width <= stick.x,
      ).toBeTruthy();
      expect(await bag.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `docs/playtests/v5-touch-bag-${viewport.width}.png` });
    }
  } finally {
    await context.close();
  }
});
