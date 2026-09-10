import { test, expect, type Page } from '@playwright/test';
import { remoteTraveler } from './fixtures';
async function enter(page: Page, name = 'Aster') {
  const { freshAccount } = await import('./fixtures');
  await freshAccount(page, name);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Traveler name' })).toHaveValue(name);
  await page.getByRole('button', { name: 'Enter the wilds', exact: true }).click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#player-name')).toHaveText(name);
}
async function walk(page: Page, tx: number, tz: number) {
  const held = new Set<string>();
  try {
    for (let i = 0; i < 80; i++) {
      const raw = (await page.locator('#coordinates').textContent())!.split('/').map(Number),
        dx = tx - raw[0],
        dz = tz + raw[1];
      if (Math.hypot(dx, dz) < 2.5) return;
      const yaw = Number((await page.locator('#world').getAttribute('data-camera-yaw')) ?? 0.62);
      const sx = dx * Math.cos(yaw) - dz * Math.sin(yaw),
        sz = dx * Math.sin(yaw) + dz * Math.cos(yaw),
        wanted = new Set<string>();
      if (Math.abs(sx) > 0.8) wanted.add(sx > 0 ? 'KeyD' : 'KeyA');
      if (Math.abs(sz) > 0.8) wanted.add(sz > 0 ? 'KeyS' : 'KeyW');
      for (const k of held)
        if (!wanted.has(k)) {
          await page.keyboard.up(k);
          held.delete(k);
        }
      for (const k of wanted)
        if (!held.has(k)) {
          await page.keyboard.down(k);
          held.add(k);
        }
      await page.waitForTimeout(140);
    }
    throw new Error(`Traveler could not walk to ${tx}, ${tz}`);
  } finally {
    for (const k of held) await page.keyboard.up(k);
  }
}
test('title, all class choices, guide, and graphics render without browser errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page).toHaveTitle('Bring Something Home — A cooperative bullet-hell RPG');
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
    'content',
    'Bring Something Home',
  );
  await expect(page.locator('.title-lede')).toHaveText(
    'Every life is temporary.What you bring home can outlast it.',
  );
  await expect(
    page.getByRole('heading', { name: 'Bring Something Home', exact: true }),
  ).toBeVisible();
  await page.locator('[data-class="ranger"]').click();
  await expect(page.locator('[data-class="ranger"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-class="sentinel"]').click();
  await expect(page.locator('#class-description')).toContainText('oath');
  await page.getByRole('button', { name: 'Field guide', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Instant recall to safety');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'docs/screenshots/title.png' });
  expect(errors).toEqual([]);
});
test('traveler can leave the Hearth, use an ability, fire, and instantly recall', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page, 'Mira');
  await expect(page.locator('#safe-state')).toContainText('Sanctuary');
  await page.screenshot({ path: 'docs/screenshots/hearth.png' });
  // No portal: the sanctuary edge is simply walked across, toward the trouble at the gate.
  await walk(page, 0, 5);
  await expect(page.locator('#safe-state')).toContainText('In the wilds');
  await page.keyboard.press('Space');
  await expect(page.locator('#ability-cooldown')).toHaveClass(/active/);
  await page.mouse.move(800, 280);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await page.keyboard.press('Shift');
  await expect(page.locator('#dash-cooldown')).toHaveClass(/active/);
  await page.keyboard.press('KeyR');
  await expect(page.locator('#safe-state')).toContainText('Sanctuary');
  expect(errors).toEqual([]);
});
test('inventory, vault, forge, atlas, journal, and settings work with live character state', async ({
  page,
}) => {
  test.setTimeout(60000);
  await enter(page, 'Birch');
  await page.keyboard.press('KeyB');
  await expect(page.getByRole('dialog')).toContainText('What you carry');
  await page.getByRole('button', { name: 'Hearthwood Staff', exact: true }).click();
  await page.getByRole('button', { name: 'Unequip', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Equip', exact: false }).filter({ hasText: 'Equip' }).last(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Store in vault', exact: false }).click();
  await page.getByRole('button', { name: 'Memory vault', exact: true }).click();
  await page.getByRole('button', { name: 'Hearthwood Staff', exact: true }).click();
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await page.getByRole('button', { name: 'Satchel', exact: true }).click();
  await page.getByRole('button', { name: 'Hearthwood Staff', exact: true }).click();
  await page.getByRole('button', { name: 'Equip', exact: true }).click();
  await page.screenshot({ path: 'docs/screenshots/satchel.png' });
  await page.getByRole('button', { name: 'The forge', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Starforged weapon');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyM');
  await expect(page.locator('#atlas')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/atlas.png' });
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyJ');
  await expect(page.getByRole('dialog')).toContainText('Keep the fire alive');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'Graphics quality' }).selectOption('low');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('combobox', { name: 'Graphics quality' })).toHaveValue('low');
});
test('independent browsers share a realm, see each other, and exchange escaped chat', async ({
  browser,
}) => {
  test.setTimeout(60000);
  const a = await browser.newContext(),
    remote = await remoteTraveler(browser),
    b = remote.context;
  const first = await a.newPage(),
    second = await b.newPage();
  try {
    await enter(first, 'Juniper');
    await enter(second, 'Rowan');
    await expect(first.locator('.player-label').filter({ hasText: 'Rowan' })).toBeVisible();
    await expect(second.locator('.player-label').filter({ hasText: 'Juniper' })).toBeVisible();
    await first.keyboard.press('Enter');
    await first.getByRole('textbox', { name: 'Realm chat' }).fill('<b>Hello, Hearth</b>');
    await first.keyboard.press('Enter');
    await expect(second.locator('#chat-lines')).toContainText('<b>Hello, Hearth</b>');
    expect(await second.locator('#chat-lines b').count()).toBe(0);
    await second.locator('.realm-population').click();
    await second
      .locator('.peer-list > div')
      .filter({ hasText: 'Juniper' })
      .getByRole('button', { name: 'Mute', exact: true })
      .click();
    await expect(
      second
        .locator('.peer-list > div')
        .filter({ hasText: 'Juniper' })
        .getByRole('button', { name: 'Unmute', exact: true }),
    ).toBeVisible();
    await second
      .locator('.peer-list > div')
      .filter({ hasText: 'Juniper' })
      .getByRole('button', { name: 'Report', exact: true })
      .click();
    await second
      .getByRole('textbox', { name: 'WHAT HAPPENED?' })
      .fill('Automated test report: confirming the operator review flow.');
    await second.getByRole('button', { name: 'Send report', exact: true }).click();
    await expect(second.locator('#toasts')).toContainText('Report saved');
    await second.locator('.realm-population').click();
    await second
      .locator('.peer-list > div')
      .filter({ hasText: 'Juniper' })
      .getByRole('button', { name: 'Unmute', exact: true })
      .click();
    await second.keyboard.press('Escape');
    await first.getByRole('button', { name: 'Open settings', exact: true }).click();
    await first.getByRole('button', { name: 'Return to title', exact: false }).click();
    await first.getByRole('button', { name: 'Continue journey', exact: true }).click();
    await expect(first.locator('#hud')).toBeVisible();
  } finally {
    await a.close();
    await remote.close();
  }
});
test('reload resumes the character and recovery works in a fresh browser', async ({
  page,
  browser,
}) => {
  await enter(page, 'Willow');
  const code = await page.evaluate(() => JSON.parse(localStorage.getItem('ew:recovery')!));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Continue journey', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue journey', exact: true }).click();
  await expect(page.locator('#player-name')).toHaveText('Willow');
  const remote = await remoteTraveler(browser);
  const restored = await remote.context.newPage();
  try {
    await restored.goto('/');
    await restored.getByRole('button', { name: /Already have a flame/ }).click();
    await restored.getByRole('textbox', { name: 'YOUR PRIVATE RECOVERY CODE' }).fill(code);
    await restored.getByRole('button', { name: 'Restore my traveler' }).click();
    await expect(
      restored.getByRole('button', { name: 'Continue journey', exact: true }),
    ).toBeVisible();
    await restored.getByRole('button', { name: 'Continue journey', exact: true }).click();
    await expect(restored.locator('#player-name')).toHaveText('Willow');
    await expect(page.locator('#connection-banner')).toContainText('another window');
  } finally {
    await remote.close();
  }
});
test('phone layout supports character creation, touch sticks, and readable panels', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await page.screenshot({ path: 'docs/screenshots/mobile-title.png' });
    await page.getByRole('textbox', { name: 'Traveler name' }).fill('Fern');
    await page.getByRole('button', { name: 'Enter the wilds', exact: true }).click();
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#move-stick')).toBeVisible();
    await page.getByRole('button', { name: 'Open satchel', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const width = await page.locator('.modal').evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: 'docs/screenshots/mobile-satchel.png' });
  } finally {
    await context.close();
  }
});
test('API rejects foreign origins and unauthorized access; deployment headers are set', async ({
  request,
}) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect((await health.json()).status).toBe('ok');
  expect((await request.get('/api/profile')).status()).toBe(401);
  expect(
    (
      await request.post('/api/account', {
        headers: { Origin: 'https://untrusted.example' },
        data: { name: 'Nope' },
      })
    ).status(),
  ).toBe(403);
  expect((await request.post('/api/account', { data: { name: 'x' } })).status()).toBe(400);
  const html = await request.get('/');
  expect(html.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(html.headers()['x-content-type-options']).toBe('nosniff');
  expect((await request.get('/server/database.ts')).status()).toBe(404);
  expect((await request.post('/')).status()).toBe(405);
});

test('permadeath ends a traveler and a new calling can inherit the account', async ({ page }) => {
  test.setTimeout(60000);
  await enter(page, 'Ash');
  await walk(page, 0, 2);
  await expect(page.getByRole('dialog', { name: 'Your flame becomes a memory' })).toBeVisible({
    timeout: 40000,
  });
  await expect(page.getByRole('dialog')).toContainText('FAME EARNED');
  await page.getByRole('button', { name: 'Carry the light again' }).click();
  await page.locator('[data-class="ranger"]').click();
  await page.getByRole('button', { name: 'Enter the wilds', exact: true }).click();
  await expect(page.locator('#health-label')).toContainText('210');
  await expect(page.locator('#ability-label')).toHaveText('Thorn volley');
});
test('account deletion requires exact confirmation and invalidates saved credentials', async ({
  page,
  request,
}) => {
  await enter(page, 'Echo');
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('ew:token')!));
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await page.getByRole('button', { name: 'Delete this account and its progress' }).click();
  await page.getByRole('textbox', { name: 'Confirm traveler name' }).fill('Wrong name');
  await page.getByRole('button', { name: 'Permanently delete my account' }).click();
  await expect(page.locator('#delete-error')).toContainText('exactly');
  await page.getByRole('textbox', { name: 'Confirm traveler name' }).fill('Echo');
  await page.getByRole('button', { name: 'Permanently delete my account' }).click();
  await expect(page.getByRole('button', { name: 'Enter the wilds', exact: true })).toBeVisible();
  expect(
    (await request.get('/api/profile', { headers: { Authorization: `Bearer ${token}` } })).status(),
  ).toBe(401);
});

test('local movement responds before inputs delayed by 250ms reach the server', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeSocket = window.WebSocket;
    window.WebSocket = class extends NativeSocket {
      send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        if (typeof data === 'string' && JSON.parse(data).type === 'input') {
          setTimeout(() => {
            if (this.readyState === NativeSocket.OPEN) super.send(data);
          }, 250);
        } else super.send(data);
      }
    };
  });
  await enter(page, 'Bram');
  await expect(page.locator('#world')).toHaveAttribute('data-player-x', /./);
  await page.waitForTimeout(600);
  const response = await page.evaluate(
    () =>
      new Promise<{ elapsed: number; server: string }>((resolve) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
        const start = performance.now(),
          x = Number(canvas.dataset.playerX);
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', bubbles: true }));
        const check = () => {
          if (Number(canvas.dataset.playerX) > x + 0.08 || performance.now() - start > 500) {
            canvas.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', bubbles: true }));
            resolve({
              elapsed: performance.now() - start,
              server: document.querySelector('#coordinates')!.textContent!,
            });
          } else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
  );
  expect(response.elapsed).toBeLessThan(150);
  expect(response.server.split('/')[0].trim()).toBe('0');
});

test('a new traveler sees one objective card, and combat guidance stays readable', async ({
  page,
}) => {
  await enter(page, 'Fern');
  await expect(page.locator('#objective-name')).toHaveText('Trouble at the gate');
  await expect(page.locator('#quest-name')).toContainText('Kill three of the creatures');
  // One meter at a time: the hunt contract and the star event wait for later.
  await expect(page.locator('.hunt-card')).toBeHidden();
  await expect(page.locator('#event-banner')).toBeHidden();
  expect(await page.locator('.objective-stack > :visible').count()).toBe(1);
  await expect(page.locator('#objective-distance')).toContainText('LV 1');
  await walk(page, 0, 5);
  await expect(page.locator('#safe-state')).toContainText('In the wilds');
  await expect(page.locator('#objective-name')).toContainText('Trouble at the gate');
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.mouse.move(700, 240);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.screenshot({ path: 'docs/playtests/first-hunt.png' });
  expect(errors).toEqual([]);
  await page.keyboard.press('KeyR');
});

test('both dungeon entrances are reachable on foot from the Hearth', async ({ page }) => {
  test.setTimeout(60000);
  await enter(page, 'Rowan');
  await walk(page, 0, 20);
  for (const x of [-6, -12, -18, -24, -30, -32]) await walk(page, x, 20);
  await walk(page, -32, 25);
  await expect(page.locator('#interaction')).toContainText('Sunken Archive');
  await page.keyboard.press('KeyX');
  await expect(page.locator('#zone-name')).toHaveText('The Sunken Archive');
  await page.screenshot({ path: 'docs/playtests/archive-entry.png' });
  await page.keyboard.press('KeyR');
  await expect(page.locator('#safe-state')).toContainText('Sanctuary');
  await walk(page, 0, 20);
  for (const x of [6, 12, 18, 24, 30, 36, 42]) await walk(page, x, 20);
  await walk(page, 42, 12);
  await expect(page.locator('#interaction')).toContainText('Ember Crucible');
  await page.keyboard.press('KeyX');
  await expect(page.locator('#zone-name')).toHaveText('The Ember Crucible');
  await page.keyboard.press('KeyR');
});

test('Q/E orbit, closer zoom, F tonic, I autofire, and B inventory use the requested bindings', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const send = WebSocket.prototype.send;
    (window as any).actions = [];
    WebSocket.prototype.send = function (data) {
      if (typeof data === 'string') {
        const m = JSON.parse(data);
        if (m.type === 'action') (window as any).actions.push(m.action);
      }
      return send.call(this, data);
    };
  });
  await enter(page, 'Orbit');
  const canvas = page.locator('#world');
  // North is up while playing, matching the minimap.
  await expect(canvas).toHaveAttribute('data-camera-yaw', '0.0000');
  await page.keyboard.down('KeyE');
  try {
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-camera-yaw')))
      .toBeLessThan(-0.25);
  } finally {
    await page.keyboard.up('KeyE');
  }
  const turned = Number(await canvas.getAttribute('data-camera-yaw'));
  await page.keyboard.down('KeyQ');
  try {
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-camera-yaw')))
      .toBeGreaterThan(turned + 0.2);
  } finally {
    await page.keyboard.up('KeyQ');
  }
  expect(await page.evaluate(() => (window as any).actions)).not.toContain('potion');
  expect(await page.evaluate(() => (window as any).actions)).not.toContain('interact');
  await page.keyboard.press('KeyF');
  expect(await page.evaluate(() => (window as any).actions)).toContain('potion');
  await page.keyboard.press('KeyI');
  await expect(page.locator('#attack-label')).toHaveText('Auto on');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.keyboard.press('KeyI');
  await expect(page.locator('#attack-label')).toHaveText('Attack');
  await page.mouse.move(600, 550);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -120);
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-camera-zoom')))
    .toBeLessThan(0.32);
  await page.screenshot({ path: 'docs/playtests/close-camera.png' });
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-camera-yaw', '0.0000');
  await page.keyboard.press('KeyB');
  await expect(page.getByRole('dialog')).toContainText('What you carry');
});

test('satchel shows meaningful upgrades, lost effects, outclassed filters, and exact comparisons', async ({
  page,
}) => {
  const { veteran } = await import('./fixtures');
  await veteran(page, 'Appraiser');
  await page.keyboard.press('KeyB');
  await expect(page.locator('[data-item="test-upgrade"]')).toHaveAttribute(
    'data-verdict',
    'upgrade',
  );
  await expect(page.locator('[data-item="test-weaker"]')).toHaveAttribute(
    'data-verdict',
    'outclassed',
  );
  await expect(page.locator('[data-item="test-tradeoff"]')).toHaveAttribute(
    'data-verdict',
    'tradeoff',
  );
  await page.locator('[data-item="test-tradeoff"]').click();
  await expect(page.locator('.item-detail')).toContainText('Primary DPS');
  await expect(page.locator('.item-detail')).toContainText('Extra targets / bolt');
  await expect(page.locator('.item-detail')).toContainText('Replaces Threadpiercer');
  await page.screenshot({ path: 'docs/playtests/gear-tradeoff.png' });
  await page.locator('[data-gear-filter="outclassed"]').click();
  await expect(page.locator('.inventory-grid [data-item]')).toHaveCount(1);
  await page.locator('[data-gear-filter="upgrade"]').click();
  await page.locator('[data-item="test-upgrade"]').click();
  await page.getByRole('button', { name: 'Equip', exact: true }).click();
  await expect(page.locator('.equipment-row [data-item="test-upgrade"]')).toBeVisible();
  await expect(page.locator('.item-detail')).toContainText('Currently equipped');
});

test('Elder journal attunement, persistent relic crafting, portal, and first chamber are playable', async ({
  page,
}) => {
  const { veteran } = await import('./fixtures');
  await veteran(page, 'Dawnkeeper');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.keyboard.press('KeyJ');
  await expect(page.getByRole('dialog')).toContainText('3 elder bosses');
  await expect(page.locator('[data-game="attune"][data-id="2"]')).toBeDisabled();
  await page.getByRole('button', { name: 'Open relic workshop' }).click();
  await page.locator('[data-game="craft"][data-id="archivist"]').click();
  await expect(page.locator('.panel-currency')).toContainText('22 shards');
  await expect(page.locator('.relic-recipe.collected')).toContainText('The Unwritten Page');
  await page.screenshot({ path: 'docs/playtests/relic-workshop.png' });
  await page.keyboard.press('Escape');
  await walk(page, 0, 34);
  await page.keyboard.press('KeyX');
  await expect(page.locator('#zone-name')).toHaveText('The Elder Convergence');
  await expect(page.locator('#dungeon-progress')).toContainText('1/5');
  await expect(page.locator('#dungeon-progress')).toContainText('Iron hearts');
  await walk(page, 0, 17);
  await expect(page.locator('#interaction')).toContainText('Awaken');
  await page.keyboard.press('KeyX');
  await expect(page.locator('#dungeon-progress')).toContainText('6 guardians remain');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/playtests/elder-entry.png' });
  await page.keyboard.press('KeyR');
  await expect(page.locator('#safe-state')).toContainText('Sanctuary');
  await page.keyboard.press('KeyJ');
  await expect(page.locator('.legacy-stats')).toContainText('22');
  expect(errors).toEqual([]);
});

test('phone equipment comparisons and Elder progression fit the screen with usable camera controls', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    const { veteran } = await import('./fixtures');
    await veteran(page, 'Moonflower');
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.getByRole('button', { name: 'Rotate camera right', exact: true }).click();
    await expect
      .poll(async () => Number(await page.locator('#world').getAttribute('data-camera-yaw')))
      .toBeLessThan(0.35);
    await page.getByRole('button', { name: 'Open satchel', exact: true }).click();
    await page.locator('[data-item="test-tradeoff"]').click();
    await page.locator('.item-detail').scrollIntoViewIfNeeded();
    await expect(page.locator('.item-detail')).toContainText('Primary DPS');
    await page
      .locator('.item-detail')
      .evaluate((el) => ((el as HTMLElement).dataset.checkpoint = 'keep'));
    await page.waitForTimeout(5200);
    await expect(page.locator('.item-detail')).toHaveAttribute('data-checkpoint', 'keep');

    const overflow = await page.locator('.modal').evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: 'docs/playtests/mobile-gear-comparison.png' });
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'Open journey', exact: true }).click();
    await expect(page.locator('.depth-grid button')).toHaveCount(12);
    await page.locator('.elder-progression').scrollIntoViewIfNeeded();
    expect(
      await page.locator('.modal').evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({ path: 'docs/playtests/mobile-elder-journal.png' });
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await walk(page, 0, 34);
    await page.keyboard.press('KeyX');
    await expect(page.locator('#zone-name')).toHaveText('The Elder Convergence');
    await expect(page.locator('#dungeon-progress')).toBeVisible();
    const progress = await page.locator('#dungeon-progress').boundingBox();
    const camera = await page.locator('.camera-tools').boundingBox();
    expect(camera!.x).toBeGreaterThan(progress!.x + progress!.width);
    const menus = await page.locator('.side-tools').boundingBox();
    expect(camera!.y).toBeGreaterThan(menus!.y + menus!.height);
    await page.screenshot({ path: 'docs/playtests/mobile-elder-hud.png' });
    await page.getByRole('button', { name: 'Rotate camera left', exact: true }).click();
    await page.keyboard.press('KeyR');
  } finally {
    await context.close();
  }
});

test('camera tilt supports the slider, Page keys, middle mouse orbit, and saved preferences', async ({
  page,
}) => {
  await enter(page, 'Stargazer');
  const canvas = page.locator('#world'),
    slider = page.getByRole('slider', { name: 'Camera tilt', exact: true });
  await slider.focus();
  await slider.press('End');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-camera-pitch')))
    .toBeGreaterThan(77);
  await slider.press('Home');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-camera-pitch')))
    .toBeLessThan(33);
  await slider.evaluate((el: HTMLInputElement) => el.blur());
  await page.keyboard.down('PageUp');
  try {
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-camera-pitch')))
      .toBeGreaterThan(55);
  } finally {
    await page.keyboard.up('PageUp');
  }
  await page.mouse.move(700, 510);
  const yaw = Number(await canvas.getAttribute('data-camera-yaw'));
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(800, 440, { steps: 10 });
  await page.mouse.up({ button: 'middle' });
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-camera-yaw')))
    .toBeGreaterThan(yaw + 0.4);
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('ew:settings')!).cameraTilt,
  );
  await page.screenshot({ path: 'docs/playtests/camera-tilt.png' });
  await page.reload();
  await page.getByRole('button', { name: 'Continue journey', exact: true }).click();
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-camera-pitch')))
    .toBeCloseTo(saved, 0);
});

test('direct invitations gather friends in a common expedition without bypassing progression', async ({
  page,
  browser,
}) => {
  const { veteran } = await import('./fixtures');
  const remote = await remoteTraveler(browser);
  const friend = await remote.context.newPage();
  try {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async (value: string) => {
            (window as any).copiedInvite = value;
          },
        },
      });
    });
    const host = await veteran(page, 'Cedar', { freshRealm: true });
    await page.keyboard.press('KeyP');
    await page.locator('[data-expedition="hollow"] [data-action="expedition-invite"]').click();
    await expect
      .poll(() => page.evaluate(() => (window as any).copiedInvite ?? ''))
      .toContain('expedition=hollow');
    const invite = await page.evaluate(() => (window as any).copiedInvite as string);
    expect(new URL(invite).searchParams.get('realm')).toBe(host.realmId);
    expect(invite).not.toContain(host.token);
    await page.locator('[data-expedition="hollow"] [data-game="rally"]').click();
    await expect(page.locator('#zone-name')).toContainText('Sunken Archive');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await veteran(friend, 'Juniper', { path: invite });
    await expect(friend.locator('#invite-banner')).toContainText('Sunken Archive');
    await expect(friend.getByRole('dialog')).toContainText('Your invitation leads to');
    await expect(friend.locator('[data-expedition="hollow"]')).toContainText('Cedar');
    await friend.locator('[data-expedition="hollow"] [data-game="rally"]').click();
    // A second renderer may still be compiling the new dungeon scenery.
    await expect(friend.locator('#zone-name')).toContainText('Sunken Archive', { timeout: 15000 });
    await friend.keyboard.press('KeyP');
    await expect(friend.locator('[data-expedition="hollow"]')).toContainText('2 TRAVELERS');
    await expect(friend.locator('[data-expedition="crucible"] [data-game="rally"]')).toBeDisabled();
    await friend.screenshot({ path: 'docs/playtests/rally-together.png' });
    await page.keyboard.press('KeyR');
    await friend.keyboard.press('KeyR');
  } finally {
    await remote.close();
  }
});

test('a named relic can be tracked and a persisted clear exports an original victory card', async ({
  page,
}) => {
  const { veteran } = await import('./fixtures');
  await veteran(page, 'Dawn Chorus', {
    prepare: (profile) => {
      profile.legacy!.bossKills.archivist = 5;
      profile.legacy!.highestDepth = 1;
      profile.legacy!.selectedDepth = 2;
      profile.lastExpedition = {
        id: 'test-victory',
        dimension: 'eclipse',
        depth: 1,
        modifier: 'iron',
        elapsed: 153,
        at: 1788501600000,
        chambers: 5,
        totalChambers: 5,
        shards: 10,
        gold: 250,
        personalBest: true,
        crew: [
          { name: 'Dawn Chorus', classId: 'arcanist' },
          { name: 'Fern', classId: 'ranger' },
        ],
      };
    },
  });
  await page.keyboard.press('KeyJ');
  await page.locator('[data-game="track"][data-id="archivist"]').click();
  await expect(page.locator('#quest-name')).toContainText('The Unwritten Page');
  await expect(page.locator('#quest-reward')).toContainText('1 more victory guarantees');
  await page.screenshot({ path: 'docs/playtests/relic-chase.png' });
  await page.getByRole('button', { name: 'Last expedition', exact: true }).click();
  await expect(page.locator('.recap-stats')).toContainText('2:33');
  await expect(page.locator('.recap-crew')).toContainText('Fern');
  await expect(page.locator('.recap-hero')).toContainText('PERSONAL BEST');
  await page.screenshot({ path: 'docs/playtests/expedition-recap.png' });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save victory card' }).click();
  const card = await download;
  expect(card.suggestedFilename()).toBe('bring-something-home-eclipse-depth-1.png');
  await card.saveAs('docs/playtests/victory-card.png');
  await page.keyboard.press('Escape');
  await expect(page.locator('#objective-name')).toContainText('Craft your tracked relic');
});

test('phone rally, bag legend, and camera tilt fit without horizontal overflow', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    const { veteran } = await import('./fixtures');
    await veteran(page, 'Tiny Spark');
    const tilt = page.locator('#camera-tilt');
    await expect(tilt).toBeVisible();
    const tiltBox = (await tilt.boundingBox())!;
    expect(tiltBox.x + tiltBox.width).toBeLessThan(390);
    await page.keyboard.press('KeyP');
    await expect(page.getByRole('dialog')).toContainText('Meet me at the entrance');
    await page.screenshot({ path: 'docs/playtests/mobile-rally.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Open settings', exact: true }).click();
    await page.getByRole('button', { name: 'Field guide', exact: true }).click();
    await page.locator('.bag-legend').scrollIntoViewIfNeeded();
    await expect(page.locator('.bag-legend > span')).toHaveCount(6);
    await page.screenshot({ path: 'docs/playtests/mobile-bag-guide.png' });
    const legendBox = (await page.locator('.bag-legend').boundingBox())!;
    expect(legendBox.x).toBeGreaterThanOrEqual(0);
    expect(legendBox.x + legendBox.width).toBeLessThanOrEqual(390);
  } finally {
    await context.close();
  }
});

test('a closed realm invitation recovers and unavailable clipboard provides selectable invitation text', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('Unavailable');
        },
      },
    });
    document.execCommand = () => false;
  });
  await page.goto('/?realm=closed-realm&expedition=hollow');
  await expect(page.locator('#toasts')).toContainText('previous realm has closed');
  await page.getByLabel('Traveler name').fill('Returning Light');
  await page.getByRole('button', { name: 'Enter the wilds', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Your invitation leads to');
  await expect(page.locator('.rally-card').first()).toHaveAttribute('data-expedition', 'hollow');
  await page.locator('[data-expedition="hollow"] [data-action="expedition-invite"]').click();
  await expect(page.getByRole('dialog')).toContainText('could not access the clipboard');
  await expect(page.getByLabel('Text to copy')).toHaveValue(/realm=hearth-1&expedition=hollow/);
});

test('travelers are named on the large map and can be joined from the Hearth, never from elsewhere', async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const { veteran } = await import('./fixtures');
  const remote = await remoteTraveler(browser);
  const friend = remote.context.newPage();
  try {
    const host = await veteran(page, 'Lanternbearer', { freshRealm: true });
    const other = await friend;
    await veteran(other, 'Mossfoot', { path: `/?realm=${host.realmId}` });
    // Mossfoot heads east along the road and into the Glasswaste.
    for (const x of [6, 12, 18, 24, 30, 36, 42]) await walk(other, x, 20);
    for (const z of [14, 8, 2]) await walk(other, 42, z);
    await expect(other.locator('#zone-name')).toHaveText('The Glasswaste');
    // From the Hearth, the large map names Mossfoot far outside the 48-unit snapshot range.
    await page.keyboard.press('KeyM');
    const atlas = page.locator('#atlas');
    await expect
      .poll(async () => (await atlas.getAttribute('data-hits')) ?? '')
      .toContain('Mossfoot');
    const hit = JSON.parse((await atlas.getAttribute('data-hits'))!).find(
      (h: { name: string }) => h.name === 'Mossfoot',
    );
    const box = (await atlas.boundingBox())!;
    const [width, height] = await atlas.evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
    await page.mouse.click(
      box.x + ((hit.x + hit.w / 2) / width) * box.width,
      box.y + ((hit.y + hit.h / 2) / height) * box.height,
    );
    const travel = page.locator('.travel-row [data-game="travel"]');
    await expect(travel).toContainText('Travel to Mossfoot');
    await expect(travel).toBeEnabled();
    await travel.click();
    await expect(page.locator('#zone-name')).toHaveText('The Glasswaste');
    await expect(page.locator('#toasts')).toContainText('You arrive beside Mossfoot');
    await page.screenshot({ path: 'docs/playtests/v7-travel-to.png' });
    // Outside the sanctuary the same request is refused by the server.
    await page.keyboard.press('KeyM');
    await expect(page.locator('.travel-row [data-game="travel"]')).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.locator('.realm-population').click();
    await page.locator('.peer-list .traveler-name', { hasText: 'Mossfoot' }).click();
    await expect(page.locator('.travel-row')).toContainText('leaves from the Hearth');
    await page.keyboard.press('Escape');
    // A friend inside a dungeon is out of reach even from the Hearth.
    await page.keyboard.press('KeyR');
    await expect(page.locator('#safe-state')).toContainText('Sanctuary');
    await other.keyboard.press('KeyR');
    await expect(other.locator('#safe-state')).toContainText('Sanctuary');
    await other.keyboard.press('KeyP');
    await other.locator('[data-expedition="hollow"] [data-game="rally"]').click();
    await expect(other.locator('#zone-name')).toContainText('Sunken Archive', { timeout: 15000 });
    await page.locator('.realm-population').click();
    await expect(page.locator('.peer-list', { hasText: 'Mossfoot' })).toContainText(
      'Sunken Archive',
    );
    await page.locator('.peer-list .traveler-name', { hasText: 'Mossfoot' }).click();
    await expect(page.locator('.travel-row [data-game="travel"]')).toBeDisabled();
    await expect(page.locator('.travel-row')).toContainText('can’t follow');
    await page.keyboard.press('Escape');
    await other.keyboard.press('KeyR');
  } finally {
    await remote.close();
  }
});
