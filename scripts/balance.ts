/** Deterministic encounter exercise, not a substitute for human playtesting.
 * Uses normal intent/actions after arranging an isolated, level-appropriate encounter. */
import { Store } from '../server/database.js';
import { Realm } from '../server/realm.js';
import { createCharacter, makeItem, stats } from '../server/model.js';
import { CLASSES, MAX_TIER, distance } from '../shared/content.js';
import { BOSS_RELICS, GEAR_SETS, weaponShots } from '../shared/combat.js';
import { inBounds, random } from '../shared/world.js';
import { fightRooms, layoutFor } from '../shared/layout.js';
import type { ClassId } from '../shared/types.js';
const encounters = [
  ['rootwarden', 5, 2],
  ['duskwarden', 6, 2],
  ['glasswarden', 8, 3],
  ['archivist', 8, 3],
  ['forgemother', 12, 4],
  ['sovereign', 20, 5],
  ['tideelder', 20, 6],
  ['cinderelder', 20, 6],
  ['nullelder', 20, 6],
  // The outer ring, one keeper per band, plus the six doors that only ever fall in the world.
  ['warrenmother', 5, 2],
  ['lanternprime', 8, 3],
  ['hivequeen', 11, 4],
  ['vigilkeeper', 15, 5],
  ['tidechoir', 17, 5],
  ['choirmaster', 18, 5],
  ['orchardmother', 20, 5],
  ['chapelwarden', 21, 6],
  ['saltking', 23, 6],
  ['orrerywarden', 26, 7],
  ['marrowherald', 29, 7],
  ['fusedtitan', 30, 8],
  ['stormremembers', 30, 8],
] as const;
const rows: {
  class: ClassId;
  boss: string;
  level: number;
  outcome: string;
  seconds: number;
  health: number;
  damageTaken: number;
  tonics: number;
}[] = [];
for (const cls of ['arcanist', 'ranger', 'sentinel'] as ClassId[])
  for (const [kind, level, tier] of encounters) {
    const store = new Store(':memory:'),
      realm = new Realm('balance', 'Balance', store);
    realm.enemies.clear();
    realm.event.remaining = Infinity;
    const account = store.create('Scout');
    account.profile.character = createCharacter(cls);
    const c = account.profile.character;
    c.level = level;
    for (const slot of ['weapon', 'armor', 'charm'] as const)
      c.equipment[slot] = makeItem(slot, tier, 'uncommon', random(4));
    c.hp = stats(c).maxHp;
    c.mp = stats(c).maxMp;
    const p = realm.add(account.profile, cls, () => {});
    // A keeper's stage, in a real instance: an isolated arena with room to read a storm.
    const run = realm.dungeons.open('hollow');
    const stage = fightRooms(layoutFor(run.id)!).at(-1)!;
    p.dimension = run.id;
    p.x = stage.x;
    p.z = stage.z + 12;
    const enemy = realm.spawn(kind, stage.x, stage.z - 4, run.id);
    let seq = 0,
      tonics = 0,
      damageTaken = 0,
      previousHp = c.hp;
    const desired = Math.min(19, CLASSES[cls].range * 0.7);
    while (realm.time < 180 && p.profile.character && realm.enemies.has(enemy.id)) {
      const speed = stats(c).speed;
      const dx = p.x - enemy.x,
        dz = p.z - enemy.z,
        d = Math.hypot(dx, dz) || 1;
      let best = { x: 0, z: 0, score: Infinity };
      for (let i = -1; i < 16; i++) {
        const a = (i * Math.PI) / 8,
          x = i < 0 ? 0 : Math.cos(a),
          z = i < 0 ? 0 : Math.sin(a);
        let score =
          Math.abs(Math.hypot(dx + x * speed * 0.4, dz + z * speed * 0.4) - desired) * 0.18 -
          (x * (-dz / d) + z * (dx / d)) * 0.28;
        if (!inBounds(p.x + x * speed * 0.18, p.z + z * speed * 0.18, p.dimension)) score += 50;
        for (const b of realm.bullets.values())
          if (!b.friendly) {
            for (const t of [0.1, 0.25, 0.4, 0.6]) {
              const gap = Math.hypot(
                p.x + x * speed * t - b.x - b.vx * t,
                p.z + z * speed * t - b.z - b.vz * t,
              );
              score += Math.max(0, 1.4 - gap) ** 2 * 12 * (1 - t);
            }
          }
        for (const h of realm.hazards.values()) {
          const until = h.detonates - realm.time;
          if (until > 0 && until < 1.65) {
            const t = Math.min(0.8, until);
            const gap = Math.hypot(p.x + x * speed * t - h.x, p.z + z * speed * t - h.z);
            score += Math.max(0, h.radius + 1 - gap) ** 2 * (until < 0.4 ? 40 : 8);
          }
        }
        if (score < best.score) best = { x, z, score };
      }
      realm.input(p.profile.id, {
        x: best.x,
        z: best.z,
        angle: Math.atan2(enemy.z - p.z, enemy.x - p.x),
        fire: true,
        seq: ++seq,
      });
      if (best.score > 3) realm.action(p.profile.id, 'dash');
      if (c.hp < stats(c).maxHp * 0.45 && c.potions && p.cooldowns.potion <= realm.time) {
        realm.action(p.profile.id, 'potion');
        tonics++;
      }
      if (
        distance(p, enemy) < (cls === 'arcanist' ? 10 : 30) ||
        (cls === 'sentinel' && c.hp < stats(c).maxHp * 0.8)
      )
        realm.action(p.profile.id, 'ability');
      realm.step();
      if (c.hp < previousHp) damageTaken += previousHp - c.hp;
      previousHp = c.hp;
    }
    rows.push({
      class: cls,
      boss: kind,
      level,
      outcome: !realm.enemies.has(enemy.id)
        ? 'cleared'
        : !p.profile.character
          ? 'died'
          : 'timed out',
      seconds: Number(realm.time.toFixed(1)),
      health: Math.max(0, Math.round(c.hp)),
      damageTaken: Math.round(damageTaken),
      tonics,
    });
    store.close();
  }
console.table(rows);
console.log(JSON.stringify(rows));

/**
 * Two level-thirty travelers of the same calling, built differently, against the same
 * keeper. Attunement spreads and set bonuses have to be worth choosing between, and the
 * only way to say that honestly is to run both and print the numbers.
 */
const builds: {
  name: string;
  set: string;
  draughts: Record<string, number>;
}[] = [
  {
    name: 'Sharp',
    set: 'sun-and-glass',
    draughts: { might: 22, quickness: 22, swiftness: 10 },
  },
  {
    name: 'Steady',
    set: 'salt-and-stone',
    draughts: { vitality: 22, ward: 22, wellspring: 10 },
  },
];
const comparison = builds.map((build) => {
  const store = new Store(':memory:'),
    realm = new Realm('builds', 'Builds', store);
  realm.enemies.clear();
  realm.event.remaining = Infinity;
  const account = store.create(build.name);
  const c = (account.profile.character = createCharacter('arcanist'));
  c.level = 30;
  c.attunements = { ...build.draughts };
  const set = GEAR_SETS.find((g) => g.id === build.set)!;
  for (const [index, slot] of (['weapon', 'armor', 'charm'] as const).entries()) {
    const relicKind = set.relics[index];
    const item = makeItem(slot, MAX_TIER, 'relic', random(9));
    Object.assign(item, BOSS_RELICS[relicKind], { relicId: relicKind, slot, tier: MAX_TIER });
    c.equipment[slot] = item;
  }
  c.hp = stats(c).maxHp;
  c.mp = stats(c).maxMp;
  const p = realm.add(account.profile, 'arcanist', () => {});
  const run = realm.dungeons.open('hollow');
  const stage = fightRooms(layoutFor(run.id)!).at(-1)!;
  p.dimension = run.id;
  p.x = stage.x;
  p.z = stage.z + 12;
  const enemy = realm.spawn('nullelder', stage.x, stage.z - 4, run.id);
  const s = stats(c),
    shots = weaponShots(c);
  let seq = 0,
    damageTaken = 0,
    previousHp = c.hp;
  while (realm.time < 240 && p.profile.character && realm.enemies.has(enemy.id)) {
    const dx = p.x - enemy.x,
      dz = p.z - enemy.z,
      d = Math.hypot(dx, dz) || 1;
    let best = { x: 0, z: 0, score: Infinity };
    for (let i = -1; i < 16; i++) {
      const a = (i * Math.PI) / 8,
        x = i < 0 ? 0 : Math.cos(a),
        z = i < 0 ? 0 : Math.sin(a);
      let score =
        Math.abs(Math.hypot(dx + x * s.speed * 0.4, dz + z * s.speed * 0.4) - 17) * 0.18 -
        (x * (-dz / d) + z * (dx / d)) * 0.28;
      if (!inBounds(p.x + x * s.speed * 0.18, p.z + z * s.speed * 0.18, p.dimension)) score += 50;
      for (const b of realm.bullets.values())
        if (!b.friendly)
          for (const t of [0.1, 0.25, 0.4, 0.6]) {
            const gap = Math.hypot(
              p.x + x * s.speed * t - b.x - b.vx * t,
              p.z + z * s.speed * t - b.z - b.vz * t,
            );
            score += Math.max(0, 1.4 - gap) ** 2 * 12 * (1 - t);
          }
      if (score < best.score) best = { x, z, score };
    }
    realm.input(p.profile.id, {
      x: best.x,
      z: best.z,
      angle: Math.atan2(enemy.z - p.z, enemy.x - p.x),
      fire: true,
      seq: ++seq,
    });
    if (best.score > 3) realm.action(p.profile.id, 'dash');
    realm.step();
    if (c.hp < previousHp) damageTaken += previousHp - c.hp;
    previousHp = c.hp;
  }
  store.close();
  return {
    build: build.name,
    set: set.name,
    health: Math.round(s.maxHp),
    damage: Number(s.damage.toFixed(1)),
    blocked: `${Math.round(s.reduction * 100)}%`,
    speed: Number(s.speed.toFixed(2)),
    dps: Math.round((s.damage / s.rate) * shots.reduce((sum, shot) => sum + shot.damage, 0)),
    // Effective health: what the bar is actually worth once armour is taken into account.
    effective: Math.round(s.maxHp / (1 - s.reduction)),
    seconds: Number(realm.time.toFixed(1)),
    damageTaken: Math.round(damageTaken),
    cleared: !realm.enemies.has(enemy.id),
  };
});
console.table(comparison);
console.log(JSON.stringify(comparison));

if (rows.some((row) => row.outcome !== 'cleared')) process.exitCode = 1;
if (comparison.some((row) => !row.cleared)) process.exitCode = 1;
// Two builds that perform the same are two builds nobody has to choose between.
if (Math.abs(comparison[0].dps - comparison[1].dps) < comparison[0].dps * 0.1)
  throw new Error('Attunement spreads and sets do not separate builds by damage.');
if (Math.abs(comparison[0].health - comparison[1].health) < 60)
  throw new Error('Attunement spreads and sets do not separate builds by durability.');
