import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter, makeItem } from '../server/model.js';
import { compareGear } from '../shared/gear.js';
import { CAMERA, clampZoom, screenMovement, wrapYaw } from '../src/game/camera.js';

test('strict improvements and strictly weaker equipment are labeled in both directions', () => {
  const c = createCharacter('arcanist'),
    upgrade = makeItem('weapon', 2, 'uncommon');
  assert.equal(compareGear(c, upgrade).verdict, 'upgrade');
  const old = c.equipment.weapon!;
  c.equipment.weapon = upgrade;
  assert.equal(compareGear(c, old).verdict, 'outclassed');
  assert.equal(compareGear(c, upgrade).verdict, 'equipped');
  assert.equal(compareGear(c, { ...upgrade, id: 'copy' }).verdict, 'equivalent');
});
test('higher power with lost piercing is a tradeoff, never a misleading upgrade', () => {
  const c = createCharacter('ranger'),
    piercing = makeItem('weapon', 3, 'rare');
  piercing.trait = 'pierce';
  c.equipment.weapon = piercing;
  const strong = { ...piercing, id: 'strong', power: piercing.power + 20, trait: undefined };
  const result = compareGear(c, strong);
  assert.equal(result.verdict, 'tradeoff');
  assert.equal(result.changed.find((row) => row.key === 'pierce')!.delta, -3);
  assert.ok(result.changed.find((row) => row.key === 'dps')!.delta > 0);
});
test('comparisons account for non-stacking effects provided by the rest of a build', () => {
  const c = createCharacter('sentinel');
  c.equipment.armor = { ...makeItem('armor', 2, 'rare'), trait: 'vigor' };
  c.equipment.charm = { ...makeItem('charm', 3, 'rare'), trait: 'vigor' };
  const armor = {
    ...c.equipment.armor,
    id: 'new',
    power: c.equipment.armor.power + 5,
    trait: undefined,
  };
  assert.equal(compareGear(c, armor).verdict, 'upgrade');
  c.equipment.charm.trait = 'leech';
  assert.equal(compareGear(c, armor).verdict, 'tradeoff');
});
test('DPS uses real attack speed and twin-bolt damage while exposing ability and bolt losses', () => {
  const c = createCharacter('arcanist');
  const echo = { ...c.equipment.weapon!, id: 'echo', trait: 'echo' as const };
  const result = compareGear(c, echo);
  assert.equal(result.verdict, 'tradeoff');
  const dps = result.rows.find((row) => row.key === 'dps')!;
  assert.ok(Math.abs(dps.after / dps.before - 1.3) < 0.001);
  assert.ok(result.rows.find((row) => row.key === 'bolt')!.delta < 0);
  assert.equal(compareGear(c, { ...echo, trait: 'swift' }).verdict, 'upgrade');
});
test('armor compares capped reduction, health and on-kill healing; empty slots are upgrades', () => {
  const c = createCharacter('sentinel'),
    armor = makeItem('armor', 6, 'relic');
  armor.trait = 'leech';
  armor.power = 70;
  assert.equal(compareGear(c, armor).verdict, 'upgrade');
  c.equipment.armor = armor;
  const other = { ...armor, id: 'other', power: armor.power - 1, trait: 'vigor' as const };
  const result = compareGear(c, other);
  assert.equal(result.verdict, 'tradeoff');
  assert.equal(result.rows.find((row) => row.key === 'heal')!.delta, -3);
  assert.equal(result.rows.find((row) => row.key === 'reduction')!.delta, 0);
});
test('camera-relative movement is continuous across a complete orbit and close zoom is bounded', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI, 9]) {
    const motion = screenMovement(0.6, 0.8, yaw);
    assert.ok(Math.abs(Math.hypot(motion.x, motion.z) - 1) < 1e-9);
    const full = screenMovement(0.6, 0.8, yaw + Math.PI * 2);
    assert.ok(Math.hypot(motion.x - full.x, motion.z - full.z) < 1e-9);
    assert.ok(Math.abs(wrapYaw(yaw)) <= Math.PI);
  }
  assert.equal(clampZoom(0.01), CAMERA.minZoom);
  assert.ok(CAMERA.minZoom < 0.35);
  assert.equal(clampZoom(99), CAMERA.maxZoom);
});

test('white bags identify named keeper relics without overpromising ordinary drops', async () => {
  const { bagStyle, LOOT_BAGS } = await import('../shared/gear.js');
  const item = makeItem('weapon', 6, 'rare');
  assert.equal(bagStyle(item), 'cyan');
  assert.equal(bagStyle({ ...item, tier: 4 }), 'blue');
  assert.equal(bagStyle({ ...item, rarity: 'uncommon' }), 'purple');
  assert.equal(bagStyle({ ...item, rarity: 'common' }), 'brown');
  assert.equal(bagStyle({ ...item, rarity: 'relic' }), 'gold');
  assert.equal(bagStyle({ ...item, rarity: 'relic', relicId: 'archivist' }), 'white');
  assert.notEqual(bagStyle({ ...item, relicId: 'archivist' }), 'white');
  assert.equal(new Set(Object.values(LOOT_BAGS).map((b) => b.color)).size, 6);
});
test('camera tilt stays above the combat plane and recovers from invalid saved preferences', async () => {
  const { clampPitch } = await import('../src/game/camera.js');
  assert.equal(clampPitch(-100), CAMERA.minPitch);
  assert.equal(clampPitch(150), CAMERA.maxPitch);
  assert.equal(clampPitch(NaN), CAMERA.defaultPitch);
  assert.equal(clampPitch(Infinity), CAMERA.defaultPitch);
  assert.equal(clampPitch(60), 60);
  assert.ok(CAMERA.minPitch >= 30 && CAMERA.maxPitch < 90);
});
