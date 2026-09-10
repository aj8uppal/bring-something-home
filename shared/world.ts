import { HAVEN, LANDMARKS, distance, ZONES } from './content.js';
import {
  GATE_RING_RADIUS,
  ISLAND,
  PLACE_BY_ID,
  RING_RADIUS,
  ROADS,
  SETPIECE_SLOTS,
  SHORTCUTS,
  WILDS_RADIUS,
  biomeAt,
  BIOME_BEARINGS,
  type BiomeId,
} from './places.js';
import { BIOMES, BIOME_LIST, ECOLOGY, biomeHeight, type PropKind } from './biomes.js';
import type { Dimension, Vec } from './types.js';
export { ISLAND, WILDS_RADIUS } from './places.js';
export function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** The island's original ground, unchanged. Everything inside radius 86 still reads this. */
const islandHeight = (x: number, z: number) =>
  Math.sin(x * 0.09) * Math.cos(z * 0.07) * 0.42 + Math.sin(z * 0.2) * 0.12;
/** How wide the seam between the island and the ring is. Long enough to walk down. */
const SEAM = 22;
export function groundHeight(x: number, z: number, dimension: Dimension = 'wilds') {
  if (dimension !== 'wilds') return 0;
  const base = islandHeight(x, z),
    r = Math.hypot(x - ISLAND.x, z - ISLAND.z);
  if (r <= ISLAND.radius) return base;
  const t = Math.min(1, (r - ISLAND.radius) / SEAM);
  return base * (1 - t) + biomeHeight(BIOMES[biomeAt(x, z).id as BiomeId], x, z) * t;
}
export function inBounds(x: number, z: number, dimension: Dimension = 'wilds') {
  return dimension === 'wilds'
    ? Math.hypot(x - ISLAND.x, z - ISLAND.z) < WILDS_RADIUS
    : Math.abs(x) < 29 && Math.abs(z) < 29;
}
export interface Prop extends Vec {
  kind: PropKind;
  scale: number;
  rotation: number;
  color: string;
  radius: number;
  /** Signposts carry a short label rendered in the world and never on the map. */
  label?: string;
}
// Open fighting grounds leave room to read storms with a tilted camera. Tall scenery
// stays around their edges and obeys ordinary depth, just like creatures and shots.
export const COMBAT_CLEARINGS = [
  { x: 0, z: 3, radius: 6 },
  { x: -10, z: -12, radius: 12 },
  { x: 12, z: -15, radius: 10 },
  { x: -9, z: -22, radius: 8 },
  { x: -43, z: -20, radius: 16 },
  { x: 42, z: -25, radius: 16 },
  { x: 0, z: -35, radius: 13 },
  { x: 0, z: -66, radius: 17 },
];
/** Wooden signs at the three road forks out of the Hearth. Short words, real difficulty. */
export const SIGNPOSTS = [
  { x: -12.5, z: 17.6, rotation: Math.PI / 2, label: 'Grove · LV 5' },
  { x: 12.5, z: 17.6, rotation: -Math.PI / 2, label: 'Glasswaste · LV 10' },
  { x: 3.4, z: 8.6, rotation: 0, label: 'Crown · LV 15' },
] as const;
/** Every pack anchor beyond the island is open ground, so a mixed pack has room to be read. */
export const OUTER_CLEARINGS = ECOLOGY.filter((e) => BIOMES[e.place as BiomeId]).flatMap((e) =>
  e.anchors.map((a) => ({ ...a, radius: 10 })),
);
/** How far a road stays clear of scenery, and how close a prop may come to a landmark. */
const ROAD_CLEARANCE = 3.4;
function nearRoad(x: number, z: number, clearance = ROAD_CLEARANCE, roads = ROADS) {
  for (const [a, b] of roads) {
    const dx = b.x - a.x,
      dz = b.z - a.z,
      len = dx * dx + dz * dz;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len));
    if (Math.hypot(x - a.x - t * dx, z - a.z - t * dz) < clearance) return true;
  }
  return false;
}
/** The one road that crosses ground the island already generated: the inner ring the spokes
 * leave from. Island scenery is never moved, only cleared where the new road now runs. */
const GATE_RING = ROADS.filter(
  ([a, b]) =>
    Math.abs(Math.hypot(a.x - ISLAND.x, a.z - ISLAND.z) - GATE_RING_RADIUS) < 0.5 &&
    Math.abs(Math.hypot(b.x - ISLAND.x, b.z - ISLAND.z) - GATE_RING_RADIUS) < 0.5,
);
const propRadius = (kind: PropKind, scale: number) =>
  kind === 'tree'
    ? 0.6 * scale
    : kind === 'rock'
      ? 0.65 * scale
      : kind === 'ruin'
        ? 0.65
        : kind === 'crystal'
          ? 0.38 * scale
          : kind === 'water'
            ? Math.min(2.6, 1.5 * scale)
            : kind === 'wall'
              ? Math.min(2.4, 1.2 * scale)
              : 0;
/** A sign faces the way its reader arrives from. */
const facing = (degrees: number) => Math.PI / 2 - (degrees * Math.PI) / 180;
export function makeProps(): Prop[] {
  const rng = random(739144);
  const props: Prop[] = [];
  const island: Prop[] = [];
  // The island, generated exactly as it always has been, from its own untouched stream.
  for (let i = 0; i < 1300; i++) {
    const x = (rng() - 0.5) * 171,
      z = (rng() - 0.5) * 171 - 8;
    if (
      Math.hypot(x - ISLAND.x, z - ISLAND.z) >= ISLAND.radius ||
      distance({ x, z }, HAVEN) < 14 ||
      LANDMARKS.some((l) => distance({ x, z }, l) < 6)
    )
      continue;
    if (
      Math.abs(x) < 3.5 ||
      Math.abs(z - 20) < 3.2 ||
      ZONES.slice(2).some((q) => distance({ x, z }, q) < 6)
    )
      continue;
    const r = rng();
    const zone = x < -24 ? 'grove' : x > 24 ? 'glass' : z < -42 ? 'crown' : 'meadow';
    const clearing = COMBAT_CLEARINGS.some((a) => distance({ x, z }, a) < a.radius);
    const kind: PropKind = clearing
      ? 'grass'
      : r < 0.2
        ? zone === 'glass' || zone === 'crown'
          ? 'crystal'
          : 'tree'
        : r < 0.36
          ? 'rock'
          : r < 0.4
            ? 'ruin'
            : 'grass';
    const scale = 0.65 + rng() * 1.4;
    island.push({
      x,
      z,
      kind,
      scale,
      rotation: rng() * Math.PI * 2,
      color:
        zone === 'grove'
          ? '#71948e'
          : zone === 'glass'
            ? '#c1ab82'
            : zone === 'crown'
              ? '#898393'
              : '#91a36b',
      radius: propRadius(kind, scale),
    });
  }
  props.push(...island.filter((p) => !nearRoad(p.x, p.z, ROAD_CLEARANCE, GATE_RING)));
  // The outer ring, budgeted by density per biome so tripling the area does not triple
  // the scenery. Each biome draws from its own stream, so editing one never moves another.
  const sector = (Math.PI * (WILDS_RADIUS ** 2 - ISLAND.radius ** 2)) / BIOME_LIST.length;
  for (const biome of BIOME_LIST) {
    const place = PLACE_BY_ID.get(biome.id)!;
    const bearing = BIOME_BEARINGS[biome.id],
      half = 180 / BIOME_LIST.length;
    const target = Math.round((biome.scenery.density * sector) / 100);
    const brng = random(11000 + biome.id.length * 977 + Math.round(bearing * 13));
    const weight = biome.scenery.mix.reduce((n, m) => n + m.weight, 0);
    for (let made = 0, attempt = 0; made < target && attempt < target * 10; attempt++) {
      const degrees = bearing + (brng() - 0.5) * 2 * half;
      const radius = Math.sqrt(
        ISLAND.radius ** 2 + brng() * (WILDS_RADIUS ** 2 - ISLAND.radius ** 2),
      );
      const x = ISLAND.x + Math.cos((degrees * Math.PI) / 180) * radius,
        z = ISLAND.z + Math.sin((degrees * Math.PI) / 180) * radius;
      if (radius > WILDS_RADIUS - 2.5) continue;
      if (nearRoad(x, z)) continue;
      if (SETPIECE_SLOTS.some((s) => distance({ x, z }, s) < s.radius)) continue;
      const clearing = OUTER_CLEARINGS.some((a) => distance({ x, z }, a) < a.radius);
      if (SHORTCUTS.some((s) => distance({ x, z }, s.from) < 5 || distance({ x, z }, s.to) < 5))
        continue;
      let roll = brng() * weight,
        kind: PropKind = biome.scenery.mix[0].kind;
      for (const m of biome.scenery.mix) {
        roll -= m.weight;
        if (roll <= 0) {
          kind = m.kind;
          break;
        }
      }
      // A pack's ground stays open: only grass grows where the fighting happens.
      if (clearing) kind = 'grass';
      const [low, high] = biome.scenery.scale,
        scale = low + brng() * (high - low);
      props.push({
        x,
        z,
        kind,
        scale,
        rotation: brng() * Math.PI * 2,
        color: biome.scenery.colors[Math.floor(brng() * biome.scenery.colors.length)],
        radius: propRadius(kind, scale),
      });
      made++;
    }
    // Every biome names itself twice: once where its spoke leaves the island, once at its heart.
    const short = place.name.replace(/^The /, '');
    props.push({
      ...beside(bearing, GATE_RING_RADIUS - 5, 3.2),
      kind: 'signpost',
      scale: 1,
      rotation: facing(bearing + 180),
      color: '#c9b98f',
      radius: 0.3,
      label: `${short} · LV ${place.levels[0]}`,
    });
    props.push({
      ...beside(bearing, RING_RADIUS - 5, 3.2),
      kind: 'signpost',
      scale: 1,
      rotation: facing(bearing + 180),
      color: '#c9b98f',
      radius: 0.3,
      label: `${short} · LV ${place.levels[0]}–${place.levels[1]}`,
    });
  }
  for (const sign of SIGNPOSTS)
    props.push({
      x: sign.x,
      z: sign.z,
      kind: 'signpost',
      scale: 1,
      rotation: sign.rotation,
      color: '#c9b98f',
      radius: 0.3,
      label: sign.label,
    });
  return props;
}
/** A point beside the spoke at that radius, clear of both the spoke and the ring road. */
function beside(degrees: number, radius: number, offset: number): Vec {
  const a = (degrees * Math.PI) / 180;
  return {
    x: ISLAND.x + Math.cos(a) * radius - Math.sin(a) * offset,
    z: ISLAND.z + Math.sin(a) * radius + Math.cos(a) * offset,
  };
}
export function pointOn(degrees: number, radius: number): Vec {
  return {
    x: ISLAND.x + Math.cos((degrees * Math.PI) / 180) * radius,
    z: ISLAND.z + Math.sin((degrees * Math.PI) / 180) * radius,
  };
}
export const PROPS = makeProps();
const cells = new Map<string, Prop[]>();
for (const prop of PROPS) {
  if (!prop.radius) continue;
  const k = `${Math.floor(prop.x / 4)},${Math.floor(prop.z / 4)}`;
  if (!cells.has(k)) cells.set(k, []);
  cells.get(k)!.push(prop);
}
/** Props overlapping a world-space box, by 4-unit cell. The minimap draws only what it can see. */
export function propsInBox(minX: number, minZ: number, maxX: number, maxZ: number) {
  const found: Prop[] = [];
  for (let cx = Math.floor(minX / 4); cx <= Math.floor(maxX / 4); cx++)
    for (let cz = Math.floor(minZ / 4); cz <= Math.floor(maxZ / 4); cz++)
      for (const p of cells.get(`${cx},${cz}`) ?? [])
        if (p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ) found.push(p);
  return found;
}
export function canMove(x: number, z: number, dimension: Dimension) {
  if (!inBounds(x, z, dimension)) return false;
  if (dimension !== 'wilds') return true;
  // The four Hearth columns are solid scenery, including during a predicted dash.
  for (const px of [-9, 9])
    for (const pz of [15, 25]) if (Math.hypot(x - px, z - pz) < 1.04) return false;
  const cx = Math.floor(x / 4),
    cz = Math.floor(z / 4);
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++)
      for (const p of cells.get(`${cx + a},${cz + b}`) ?? [])
        if (Math.hypot(x - p.x, z - p.z) < p.radius + 0.38) return false;
  return true;
}
export function move(p: Vec, dx: number, dz: number, dim: Dimension) {
  // Substeps keep dashes from tunneling through narrow trees and pillars.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.25));
  for (let i = 0; i < steps; i++) slide(p, dx / steps, dz / steps, dim);
}
function slide(p: Vec, dx: number, dz: number, dim: Dimension) {
  if (canMove(p.x + dx, p.z + dz, dim)) {
    p.x += dx;
    p.z += dz;
  } else {
    if (canMove(p.x + dx, p.z, dim)) p.x += dx;
    if (canMove(p.x, p.z + dz, dim)) p.z += dz;
  }
}
/** The pass a point is standing in the mouth of, if any. One-way, outer ring to island. */
export function shortcutAt(x: number, z: number) {
  return SHORTCUTS.find((s) => Math.hypot(x - s.from.x, z - s.from.z) < s.radius);
}
