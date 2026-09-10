import { test, expect } from '@playwright/test';
import { veteran } from './fixtures';
import { ensureLegacy } from '../shared/endgame';

test('a new signup is shown the gate, not briefed: no modal, one card, a banner that yields to movement', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Traveler name' }).fill('New Dawn');
  await page.getByRole('button', { name: 'Enter the wilds', exact: true }).click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const banner = page.locator('#hearth-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Fight together. Die alone. Keep what you bank.');
  await expect(banner).toContainText('Trouble is at the gate. Head north.');
  await expect(banner).not.toContainText(/banked|shards|relics/);
  await expect(page.locator('#quest-name')).toContainText(
    'Kill three of the creatures at the gate',
  );
  await expect(page.locator('#quest-text')).toContainText('Creatures 0/3');
  await expect(page.locator('#quest-reward')).not.toContainText(/T2|charm|ember/);
  await expect(page.locator('.hunt-card')).toBeHidden();
  await expect(page.locator('#event-banner')).toBeHidden();
  expect(await page.locator('.objective-stack > :visible').count()).toBe(1);
  await expect(page.locator('#objective-name')).toHaveText('Trouble at the gate');
  // A stranger can name their damage, their rate, and their objective without opening anything.
  const stats = page.locator('#hud-stats');
  await expect(stats.locator('[data-stat="damage"] b')).toHaveText(/^\d+$/);
  await expect(stats.locator('[data-stat="rate"] b')).toHaveText(/^[\d.]+\/s$/);
  await expect(stats.locator('[data-stat="hp"] b')).toHaveText(/^\d+$/);
  await expect(page.locator('#minimap-zoom')).toHaveText('120m');
  // Three living wardens, three light columns; the set follows the realm's seals.
  await expect(page.locator('#world')).toHaveAttribute('data-beacons', '3');
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'docs/playtests/v7-spawn-view.png' });
  // The first step is the whole tutorial dismissal.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(450);
  await page.keyboard.up('KeyW');
  await expect(banner).toBeHidden({ timeout: 3000 });
  await expect(page.locator('#xp-label')).toContainText('78 XP');
  await page.keyboard.press('KeyJ');
  await expect(page.locator('.journey-overview')).toBeInViewport();
  await expect(page.locator('.journey-payoff')).toContainText('Prepare for your first warden');
  await expect(page.locator('.foundation-lore')).toContainText('Crown of Ash');
  await expect(page.locator('.region-guide').first()).toContainText('LV 15–20');
  await expect(page.locator('.chapter-step')).toHaveCount(8);
});

test('an earned warden milestone leads directly to the Archive, with preparation and a working rally', async ({
  page,
}) => {
  await veteran(page, 'Trailkeeper', {
    freshRealm: true,
    prepare(profile) {
      const c = profile.character!;
      c.quest = 2;
      c.kills = 24;
      c.level = 8;
      c.bosses = ['rootwarden'];
      profile.victories = 0;
    },
  });
  await expect(page.locator('#quest-name')).toHaveText('Clear Sunken Archive');
  await expect(page.locator('#objective-name')).toContainText('Sunken Archive');
  await page.keyboard.press('KeyJ');
  await expect(page.locator('.journey-overview')).toContainText('T3 Astral armor + charm');
  await expect(page.locator('.journey-readiness')).toContainText('LV 8 / 5');
  await page.locator('[data-action="journey-rally"]').click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('#zone-name')).toHaveText('The Sunken Archive');
  await expect(page.locator('#dungeon-progress')).toContainText(/1\/[3-5]/);
  await page.keyboard.press('KeyR');
  await page.keyboard.press('KeyJ');
  await expect(page.locator('[data-action="journey-rally"]')).toBeVisible();
});

test('returning endgame players can start the next unlocked depth from the first journal section', async ({
  page,
}) => {
  await veteran(page, 'Far Horizon', {
    freshRealm: true,
    prepare(profile) {
      profile.character!.quest = 8;
      const legacy = ensureLegacy(profile);
      legacy.highestDepth = 3;
      legacy.selectedDepth = 1;
      legacy.clears = 3;
    },
  });
  await page.keyboard.press('KeyJ');
  await expect(page.locator('.journey-overview')).toContainText('Clear Elder depth 4');
  await expect(page.locator('.journey-foundations')).not.toHaveAttribute('open');
  await page.locator('[data-action="journey-rally"]').click();
  await expect(page.locator('#dungeon-progress')).toContainText('ELDER DEPTH 4');
  await page.keyboard.press('KeyR');
  await expect(page.locator('#safe-state')).toContainText('Sanctuary');
  await page.screenshot({ path: 'docs/playtests/v6-endgame-route.png' });
});

test('the entry banner fits a phone, never covers the sticks, and fades on its own', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Traveler name' }).fill('Little Dawn');
    await page.getByRole('button', { name: 'Enter the wilds', exact: true }).click();
    const banner = page.locator('#hearth-banner');
    await expect(banner).toBeVisible();
    const box = (await banner.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    const stick = (await page.locator('#move-stick').boundingBox())!;
    const aim = (await page.locator('#aim-stick').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(stick.x + stick.width - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(aim.x + 1);
    await expect(page.locator('#move-stick')).toBeVisible();
    await page.screenshot({ path: 'docs/playtests/v7-phone-spawn.png' });
    await expect(banner).toBeHidden({ timeout: 10000 });
  } finally {
    await context.close();
  }
});

test('the minimap zooms and remembers it, and a pinned place steers the compass through a reload', async ({
  page,
}) => {
  test.setTimeout(60000);
  await veteran(page, 'Wayfinder', {
    freshRealm: true,
    prepare(profile) {
      const c = profile.character!;
      c.quest = 2;
      c.level = 12;
      c.visited = ['meadow'];
    },
  });
  // Three framings, cycled by N, starting from the stored default.
  await expect(page.locator('#minimap-zoom')).toHaveText('120m');
  await page.keyboard.press('KeyN');
  await expect(page.locator('#minimap-zoom')).toHaveText('240m');
  await page.keyboard.press('KeyN');
  await expect(page.locator('#minimap-zoom')).toHaveText('60m');
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ew:settings')!).minimapSpan))
    .toBe(60);
  // The corner control does the same thing as the key.
  await page.locator('[data-action="minimap-zoom"]').click();
  await expect(page.locator('#minimap-zoom')).toHaveText('120m');

  const objective = await page.locator('#objective-name').textContent();
  await page.keyboard.press('KeyM');
  const atlas = page.locator('#atlas');
  await expect
    .poll(async () => (await atlas.getAttribute('data-hits')) ?? '')
    .toContain('Glasswaste');
  const hits = JSON.parse((await atlas.getAttribute('data-hits'))!);
  const glass = hits.find(
    (h: { kind: string; name: string }) => h.kind === 'place' && h.name === 'The Glasswaste',
  );
  expect(glass).toBeTruthy();
  const box = (await atlas.boundingBox())!;
  const [cw, ch] = await atlas.evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
  await page.mouse.click(
    box.x + ((glass.x + glass.w / 2) / cw) * box.width,
    box.y + ((glass.y + glass.h / 2) / ch) * box.height,
  );
  // The compass leaves the chapter goal and follows the pin instead.
  await expect(page.locator('#objective-name')).toHaveText('The Glasswaste');
  expect(await page.locator('#objective-name').textContent()).not.toBe(objective);
  await page.screenshot({ path: 'docs/playtests/p1-atlas-pinned.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#objective-hint')).toContainText('Your pin');

  // A pin is profile state, so it is still there after a reconnect.
  await page.reload();
  await page.getByRole('button', { name: 'Continue journey', exact: true }).click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#objective-name')).toHaveText('The Glasswaste');
  // Clicking the same place again clears it and the chapter goal comes back.
  await page.keyboard.press('KeyM');
  await expect
    .poll(async () => (await atlas.getAttribute('data-hits')) ?? '')
    .toContain('Glasswaste');
  const again = JSON.parse((await atlas.getAttribute('data-hits'))!).find(
    (h: { kind: string; name: string }) => h.kind === 'place' && h.name === 'The Glasswaste',
  );
  await page.mouse.click(
    box.x + ((again.x + again.w / 2) / cw) * box.width,
    box.y + ((again.y + again.h / 2) / ch) * box.height,
  );
  await expect(page.locator('#objective-name')).not.toHaveText('The Glasswaste');
});

test('the build readout names the damage and rate, and the board offers every unlocked goal', async ({
  page,
}) => {
  await veteran(page, 'Bookkeeper', {
    freshRealm: true,
    prepare(profile) {
      const c = profile.character!;
      c.quest = 2;
      c.level = 12;
    },
  });
  // Everything a player needs to describe their build, without opening a panel.
  const stats = page.locator('#hud-stats');
  await expect(stats).toContainText('Health');
  await expect(stats).toContainText('Damage');
  await expect(stats).toContainText('Rate');
  await expect(stats).toContainText('Damage / second');
  await expect(stats.locator('[data-stat="damage"] b')).toHaveText(/\d/);
  await expect(stats.locator('[data-stat="rate"] b')).toHaveText(/\/s/);
  await expect(page.locator('.trait-line')).toBeVisible();
  // Hovering a carried item tints the rows it would move, with the delta.
  await page.locator('#hud-kit [data-hud-item="test-upgrade"]').hover();
  await expect(stats.locator('.stat-row.up').first()).toBeVisible();
  await expect(stats.locator('.stat-row.up .stat-delta').first()).toHaveText(/[+−]/);
  await page.locator('#world').hover({ position: { x: 200, y: 200 } });

  await page.keyboard.press('KeyJ');
  const board = page.locator('.objective-board');
  await expect(board).toBeVisible();
  const rows = board.locator('.board-row');
  expect(await rows.count()).toBeGreaterThan(1);
  await expect(rows.first()).toContainText('CHAPTER');
  await expect(board).toContainText('REPEATABLE');
  await page.screenshot({ path: 'docs/playtests/p1-objective-board.png' });
  // Pinning from the board moves the HUD card onto that goal.
  const hunt = rows.filter({ hasText: 'REPEATABLE' }).first();
  const huntTitle = await hunt.locator('h4').textContent();
  await hunt.getByRole('button', { name: 'Pin', exact: false }).click();
  await expect(page.locator('#quest-chapter')).toContainText('PINNED');
  await expect(page.locator('#quest-name')).toHaveText(huntTitle!);
});
