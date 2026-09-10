import { random } from './rng.js';
import { seedOf, templateOf } from './instances.js';
import { TEMPLATE_BY_ID, type DungeonTemplate } from './templates.js';
import type { Dimension, Vec } from './types.js';
import type { Encounter } from './endgame.js';

/**
 * A dungeon layout, generated from the instance id and nothing else.
 *
 * Every client and the server derive the same rooms from the same id, so a layout never
 * travels over the wire and two people standing in the same instance are standing in the
 * same place. The altar pacing is unchanged: one altar per room, cleared in order, with
 * the path between altars being the part that is different every run.
 */
export type RoomKind = 'entry' | 'fight' | 'side' | 'keeper' | 'secret';
export interface Room {
  id: number;
  shape: string;
  /** What this chamber is announced as when its altar wakes. */
  name: string;
  kind: RoomKind;
  x: number;
  z: number;
  /** Full width and depth. */
  w: number;
  h: number;
  /** Where the altar for this room stands: just inside its southern doorway. */
  altar: Vec;
  /** The room this one hangs off: the previous chamber, or the room a branch leaves from. */
  parent?: number;
  /** The points that lead from the parent's centre into this room, through its corridor. */
  route: Vec[];
}
export interface Rect {
  x: number;
  z: number;
  w: number;
  h: number;
}
export interface Layout {
  id: string;
  template: string;
  seed: number;
  rooms: Room[];
  /** Rooms and corridors as one list of rectangles: the whole walkable floor. */
  rects: Rect[];
  corridors: Rect[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** The alcove worth walking the wall for, if this instance rolled one. */
  secret?: Room;
}

const ENTRY = { x: 0, z: 22, w: 24, h: 16 };
/** A boss deserves a stage: the keeper room is much larger than a fighting chamber. */
const KEEPER = { w: 46, h: 42 };
const GAP = 11;
const CORRIDOR = 6.5;

const rectOf = (r: { x: number; z: number; w: number; h: number }): Rect => ({
  x: r.x,
  z: r.z,
  w: r.w,
  h: r.h,
});
const inRect = (x: number, z: number, r: Rect) =>
  Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.h / 2;

/** An L of two rectangles, so every corridor is axis-aligned and cheap to stand in. */
function connect(from: Room, to: Room): Rect[] {
  const legs: Rect[] = [];
  const midZ = (from.z - from.h / 2 + (to.z + to.h / 2)) / 2;
  legs.push({
    x: from.x,
    z: (from.z - from.h / 2 + midZ) / 2,
    w: CORRIDOR,
    h: Math.abs(from.z - from.h / 2 - midZ) + 1,
  });
  if (Math.abs(to.x - from.x) > 0.5)
    legs.push({
      x: (from.x + to.x) / 2,
      z: midZ,
      w: Math.abs(to.x - from.x) + CORRIDOR,
      h: CORRIDOR,
    });
  legs.push({
    x: to.x,
    z: (midZ + to.z + to.h / 2) / 2,
    w: CORRIDOR,
    h: Math.abs(midZ - (to.z + to.h / 2)) + 1,
  });
  return legs;
}

export function generateLayout(template: DungeonTemplate, seed: number, id = ''): Layout {
  const rng = random(seed || 1);
  const pick = <T>(list: T[]) => list[Math.floor(rng() * list.length)];
  const { min, max, optional } = template.graph;
  const fights = min + Math.floor(rng() * (max - min + 1));
  const rooms: Room[] = [
    {
      id: 0,
      shape: 'entry',
      name: 'The threshold',
      kind: 'entry',
      ...ENTRY,
      altar: { x: 0, z: ENTRY.z },
      route: [],
    },
  ];
  let z = ENTRY.z - ENTRY.h / 2;
  for (let i = 0; i < fights; i++) {
    const last = i === fights - 1;
    const shape = last
      ? {
          shape: 'keeper',
          name: template.keeperRoom,
          size: [KEEPER.w, KEEPER.h] as [number, number],
        }
      : pick(template.rooms);
    const [w, h] = shape.size;
    // A jog on every step is what makes two runs of the same template feel different.
    const x = last ? 0 : Math.round((rng() - 0.5) * 34);
    z -= GAP + h / 2;
    rooms.push({
      id: rooms.length,
      shape: shape.shape,
      name: shape.name,
      kind: last ? 'keeper' : 'fight',
      x,
      z,
      w,
      h,
      altar: { x, z: z + h / 2 - 3 },
      parent: rooms.length - 1,
      route: [],
    });
    z -= h / 2;
  }
  // Side rooms: more risk, more reward, more time, and never on the way to the keeper.
  const middles = rooms.filter((r) => r.kind === 'fight');
  for (let i = 0; i < optional && middles.length; i++) {
    const parent = pick(middles);
    const side = pick(template.rooms);
    const [w, h] = side.size;
    const dir = rng() < 0.5 ? -1 : 1;
    rooms.push({
      id: rooms.length,
      shape: side.shape,
      name: side.name,
      kind: 'side',
      x: parent.x + dir * (parent.w / 2 + 14 + w / 2),
      z: parent.z,
      w: Math.round(w * 0.8),
      h: Math.round(h * 0.8),
      altar: { x: parent.x + dir * (parent.w / 2 + 14 + w / 2), z: parent.z + h * 0.4 - 3 },
      parent: parent.id,
      route: [],
    });
  }
  let secret: Room | undefined;
  if (template.secret.chance > 0 && rng() < template.secret.chance && middles.length) {
    const parent = pick(middles);
    secret = {
      id: rooms.length,
      shape: 'secret',
      name: 'A wall that was not a wall',
      kind: 'secret',
      x: parent.x,
      z: parent.z - parent.h / 2 - 7,
      w: 12,
      h: 10,
      altar: { x: parent.x, z: parent.z - parent.h / 2 - 4 },
      parent: parent.id,
      route: [],
    };
    rooms.push(secret);
  }
  const corridors: Rect[] = [];
  for (let i = 1; i < rooms.length; i++) {
    const room = rooms[i];
    const parent = rooms[room.parent!];
    if (room.kind === 'side' || room.kind === 'secret') {
      const link = {
        x: (parent.x + room.x) / 2,
        z: (parent.z + room.z) / 2,
        w: Math.abs(room.x - parent.x) + CORRIDOR,
        h: Math.abs(room.z - parent.z) + CORRIDOR,
      };
      corridors.push(link);
      room.route = [
        { x: link.x, z: link.z },
        { x: room.x, z: room.z },
      ];
    } else {
      const legs = connect(parent, room);
      corridors.push(...legs);
      // The centre of each leg is a point you can always walk to from the one before it.
      room.route = [...legs.map((l) => ({ x: l.x, z: l.z })), { x: room.x, z: room.z }];
    }
  }
  const rects = [...rooms.map(rectOf), ...corridors];
  const bounds = rects.reduce(
    (b, r) => ({
      minX: Math.min(b.minX, r.x - r.w / 2),
      maxX: Math.max(b.maxX, r.x + r.w / 2),
      minZ: Math.min(b.minZ, r.z - r.h / 2),
      maxZ: Math.max(b.maxZ, r.z + r.h / 2),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  );
  return { id, template: template.id, seed, rooms, rects, corridors, bounds, secret };
}

const cache = new Map<string, Layout>();
/** The layout behind a dimension. Derived from the id, so it is free to ask for anywhere. */
export function layoutFor(dimension: Dimension): Layout | undefined {
  if (dimension === 'wilds') return undefined;
  const hit = cache.get(dimension);
  if (hit) return hit;
  const template = TEMPLATE_BY_ID.get(templateOf(dimension));
  if (!template) return undefined;
  const layout = generateLayout(template, seedOf(dimension) || 1, dimension);
  // Bounded: an instance is short-lived and a layout is a few dozen numbers.
  if (cache.size > 256) cache.clear();
  cache.set(dimension, layout);
  return layout;
}
/** True where a traveler may stand: inside a room or a corridor. */
export function insideLayout(layout: Layout, x: number, z: number) {
  for (const r of layout.rects) if (inRect(x, z, r)) return true;
  return false;
}
export const roomAt = (layout: Layout, x: number, z: number) =>
  layout.rooms.find((r) => inRect(x, z, rectOf(r)));
/** The rooms that make up the run, in order. The entry room holds the way home. */
export const fightRooms = (layout: Layout) =>
  layout.rooms.filter((r) => r.kind === 'fight' || r.kind === 'keeper');

/**
 * The encounters of one instance: one altar per room, cleared in order, exactly the rhythm
 * players already know. Generation changes the path between the altars and what is standing
 * in each room, never the contract.
 */
export function instanceEncounters(dimension: Dimension, authored?: Encounter[]): Encounter[] {
  const layout = layoutFor(dimension);
  const template = TEMPLATE_BY_ID.get(templateOf(dimension));
  if (!layout || !template) return authored ?? [];
  const rooms = fightRooms(layout);
  const rng = random((layout.seed ^ 0x5f3a) | 1);
  return rooms.map((room, i) => {
    const last = i === rooms.length - 1;
    const written = template.authored ? authored?.[i] : undefined;
    const specs = written
      ? written.enemies.map((e) => ({ kinds: [e.kind], count: e.count }))
      : last
        ? [{ kinds: [template.keeper], count: 1 }]
        : (template.encounters[room.shape] ?? []).map((pack) => ({
            kinds: pack.kinds,
            count: pack.count[0] + Math.floor(rng() * (pack.count[1] - pack.count[0] + 1)),
          }));
    return {
      name: written?.name ?? (last ? template.keeperRoom : room.name),
      altar: room.altar,
      enemies: specs.flatMap((spec, j) =>
        spec.kinds.map((kind) => ({
          kind,
          count: Math.max(1, Math.round(spec.count / spec.kinds.length)),
          x: room.x + (j - (specs.length - 1) / 2) * Math.min(8, room.w / 4),
          z: room.z - room.h * 0.12,
          spread: Math.max(2, Math.min(room.w, room.h) / 3),
        })),
      ),
    };
  });
}
/** A side room's optional encounter: more risk, more reward, more time. */
export function sideEncounter(dimension: Dimension, room: Room): Encounter | undefined {
  const template = TEMPLATE_BY_ID.get(templateOf(dimension));
  const layout = layoutFor(dimension);
  if (!template || !layout) return undefined;
  const rng = random((layout.seed ^ (room.id * 2654435761)) | 1);
  const packs = template.encounters[room.shape] ?? [];
  return {
    name: `${room.name} · unmarked`,
    altar: room.altar,
    enemies: packs.flatMap((pack) =>
      pack.kinds.map((kind) => ({
        kind,
        count: Math.max(1, Math.round((pack.count[0] + Math.floor(rng() * 2)) / pack.kinds.length)),
        x: room.x,
        z: room.z,
        spread: Math.max(2, Math.min(room.w, room.h) / 3),
      })),
    ),
  };
}

/** The room a point is nearest to, measured to its edge rather than its centre. */
export function nearestRoom(layout: Layout, at: Vec) {
  let best = layout.rooms[0],
    bestGap = Infinity;
  for (const room of layout.rooms) {
    const gap = Math.hypot(
      Math.max(0, Math.abs(at.x - room.x) - room.w / 2),
      Math.max(0, Math.abs(at.z - room.z) - room.h / 2),
    );
    if (gap < bestGap) {
      bestGap = gap;
      best = room;
    }
  }
  return best;
}
/**
 * A distance field over an instance, flooded out from one point.
 *
 * A layout is a union of rectangles, so the way from anywhere to anywhere is a walk downhill
 * on a one-unit grid. Anything that has to cross an instance without seeing through walls —
 * the compass inside a dungeon, the balance and expedition checks — steps along this.
 */
export interface Flow {
  step: (from: Vec) => Vec;
  reachable: (from: Vec) => boolean;
}
const CELL = 1;
export function flowTo(layout: Layout, to: Vec): Flow {
  const minX = Math.floor(layout.bounds.minX) - 2,
    minZ = Math.floor(layout.bounds.minZ) - 2;
  const w = Math.ceil(layout.bounds.maxX - layout.bounds.minX) + 5,
    h = Math.ceil(layout.bounds.maxZ - layout.bounds.minZ) + 5;
  const index = (cx: number, cz: number) => cz * w + cx;
  const open = new Uint8Array(w * h),
    dist = new Int32Array(w * h).fill(-1);
  for (let cz = 0; cz < h; cz++)
    for (let cx = 0; cx < w; cx++)
      open[index(cx, cz)] = insideLayout(layout, minX + cx * CELL, minZ + cz * CELL) ? 1 : 0;
  const start = {
    x: Math.round((to.x - minX) / CELL),
    z: Math.round((to.z - minZ) / CELL),
  };
  const queue: number[] = [];
  if (start.x >= 0 && start.x < w && start.z >= 0 && start.z < h) {
    const at = index(start.x, start.z);
    dist[at] = 0;
    open[at] = 1;
    queue.push(at);
  }
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head],
      cx = at % w,
      cz = (at / w) | 0;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cx + dx,
        nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const next = index(nx, nz);
      if (!open[next] || dist[next] >= 0) continue;
      dist[next] = dist[at] + 1;
      queue.push(next);
    }
  }
  const cellOf = (from: Vec) => ({
    x: Math.round((from.x - minX) / CELL),
    z: Math.round((from.z - minZ) / CELL),
  });
  const valueAt = (cx: number, cz: number) =>
    cx < 0 || cz < 0 || cx >= w || cz >= h ? -1 : dist[index(cx, cz)];
  return {
    reachable: (from) => {
      const c = cellOf(from);
      return valueAt(c.x, c.z) >= 0;
    },
    step: (from) => {
      const c = cellOf(from);
      let best = valueAt(c.x, c.z),
        pick = to;
      if (best <= 0) return to;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ] as const) {
        const value = valueAt(c.x + dx, c.z + dz);
        if (value >= 0 && value < best) {
          best = value;
          // Aim two cells along the descent so the walker keeps moving instead of stepping.
          pick = { x: from.x + dx * CELL * 2.5, z: from.z + dz * CELL * 2.5 };
        }
      }
      return pick;
    },
  };
}
