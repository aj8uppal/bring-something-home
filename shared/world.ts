import { HAVEN, LANDMARKS, distance, ZONES } from './content.js';
import type { Dimension, Vec } from './types.js';
export function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function groundHeight(x: number, z: number, dimension: Dimension = 'wilds') {
  return dimension === 'wilds'
    ? Math.sin(x * 0.09) * Math.cos(z * 0.07) * 0.42 + Math.sin(z * 0.2) * 0.12
    : 0;
}
/** The island the overworld sits on. Maps fit to this. */
export const ISLAND = { x: 0, z: -8, radius: 86 };
export function inBounds(x: number, z: number, dimension: Dimension = 'wilds') {
  return dimension === 'wilds'
    ? Math.hypot(x - ISLAND.x, z - ISLAND.z) < ISLAND.radius
    : Math.abs(x) < 29 && Math.abs(z) < 29;
}
export interface Prop extends Vec {
  kind: 'tree' | 'rock' | 'grass' | 'ruin' | 'crystal' | 'signpost';
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
export function makeProps(): Prop[] {
  const rng = random(739144);
  const props: Prop[] = [];
  for (let i = 0; i < 1300; i++) {
    const x = (rng() - 0.5) * 171,
      z = (rng() - 0.5) * 171 - 8;
    if (
      !inBounds(x, z) ||
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
    const kind = clearing
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
    props.push({
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
      radius:
        kind === 'tree'
          ? 0.6 * scale
          : kind === 'rock'
            ? 0.65 * scale
            : kind === 'ruin'
              ? 0.65
              : kind === 'crystal'
                ? 0.38 * scale
                : 0,
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
