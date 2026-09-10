/** Complete expeditions with normal server inputs/actions after arranging progression fixtures.
 * The bot has perfect knowledge of bullet positions; this checks feasibility, not human difficulty. */
import { Store } from '../server/database.js';
import { Realm } from '../server/realm.js';
import { makeItem, stats } from '../server/model.js';
import { CLASSES, DUNGEONS, ENEMIES, distance } from '../shared/content.js';
import { canMove, inBounds } from '../shared/world.js';
/** Whether a shot fired at this target would actually reach it, or stop at a wall. */
function canSee(from: { x: number; z: number }, to: { x: number; z: number }, dim: string) {
  const steps = Math.max(2, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 1.2));
  for (let i = 1; i <= steps; i++)
    if (
      !canMove(from.x + ((to.x - from.x) * i) / steps, from.z + ((to.z - from.z) * i) / steps, dim)
    )
      return false;
  return true;
}
import { flowTo, layoutFor, nearestRoom, roomAt, type Flow } from '../shared/layout.js';
import { ensureLegacy } from '../shared/endgame.js';
import type { ClassId, DungeonId } from '../shared/types.js';

/** Generated instances are a longer walk than one 60-unit box, so the budget grew with them. */
const BUDGET = 900;
const results: object[] = [];
let failed = false;
for (const cls of ['arcanist', 'ranger', 'sentinel'] as ClassId[]) {
  // Generated layouts and the depth dial are exercised alongside the authored Elder ladder.
  for (const [dim, depth, level, tier, cycle] of [
    ['hollow', 1, 8, 3],
    ['hollow', 5, 14, 5],
    ['crucible', 1, 12, 4],
    ['crucible', 3, 16, 5],
    ['warren', 1, 5, 2],
    ['hive', 3, 14, 5],
    ['chapel', 1, 20, 6],
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
    legacy.bestDepths = { [dim]: depth - 1 };
    legacy.selectedDepths = { [dim]: depth };
    for (const slot of ['weapon', 'armor', 'charm'] as const)
      c.equipment[slot] = makeItem(slot, tier, 'rare', () => 0.5);
    c.hp = stats(c).maxHp;
    c.mp = stats(c).maxMp;
    if (DUNGEONS[dim]) {
      p.x = DUNGEONS[dim].x;
      p.z = DUNGEONS[dim].z;
      realm.action(p.profile.id, 'interact');
    } else {
      realm.recall(p);
      realm.action(p.profile.id, 'rally', dim);
    }
    if (p.dimension === 'wilds') throw new Error(`${cls} could not enter ${dim} at depth ${depth}`);
    let seq = 0,
      damage = 0,
      previousHp = c.hp,
      lastStage = 0;
    // The bot walks the instance's route with an index, so progress along a corridor is
    // monotone and it can never oscillate between two waypoints.
    let flow: Flow | undefined,
      flowKey = '';
    while (
      realm.time < BUDGET &&
      p.profile.character &&
      realm.dungeons.state(p.dimension)?.status !== 'cleared'
    ) {
      const state = realm.dungeons.state(p.dimension)!;
      if (state.stage !== lastStage) {
        lastStage = state.stage;
      }
      if (process.env.TRACE && Math.round(realm.time * 20) % Number(process.env.TRACE) === 0)
        console.error(
          'TRACE',
          cls,
          dim,
          realm.time.toFixed(0),
          state.status,
          state.stage,
          p.x.toFixed(1),
          p.z.toFixed(1),
          c.hp.toFixed(0),
          realm.enemies.size,
        );
      const layoutNow = layoutFor(p.dimension);
      const roomOf = (v: { x: number; z: number }) =>
        layoutNow ? (roomAt(layoutNow, v.x, v.z)?.id ?? -1) : 0;
      const myRoom = roomOf(p);
      // Fight what is in the room with you, not the nearest thing through a wall.
      const enemies = [...realm.enemies.values()]
        .filter((e) => e.dimension === p.dimension && e.sideRoom === undefined)
        .sort(
          (a, b) =>
            Number(canSee(p, b, p.dimension)) - Number(canSee(p, a, p.dimension)) ||
            Number(roomOf(b) === myRoom) - Number(roomOf(a) === myRoom) ||
            distance(a, p) - distance(b, p),
        );
      const goal = state.status === 'ready' ? state.altar : enemies[0];
      if (!goal) throw new Error('An active chamber has no target');
      // Rooms are joined by corridors now. Walk the flow field to the room the fight is in,
      // then fight inside it exactly as the bot always has.
      const layout = layoutNow;
      const here = layout ? roomAt(layout, p.x, p.z) : undefined;
      const there = layout
        ? (roomAt(layout, goal.x, goal.z) ?? nearestRoom(layout, goal))
        : undefined;
      const arrived =
        !layout || (!!here && !!there && here.id === there.id && canSee(p, goal, p.dimension));
      if (layout && !arrived) {
        const key = `${there!.id}`;
        if (key !== flowKey) {
          flow = flowTo(layout, { x: there!.x, z: there!.z });
          flowKey = key;
        }
      } else flowKey = '';
      const target = arrived || !flow ? goal : flow.step(p);
      const speed = stats(c).speed,
        dx = p.x - target.x,
        dz = p.z - target.z,
        d = Math.hypot(dx, dz) || 1;
      const guarded = 'kind' in target ? ENEMIES[(target as { kind: string }).kind]?.guard : 0;
      const desired =
        !arrived || state.status === 'ready'
          ? 0
          : guarded
            ? 5
            : Math.min(16, CLASSES[cls].range * 0.7);
      // Never evaluate a step that overshoots the waypoint, or the bot parks just short of it.
      const step = Math.min(speed * 0.4, Math.max(0.8, Math.abs(d - desired)));
      let best = { x: 0, z: 0, score: Infinity };
      for (let i = -1; i < 24; i++) {
        const a = (i * Math.PI) / 12,
          x = i < 0 ? 0 : Math.cos(a),
          z = i < 0 ? 0 : Math.sin(a);
        let score = Math.abs(Math.hypot(dx + x * step, dz + z * step) - desired) * 0.2;
        if (arrived && state.status === 'active') score -= ((x * -dz) / d + (z * dx) / d) * 0.2;
        // A bulwark's front turns shots aside, so the bot has to walk around it like anyone else.
        const guard =
          'kind' in target ? ENEMIES[(target as { kind: string }).kind]?.guard : undefined;
        if (guard) {
          const facing =
            Math.atan2(p.z + z * step - target.z, p.x + x * step - target.x) -
            (target as { angle: number }).angle;
          const off = Math.abs(Math.atan2(Math.sin(facing), Math.cos(facing)));
          if (off < guard + 0.2) score += 8;
        }
        // Generated rooms are any shape; the bot looks one step ahead, not six, so a
        // corridor does not read as a dead end in every direction at once.
        if (!inBounds(p.x + x * speed * 0.12, p.z + z * speed * 0.12, p.dimension)) score += 100;
        for (const b of realm.bullets.values())
          if (!b.friendly && b.dimension === p.dimension)
            for (const t of [0.1, 0.25, 0.4, 0.6]) {
              const gap = Math.hypot(
                p.x + x * speed * t - b.x - b.vx * t,
                p.z + z * speed * t - b.z - b.vz * t,
              );
              score += Math.max(0, 1.4 - gap) ** 2 * 16 * (1 - t);
            }
        for (const h of realm.hazards.values())
          if (h.dimension === p.dimension) {
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
        angle: Math.atan2(goal.z - p.z, goal.x - p.x),
        fire: state.status === 'active',
        seq: ++seq,
      });
      if (process.env.TRACE && Math.round(realm.time * 20) % Number(process.env.TRACE) === 0)
        console.error(
          '   step',
          `goal ${goal.x.toFixed(1)},${goal.z.toFixed(1)}`,
          `way ${target.x.toFixed(1)},${target.z.toFixed(1)}`,
          `move ${best.x.toFixed(2)},${best.z.toFixed(2)}`,
          `score ${best.score.toFixed(2)}`,
          `at ${p.x.toFixed(2)},${p.z.toFixed(2)}`,
          `ahead ${inBounds(p.x + best.x * 0.5, p.z + best.z * 0.5, p.dimension)}`,
          `room ${JSON.stringify(layoutFor(p.dimension)?.rooms.map((r) => [r.id, r.kind, r.x, r.z, r.w, r.h]))}`,
        );
      if (state.status === 'ready' && Math.hypot(p.x - goal.x, p.z - goal.z) < 3)
        realm.action(p.profile.id, 'delve');
      if (best.score > 3) realm.action(p.profile.id, 'dash');
      if (c.hp < stats(c).maxHp * 0.55) realm.action(p.profile.id, 'potion');
      if (state.status === 'active' && (cls !== 'arcanist' || d < 10))
        realm.action(p.profile.id, 'ability');
      const beforeZ = p.z;
      realm.step();
      if (process.env.TRACE2 && realm.time > 12 && realm.time < 12.4)
        console.error(
          'TICK',
          realm.time.toFixed(2),
          'z',
          beforeZ.toFixed(3),
          '->',
          p.z.toFixed(3),
          'input',
          JSON.stringify(p.input),
          'dim',
          p.dimension,
          'speed',
          stats(c).speed,
          'lastInput',
          p.lastInput.toFixed(2),
        );
      if (c.hp < previousHp) damage += previousHp - c.hp;
      previousHp = c.hp;
    }
    const clear = realm.dungeons.state(p.dimension)?.status === 'cleared';
    failed ||= !clear;
    results.push({
      class: cls,
      dungeon: dim,
      modifier: realm.dungeons.run(p.dimension)?.modifier,
      depth,
      cleared: clear,
      stage: realm.dungeons.state(p.dimension)?.stage ?? 0,
      stages: realm.dungeons.state(p.dimension)?.stages ?? 0,
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
