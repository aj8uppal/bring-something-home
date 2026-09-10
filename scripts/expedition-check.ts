/** Complete expeditions with normal server inputs/actions after arranging progression fixtures.
 * The bot has perfect knowledge of bullet positions; this checks feasibility, not human difficulty. */
import { Store } from '../server/database.js';
import { Realm } from '../server/realm.js';
import { makeItem, stats } from '../server/model.js';
import { CLASSES, DUNGEONS, distance } from '../shared/content.js';
import { ensureLegacy } from '../shared/endgame.js';
import type { ClassId, DungeonId } from '../shared/types.js';

const results: object[] = [];
let failed = false;
for (const cls of ['arcanist', 'ranger', 'sentinel'] as ClassId[]) {
  for (const [dim, depth, level, tier, cycle] of [
    ['hollow', 1, 8, 3],
    ['crucible', 1, 12, 4],
    ['eclipse', 1, 20, 6],
    ['eclipse', 12, 20, 6],
    ['eclipse', 12, 20, 6, 1],
    ['eclipse', 12, 20, 6, 2],
  ] as [DungeonId, number, number, number, number?][]) {
    const store = new Store(':memory:'),
      realm = new Realm('exercise', 'Exercise', store);
    const p = realm.add(store.create('Scout').profile, cls, () => {}),
      c = p.profile.character!;
    realm.event.remaining = Infinity;
    realm.dungeons.cycle = cycle ?? 0;
    c.level = level;
    p.profile.victories = 1;
    const legacy = ensureLegacy(p.profile);
    legacy.highestDepth = depth - 1;
    legacy.selectedDepth = depth;
    for (const slot of ['weapon', 'armor', 'charm'] as const)
      c.equipment[slot] = makeItem(slot, tier, 'rare', () => 0.5);
    c.hp = stats(c).maxHp;
    c.mp = stats(c).maxMp;
    p.x = DUNGEONS[dim].x;
    p.z = DUNGEONS[dim].z;
    realm.action(p.profile.id, 'interact');
    let seq = 0,
      damage = 0,
      previousHp = c.hp,
      lastStage = 0;
    while (
      realm.time < 720 &&
      p.profile.character &&
      realm.dungeons.state(dim)?.status !== 'cleared'
    ) {
      const state = realm.dungeons.state(dim)!;
      if (state.stage !== lastStage) {
        lastStage = state.stage;
      }
      const enemies = [...realm.enemies.values()]
        .filter((e) => e.dimension === dim)
        .sort((a, b) => distance(a, p) - distance(b, p));
      const target = state.status === 'ready' ? state.altar : enemies[0];
      if (!target) throw new Error('An active chamber has no target');
      const speed = stats(c).speed,
        dx = p.x - target.x,
        dz = p.z - target.z,
        d = Math.hypot(dx, dz) || 1;
      const desired = state.status === 'ready' ? 0 : Math.min(16, CLASSES[cls].range * 0.7);
      let best = { x: 0, z: 0, score: Infinity };
      for (let i = -1; i < 24; i++) {
        const a = (i * Math.PI) / 12,
          x = i < 0 ? 0 : Math.cos(a),
          z = i < 0 ? 0 : Math.sin(a);
        let score =
          Math.abs(Math.hypot(dx + x * speed * 0.4, dz + z * speed * 0.4) - desired) * 0.2;
        if (state.status === 'active') score -= ((x * -dz) / d + (z * dx) / d) * 0.2;
        if (Math.abs(p.x + x * speed * 0.6) > 27 || Math.abs(p.z + z * speed * 0.6) > 27)
          score += 100;
        for (const b of realm.bullets.values())
          if (!b.friendly && b.dimension === dim)
            for (const t of [0.1, 0.25, 0.4, 0.6]) {
              const gap = Math.hypot(
                p.x + x * speed * t - b.x - b.vx * t,
                p.z + z * speed * t - b.z - b.vz * t,
              );
              score += Math.max(0, 1.4 - gap) ** 2 * 16 * (1 - t);
            }
        for (const h of realm.hazards.values())
          if (h.dimension === dim) {
            const until = h.detonates - realm.time;
            if (until > 0 && until < 1.65) {
              const t = Math.min(0.8, until),
                gap = Math.hypot(p.x + x * speed * t - h.x, p.z + z * speed * t - h.z);
              score += Math.max(0, h.radius + 1 - gap) ** 2 * (until < 0.4 ? 40 : 8);
            }
          }
        if (score < best.score) best = { x, z, score };
      }
      realm.input(p.profile.id, {
        x: best.x,
        z: best.z,
        angle: Math.atan2(target.z - p.z, target.x - p.x),
        fire: state.status === 'active',
        seq: ++seq,
      });
      if (state.status === 'ready' && d < 3) realm.action(p.profile.id, 'delve');
      if (best.score > 3) realm.action(p.profile.id, 'dash');
      if (c.hp < stats(c).maxHp * 0.55) realm.action(p.profile.id, 'potion');
      if (state.status === 'active' && (cls !== 'arcanist' || d < 10))
        realm.action(p.profile.id, 'ability');
      realm.step();
      if (c.hp < previousHp) damage += previousHp - c.hp;
      previousHp = c.hp;
    }
    const clear = realm.dungeons.state(dim)?.status === 'cleared';
    failed ||= !clear;
    results.push({
      class: cls,
      dungeon: dim,
      modifier: realm.dungeons.state(dim)?.modifier,
      depth,
      cleared: clear,
      seconds: Number(realm.time.toFixed(1)),
      damageTaken: Math.round(damage),
      shards: legacy.shards,
      deepestClear: legacy.highestDepth,
    });
    store.close();
  }
}
console.table(results);
console.log(JSON.stringify(results));
if (failed) process.exitCode = 1;
