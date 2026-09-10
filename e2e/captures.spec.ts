import { test, expect, type Page } from '@playwright/test';
import {
  BIOME_BEARINGS,
  BIOME_PLACES,
  GATE_RING_RADIUS,
  RING_RADIUS,
  SETPIECE_SLOTS,
} from '../shared/places';
import { pointOn } from '../shared/world';
import { veteran } from './fixtures';
import { makeItem } from '../server/model';

/**
 * Playtest captures and frame time, on demand.
 *
 * Skipped in the ordinary suite because it walks the whole ring road, which takes minutes.
 * Run it with `CAPTURES=1 npx playwright test e2e/captures.spec.ts` after a build; it writes
 * one image per biome and per setpiece into docs/playtests and prints frame time at both
 * quality settings from inside the densest scenery in the realm.
 */
test.skip(!process.env.CAPTURES, 'Set CAPTURES=1 to record playtest captures.');

async function walk(page: Page, tx: number, tz: number, attempts = 200) {
  const held = new Set<string>();
  let was = { x: Infinity, z: Infinity },
    stuck = 0;
  try {
    for (let i = 0; i < attempts; i++) {
      const raw = (await page.locator('#coordinates').textContent())!.split('/').map(Number);
      const at = { x: raw[0], z: -raw[1] };
      let dx = tx - at.x,
        dz = tz - at.z;
      if (Math.hypot(dx, dz) < 4) return true;
      // Scenery is not a road. A traveler who has stopped moving steps around whatever
      // they walked into, alternating sides, the way a person does.
      stuck = Math.hypot(at.x - was.x, at.z - was.z) < 0.5 ? stuck + 1 : 0;
      was = at;
      if (stuck > 3) {
        const veer = (stuck % 16 < 8 ? 1 : -1) * 1.1;
        const a = Math.atan2(dz, dx) + veer;
        dx = Math.cos(a) * 10;
        dz = Math.sin(a) * 10;
      }
      if (process.env.CAPTURE_TRACE && i % 40 === 0)
        console.log(
          `  walk at ${at.x},${at.z} -> ${tx.toFixed(0)},${tz.toFixed(0)} stuck=${stuck}`,
        );
      const yaw = Number((await page.locator('#world').getAttribute('data-camera-yaw')) ?? 0.62);
      const sx = dx * Math.cos(yaw) - dz * Math.sin(yaw),
        sz = dx * Math.sin(yaw) + dz * Math.cos(yaw),
        wanted = new Set<string>();
      if (Math.abs(sx) > 0.8) wanted.add(sx > 0 ? 'KeyD' : 'KeyA');
      if (Math.abs(sz) > 0.8) wanted.add(sz > 0 ? 'KeyS' : 'KeyW');
      for (const k of held) if (!wanted.has(k)) (await page.keyboard.up(k), held.delete(k));
      for (const k of wanted) if (!held.has(k)) (await page.keyboard.down(k), held.add(k));
      await page.waitForTimeout(120);
    }
    return false;
  } finally {
    for (const k of held) await page.keyboard.up(k);
  }
}

test('the ring road, every biome, and every setpiece', async ({ page }) => {
  test.setTimeout(900000);
  // A level-thirty traveler in tier-eight relics, because the walk crosses the whole
  // world and a level-one cartographer does not survive Cindermeadow.
  await veteran(page, 'Cartographer', {
    freshRealm: true,
    prepare(profile) {
      const c = profile.character!;
      c.level = 30;
      c.hp = 100000;
      for (const slot of ['weapon', 'armor', 'charm'] as const)
        c.equipment[slot] = makeItem(slot, 8, 'relic');
    },
  });
  const seen: string[] = [];
  for (const place of BIOME_PLACES) {
    const bearing = BIOME_BEARINGS[place.id as keyof typeof BIOME_BEARINGS];
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(400);
    // Out along the spoke, exactly the way a player finds it.
    await walk(
      page,
      pointOn(bearing, GATE_RING_RADIUS).x,
      pointOn(bearing, GATE_RING_RADIUS).z,
      300,
    );
    await walk(page, pointOn(bearing, RING_RADIUS).x, pointOn(bearing, RING_RADIUS).z, 300);
    await page.waitForTimeout(900);
    const name = await page.locator('#zone-name').textContent();
    const fps = await page.locator('#world').getAttribute('data-fps');
    const calls = await page.locator('#world').getAttribute('data-draw-calls');
    console.log(`CAPTURE biome ${place.id} named "${name}" fps=${fps} drawCalls=${calls}`);
    seen.push(name ?? '');
    await page.screenshot({ path: `docs/playtests/biome-${place.id}.png` });
    for (const slot of SETPIECE_SLOTS.filter((s) => s.parent === place.id)) {
      if (!(await walk(page, slot.x, slot.z, 90))) continue;
      await page.waitForTimeout(1200);
      console.log(
        `CAPTURE setpiece ${slot.id} banner "${await page
          .locator('#setpiece-banner')
          .textContent()}"`,
      );
      await page.screenshot({ path: `docs/playtests/setpiece-${slot.id}.png` });
    }
  }
  // Every biome named itself on arrival, in the order the ring road passes them.
  expect(seen).toEqual(BIOME_PLACES.map((place) => place.name));
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'docs/playtests/atlas-full-realm.png' });
});

test('frame time at both quality settings, standing in the densest biome', async ({ page }) => {
  test.setTimeout(600000);
  const orchard = BIOME_BEARINGS.orchard;
  for (const quality of ['high', 'low'] as const) {
    await veteran(page, `Framecheck-${quality}`, {
      freshRealm: true,
      prepare(profile) {
        profile.character!.level = 30;
        profile.character!.hp = 100000;
      },
    });
    await page.evaluate((q) => {
      const raw = JSON.parse(localStorage.getItem('ew:settings') ?? '{}');
      localStorage.setItem('ew:settings', JSON.stringify({ ...raw, quality: q }));
    }, quality);
    await page.reload();
    await page.getByRole('button', { name: 'Continue journey', exact: true }).click();
    await page.waitForSelector('#hud', { state: 'visible' });
    await walk(page, pointOn(orchard, GATE_RING_RADIUS).x, pointOn(orchard, GATE_RING_RADIUS).z);
    await walk(page, pointOn(orchard, RING_RADIUS).x, pointOn(orchard, RING_RADIUS).z);
    await page.waitForTimeout(6000);
    console.log(
      `FRAMES orchard quality=${quality} fps=${await page.locator('#world').getAttribute('data-fps')} drawCalls=${await page.locator('#world').getAttribute('data-draw-calls')} where="${await page.locator('#zone-name').textContent()}"`,
    );
    await page.screenshot({ path: `docs/playtests/frames-orchard-${quality}.png` });
  }
});
