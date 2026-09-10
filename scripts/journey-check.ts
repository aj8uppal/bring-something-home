/** Start with an ordinary new account and follow the shipped journey using server inputs.
 * No level, gear, kill, position, or reward fixtures. Perfect-state dodging checks that the
 * whole progression is connected and feasible; it does not measure human retention. */
import { Store } from '../server/database.js';
import { Realm } from '../server/realm.js';
import { stats } from '../server/model.js';
import { CLASSES, distance } from '../shared/content.js';
import { canMove } from '../shared/world.js';
import { bagItems } from '../shared/loot.js';
import { compareGear } from '../shared/gear.js';
import { journeyGoal, journeyTarget } from '../shared/progression.js';
import type { ClassId, Dimension, Snapshot, Vec } from '../shared/types.js';

// Navigation belongs to this test pilot, never to the player's movement controls.
function route(from: Vec, to: Vec, dim: Dimension): Vec[] {
  const size = 2,
    key = (x: number, z: number) => `${x},${z}`;
  const start = { x: Math.round(from.x / size), z: Math.round(from.z / size) };
  const end = { x: Math.round(to.x / size), z: Math.round(to.z / size) };
  const open = [{ ...start, g: 0, f: 0 }],
    seen = new Set<string>();
  const parent = new Map<string, string>(),
    costs = new Map([[key(start.x, start.z), 0]]);
  while (open.length && seen.size < 11000) {
    open.sort((a, b) => b.f - a.f);
    const n = open.pop()!,
      id = key(n.x, n.z);
    if (seen.has(id)) continue;
    if (Math.hypot(n.x - end.x, n.z - end.z) < 1.5) {
      const path: Vec[] = [{ ...to }];
      let id: string | undefined = key(n.x, n.z);
      while (id) {
        const [x, z] = id.split(',').map(Number);
        path.unshift({ x: x * size, z: z * size });
        id = parent.get(id);
      }
      return path.slice(1);
    }
    seen.add(id);
    for (let x = -1; x <= 1; x++)
      for (let z = -1; z <= 1; z++) {
        if (!x && !z) continue;
        const nx = n.x + x,
          nz = n.z + z,
          next = key(nx, nz),
          g = n.g + Math.hypot(x, z);
        if (seen.has(next) || g >= (costs.get(next) ?? Infinity)) continue;
        if (
          ![0.25, 0.5, 0.75, 1].every((t) =>
            canMove((n.x + x * t) * size, (n.z + z * t) * size, dim),
          )
        )
          continue;
        costs.set(next, g);
        parent.set(next, id);
        open.push({ x: nx, z: nz, g, f: g + Math.hypot(nx - end.x, nz - end.z) });
      }
  }
  return [to];
}

const results = [];
for (const cls of (process.env.JOURNEY_CLASS
  ? [process.env.JOURNEY_CLASS]
  : ['arcanist', 'ranger', 'sentinel']) as ClassId[]) {
  const store = new Store(':memory:'),
    realm = new Realm('journey', 'Journey', store);
  const p = realm.add(store.create('Pathfinder').profile, cls, () => {});
  const chapters: { chapter: number; level: number; seconds: number }[] = [];
  // The first arc must be walked in order: gate, bag, wear, clear, grove, warden.
  const steps: { id: string; seconds: number }[] = [];
  let weaponAt: number | undefined;
  let seq = 0,
    path: Vec[] = [],
    pathKey = '',
    nextPath = 0,
    lastLog = 0;
  try {
    while (p.profile.character && p.profile.character.quest < 8 && realm.time < 1800) {
      const c = p.profile.character,
        s = stats(c);
      if (chapters.at(-1)?.chapter !== c.quest) {
        chapters.push({ chapter: c.quest, level: c.level, seconds: +realm.time.toFixed(1) });
        console.log(cls, 'chapter', c.quest + 1, 'level', c.level, 'time', realm.time.toFixed(1));
      }
      const self = realm.publicPlayer(p);
      const owned = [...realm.loot.values()].filter(
        (b) => b.owner === p.profile.id && b.dimension === p.dimension,
      );
      const snapshot = {
        self,
        realm: realm.info(),
        enemies: [...realm.enemies.values()].filter((e) => e.dimension === p.dimension),
        loot: owned,
        players: [],
      } as unknown as Snapshot;
      const goal = journeyGoal(p.profile, snapshot);
      if (steps.at(-1)?.id !== goal.id)
        steps.push({ id: goal.id, seconds: +realm.time.toFixed(1) });
      if (weaponAt === undefined && (c.equipment.weapon?.tier ?? 0) >= 2)
        weaponAt = +realm.time.toFixed(1);
      // Wear upgrades only after the objective has had a chance to point at them.
      for (const item of [...c.inventory])
        if (compareGear(c, item).verdict === 'upgrade')
          realm.action(p.profile.id, 'equip', item.id);
      const drops = owned
        .filter((b) => bagItems(b).some((i) => compareGear(c, i).verdict === 'upgrade'))
        .sort((a, b) => distance(a, p) - distance(b, p));
      let target: Vec = journeyTarget(goal, snapshot),
        desired = 0,
        action = '';
      const room = p.dimension === 'wilds' ? undefined : realm.dungeons.state(p.dimension);
      const enemy = snapshot.enemies.sort((a, b) => distance(a, p) - distance(b, p))[0];
      const relevant = goal.enemy && snapshot.enemies.find((e) => e.kind === goal.enemy);
      let fight = relevant && distance(relevant, p) < CLASSES[cls].range ? relevant : enemy;
      if (self.safe && c.hp < s.maxHp * 0.97) {
        target = p;
        fight = undefined;
      } else if (drops[0] && distance(drops[0], p) < 24) {
        target = drops[0];
        action = 'loot';
      } else if (room?.status === 'cleared') {
        realm.action(p.profile.id, 'recall');
        continue;
      } else if (room?.status === 'ready') {
        target = room.altar;
        action = 'delve';
      } else if (room?.status === 'active' && enemy) {
        target = enemy;
        desired = Math.min(15, CLASSES[cls].range * 0.7);
      } else if (goal.dungeon) {
        if (!self.safe) {
          realm.action(p.profile.id, 'recall');
          continue;
        }
        realm.action(p.profile.id, 'salvage');
        for (const item of [...c.inventory])
          if (p.profile.vault.length < 48) realm.action(p.profile.id, 'store', item.id);
        if (goal.depth) realm.action(p.profile.id, 'attune', String(goal.depth));
        realm.action(p.profile.id, 'rally', goal.dungeon);
        path = [];
        continue;
      } else if (self.safe) action = 'interact';
      else if (relevant || (goal.enemy === 'cinderling' && enemy?.kind === 'thornling')) {
        target = relevant ?? enemy!;
        desired = Math.min(15, CLASSES[cls].range * 0.7);
      }
      if (action && distance(p, target) < 3.4) {
        if (action === 'loot') {
          if (c.inventory.length < 18) realm.action(p.profile.id, 'loot-all', drops[0].id);
          else {
            const upgrade = bagItems(drops[0]).find((i) => compareGear(c, i).verdict === 'upgrade');
            if (upgrade) realm.action(p.profile.id, 'loot-equip', `${drops[0].id}:${upgrade.id}`);
          }
        } else realm.action(p.profile.id, action as 'interact' | 'delve');
      }
      const direct = distance(p, target) < desired + 3 || p.dimension !== 'wilds';
      const routeKey = `${p.dimension}:${Math.round(target.x / 3)},${Math.round(target.z / 3)}`;
      if (!direct && (routeKey !== pathKey || realm.time > nextPath)) {
        path = route(p, target, p.dimension);
        pathKey = routeKey;
        nextPath = realm.time + 3;
      }
      while (path.length > 1 && distance(p, path[0]) < 1.8) path.shift();
      const waypoint = direct ? target : (path[0] ?? target),
        range = direct ? desired : 0;
      const dx = p.x - waypoint.x,
        dz = p.z - waypoint.z,
        d = Math.hypot(dx, dz) || 1;
      let best = { x: 0, z: 0, score: Infinity };
      for (let i = -2; i < 24; i++) {
        const a = (i * Math.PI) / 12,
          x = i === -2 ? (-dx / d) * Math.min(1, d / (s.speed * 0.4)) : i < 0 ? 0 : Math.cos(a),
          z = i === -2 ? (-dz / d) * Math.min(1, d / (s.speed * 0.4)) : i < 0 ? 0 : Math.sin(a);
        let score =
          Math.abs(Math.hypot(dx + x * s.speed * 0.35, dz + z * s.speed * 0.35) - range) * 0.35;
        if (range) score -= ((x * -dz) / d + (z * dx) / d) * 0.2;
        for (const t of range ? [0.1, 0.3, 0.5] : [0.1, 0.2])
          if (!canMove(p.x + x * s.speed * t, p.z + z * s.speed * t, p.dimension)) score += 100;
        for (const b of realm.bullets.values())
          if (!b.friendly && b.dimension === p.dimension && distance(p, b) < 16)
            for (const t of [0.1, 0.25, 0.4, 0.6]) {
              const gap = Math.hypot(
                p.x + x * s.speed * t - b.x - b.vx * t,
                p.z + z * s.speed * t - b.z - b.vz * t,
              );
              score += Math.max(0, 1.5 - gap) ** 2 * 15 * (1 - t);
            }
        for (const h of realm.hazards.values())
          if (h.dimension === p.dimension) {
            const until = h.detonates - realm.time;
            if (until > 0 && until < 1.65) {
              const t = Math.min(0.8, until),
                gap = Math.hypot(p.x + x * s.speed * t - h.x, p.z + z * s.speed * t - h.z);
              score += Math.max(0, h.radius + 1 - gap) ** 2 * (until < 0.4 ? 40 : 9);
            }
          }
        if (score < best.score) best = { x, z, score };
      }
      const fire = !!fight && !self.safe && room?.status !== 'ready' && room?.status !== 'cleared';
      realm.input(p.profile.id, {
        x: best.x,
        z: best.z,
        angle: fight ? Math.atan2(fight.z - p.z, fight.x - p.x) : 0,
        fire,
        seq: ++seq,
      });
      if (best.score > 6 && distance(p, target) > 4) realm.action(p.profile.id, 'dash');
      if (c.hp < s.maxHp * 0.55) realm.action(p.profile.id, 'potion');
      if (fire && fight && distance(p, fight) < (cls === 'arcanist' ? 10 : 25))
        realm.action(p.profile.id, 'ability');
      if (c.hp < s.maxHp * 0.2 && !c.potions) realm.action(p.profile.id, 'recall');
      realm.step();
      if (realm.time - lastLog > 120) {
        console.log(
          cls,
          JSON.stringify({
            time: realm.time.toFixed(1),
            level: c.level,
            quest: c.quest,
            goal: goal.title,
            p: { x: p.x, z: p.z },
            dimension: p.dimension,
            room: room?.status,
          }),
        );
        lastLog = realm.time;
      }
    }
    // A perfect-play bot can clear six creatures before it walks to the third-kill bag, so the
    // steps it does see must appear in order, and the gate and bag steps must always appear.
    const order = ['first-gate', 'first-bag', 'first-wear', 'first-clear', 'train-5'];
    const seen = steps.map((s) => s.id).filter((id) => order.includes(id));
    const firstArc =
      seen.includes('first-gate') &&
      seen.includes('first-bag') &&
      seen.every((id, i) => i === 0 || order.indexOf(id) > order.indexOf(seen[i - 1]));
    const grove = steps.findIndex((s) => s.id === 'first-grove'),
      warden = steps.findIndex((s) => s.id === 'chapter-1' || s.id.startsWith('chase-'));
    const wearAt = weaponAt;
    const result = {
      class: cls,
      complete: p.profile.character?.quest === 8,
      firstArc,
      groveBeforeWarden: grove >= 0 && (warden < 0 || grove < warden),
      secondsToFirstWeapon: wearAt,
      steps: steps.slice(0, 10).map((s) => `${s.id}@${s.seconds}`),
      seconds: +realm.time.toFixed(1),
      level: p.profile.character?.level,
      chapters,
      depth: p.profile.legacy?.highestDepth,
      relics: p.profile.legacy?.relics.length,
    };
    results.push(result);
    console.log('RESULT', JSON.stringify(result));
  } finally {
    store.close();
  }
}
console.log(JSON.stringify(results));
if (results.some((r) => !r.complete || !r.firstArc || !r.groveBeforeWarden)) process.exitCode = 1;
