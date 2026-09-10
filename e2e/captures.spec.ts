import { test, expect, type Page } from '@playwright/test';
import {
  BIOME_BEARINGS,
  BIOME_PLACES,
  GATE_RING_RADIUS,
  RING_RADIUS,
  SETPIECE_SLOTS,
} from '../shared/places';
import { pathThrough, pointOn } from '../shared/world';
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

async function press(page: Page, held: Set<string>, wanted: Set<string>) {
  for (const k of held) if (!wanted.has(k)) (await page.keyboard.up(k), held.delete(k));
  for (const k of wanted) if (!held.has(k)) (await page.keyboard.down(k), held.add(k));
}
/**
 * Walk somewhere. The wilds are open but not empty, so the route is planned on the same
 * collision grid the server uses and then followed corner by corner.
 */
async function walk(page: Page, tx: number, tz: number, attempts = 300) {
  const held = new Set<string>();
  const read = async () => {
    const raw = (await page.locator('#coordinates').textContent())?.split('/').map(Number);
    return raw ? { x: raw[0], z: -raw[1] } : undefined;
  };
  try {
    let path: { x: number; z: number }[] = [];
    let replan = 0,
      stuck = 0,
      was = { x: Infinity, z: Infinity };
    for (let i = 0; i < attempts; i++) {
      const at = await read();
      if (!at) return false;
      if (Math.hypot(at.x - tx, at.z - tz) < 4) return true;
      stuck = Math.hypot(at.x - was.x, at.z - was.z) < 0.5 ? stuck + 1 : 0;
      was = at;
      if (stuck > 60) return false;
      if (!path.length || replan-- <= 0 || stuck > 8) {
        path = pathThrough(at, { x: tx, z: tz }, 'wilds');
        replan = 40;
        stuck = 0;
      }
      while (path.length > 1 && Math.hypot(at.x - path[0].x, at.z - path[0].z) < 2.2) path.shift();
      const step = path[0] ?? { x: tx, z: tz };
      const dx = step.x - at.x,
        dz = step.z - at.z;
      if (process.env.CAPTURE_TRACE && i % 40 === 0)
        console.log(
          `  walk at ${at.x},${at.z} -> ${tx.toFixed(0)},${tz.toFixed(0)} via ${step.x.toFixed(0)},${step.z.toFixed(0)} left=${path.length}`,
        );
      const yaw = Number((await page.locator('#world').getAttribute('data-camera-yaw')) ?? 0.62);
      const sx = dx * Math.cos(yaw) - dz * Math.sin(yaw),
        sz = dx * Math.sin(yaw) + dz * Math.cos(yaw),
        wanted = new Set<string>();
      if (Math.abs(sx) > 0.5) wanted.add(sx > 0 ? 'KeyD' : 'KeyA');
      if (Math.abs(sz) > 0.5) wanted.add(sz > 0 ? 'KeyS' : 'KeyW');
      await press(page, held, wanted);
      await page.waitForTimeout(120);
    }
    return false;
  } finally {
    for (const k of held) await page.keyboard.up(k);
  }
}

/** A cartographer walks into ambushes without fighting back. When one wins, send another. */
async function ensureAlive(page: Page, index: number, realm: string) {
  const fallen = await page
    .getByRole('button', { name: 'Carry the light again' })
    .isVisible()
    .catch(() => false);
  if (
    !fallen &&
    (await page
      .locator('#hud')
      .isVisible()
      .catch(() => false))
  ) {
    const raw = await page.locator('#coordinates').textContent();
    if (raw) return false;
  }
  await veteran(page, `Cartographer ${index}`, {
    path: `/?realm=${realm}`,
    prepare(profile) {
      const c = profile.character!;
      c.level = 30;
      for (const slot of ['weapon', 'armor', 'charm'] as const)
        c.equipment[slot] = makeItem(slot, 8, 'relic');
    },
  });
  return true;
}

test('the ring road, every biome, and every setpiece', async ({ page }) => {
  test.setTimeout(1200000);
  // A level-thirty traveler in tier-eight relics, because the walk crosses the whole
  // world and a level-one cartographer does not survive Cindermeadow.
  const { realmId } = await veteran(page, 'Cartographer', {
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
  let lives = 0;
  const wanted = process.env.CAPTURE_ONLY
    ? BIOME_PLACES.filter((p) => p.id === process.env.CAPTURE_ONLY)
    : BIOME_PLACES;
  // Out along one spoke, then around the ring road itself, which is what a player does and
  // what the road was built for. Crossing the island seven times is neither.
  let onTheRing = false;
  for (const [index, place] of wanted.entries()) {
    const bearing = BIOME_BEARINGS[place.id as keyof typeof BIOME_BEARINGS];
    if (await ensureAlive(page, ++lives, realmId)) onTheRing = false;
    if (!onTheRing) {
      for (let tries = 0; tries < 4; tries++) {
        await page.keyboard.press('KeyR');
        await page.waitForTimeout(700);
        const raw = (await page.locator('#coordinates').textContent())!.split('/').map(Number);
        if (Math.hypot(raw[0], -raw[1] - 22) < 6) break;
      }
      for (const radius of [GATE_RING_RADIUS, RING_RADIUS]) {
        const to = pointOn(bearing, radius);
        if (!(await walk(page, to.x, to.z, 500))) {
          await ensureAlive(page, ++lives, realmId);
          await walk(page, to.x, to.z, 500);
        }
      }
      onTheRing = true;
    } else {
      // Along the ring, one short hop at a time, so the road does the navigating.
      const from = BIOME_BEARINGS[wanted[index - 1].id as keyof typeof BIOME_BEARINGS];
      let sweep = bearing - from;
      while (sweep > 180) sweep -= 360;
      while (sweep < -180) sweep += 360;
      for (let hop = 1; hop <= 6; hop++) {
        const to = pointOn(from + (sweep * hop) / 6, RING_RADIUS);
        if (!(await walk(page, to.x, to.z, 260)) && (await ensureAlive(page, ++lives, realmId))) {
          // Somebody fell. The replacement walks out from the Hearth and rejoins the road.
          for (const radius of [GATE_RING_RADIUS, RING_RADIUS])
            await walk(page, pointOn(bearing, radius).x, pointOn(bearing, radius).z, 500);
          break;
        }
      }
    }
    await page.waitForTimeout(900);
    const name = await page.locator('#zone-name').textContent();
    const fps = await page.locator('#world').getAttribute('data-fps');
    const calls = await page.locator('#world').getAttribute('data-draw-calls');
    console.log(`CAPTURE biome ${place.id} named "${name}" fps=${fps} drawCalls=${calls}`);
    seen.push(name ?? '');
    await page.screenshot({ path: `docs/playtests/biome-${place.id}.png` });
    for (const slot of SETPIECE_SLOTS.filter((s) => s.parent === place.id)) {
      if (await ensureAlive(page, ++lives, realmId))
        for (const radius of [GATE_RING_RADIUS, RING_RADIUS])
          await walk(page, pointOn(bearing, radius).x, pointOn(bearing, radius).z, 500);
      if (!(await walk(page, slot.x, slot.z, 200))) continue;
      await page.waitForTimeout(1200);
      console.log(
        `CAPTURE setpiece ${slot.id} banner "${await page.locator('#setpiece-banner').textContent()}"`,
      );
      await page.screenshot({ path: `docs/playtests/setpiece-${slot.id}.png` });
      // Back to the road before the next hop.
      const back = pointOn(bearing, RING_RADIUS);
      await walk(page, back.x, back.z, 200);
    }
  }
  // Every biome named itself on arrival, in the order the ring road passes them.
  expect(seen).toEqual(wanted.map((place) => place.name));
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'docs/playtests/atlas-full-realm.png' });
});

test('frame time at both quality settings, standing in the densest biome', async ({ page }) => {
  test.setTimeout(900000);
  const orchard = BIOME_BEARINGS.orchard;
  for (const quality of ['high', 'low'] as const) {
    const { realmId } = await veteran(page, `Framecheck-${quality}`, {
      freshRealm: true,
      prepare(profile) {
        profile.character!.level = 30;
        for (const slot of ['weapon', 'armor', 'charm'] as const)
          profile.character!.equipment[slot] = makeItem(slot, 8, 'relic');
      },
    });
    await page.evaluate((q) => {
      const raw = JSON.parse(localStorage.getItem('ew:settings') ?? '{}');
      localStorage.setItem('ew:settings', JSON.stringify({ ...raw, quality: q }));
    }, quality);
    await page.reload();
    await page.getByRole('button', { name: 'Continue journey', exact: true }).click();
    await page.waitForSelector('#hud', { state: 'visible' });
    let lives = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      for (const radius of [GATE_RING_RADIUS, RING_RADIUS])
        await walk(page, pointOn(orchard, radius).x, pointOn(orchard, radius).z, 500);
      if ((await page.locator('#zone-name').textContent()) === 'The Petrified Orchard') break;
      await ensureAlive(page, ++lives, realmId);
    }
    await page.waitForTimeout(6000);
    const where = await page.locator('#zone-name').textContent();
    console.log(
      `FRAMES quality=${quality} fps=${await page.locator('#world').getAttribute('data-fps')} drawCalls=${await page.locator('#world').getAttribute('data-draw-calls')} where="${where}"`,
    );
    // The number is only worth recording if it was taken where it was supposed to be.
    expect(where).toBe('The Petrified Orchard');
    await page.screenshot({ path: `docs/playtests/frames-orchard-${quality}.png` });
  }
});
