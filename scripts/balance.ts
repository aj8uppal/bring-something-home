/** Deterministic encounter exercise, not a substitute for human playtesting.
 * Uses normal intent/actions after arranging an isolated, level-appropriate encounter. */
import { Store } from '../server/database.js';
import { Realm } from '../server/realm.js';
import { createCharacter, makeItem, stats } from '../server/model.js';
import { CLASSES, distance } from '../shared/content.js';
import { random } from '../shared/world.js';
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
    p.dimension = 'hollow';
    p.x = 0;
    p.z = 0;
    const enemy = realm.spawn(kind, 0, -14, 'hollow');
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
        if (Math.abs(p.x + x * speed * 0.5) > 27 || Math.abs(p.z + z * speed * 0.5) > 27)
          score += 50;
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

if (rows.some((row) => row.outcome !== 'cleared')) process.exitCode = 1;
