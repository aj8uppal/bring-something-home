import type { Dimension, DungeonId, Vec } from './types.js';

/**
 * Every named area in the realm, overworld or otherwise, in one table.
 *
 * This is the contract the information layer reads: the map, the atlas, the fog and
 * ground tint, the objective board, and the threat plates all derive from `PLACES` and
 * never from a hardcoded list. Adding a biome is adding a row.
 */
export interface Place {
  id: string;
  name: string;
  subtitle: string;
  x: number;
  z: number;
  radius: number;
  /** 0 sanctuary, 1..n. Also the loot tier the area drops. */
  tier: number;
  /** Recommended level band, inclusive. */
  levels: [number, number];
  /** Map, fog, and ground tint. */
  color: string;
  kind: 'sanctuary' | 'wild' | 'dungeon' | 'setpiece';
  /** One line of counterplay, shown on entry and in the atlas. */
  lesson?: string;
  /** The biome an inner area belongs to. */
  parent?: string;
  /** Signature creature, for guidance that names what lives here. */
  creature?: string;
  /** Human bearing from the Hearth, for prose that avoids coordinates. */
  direction?: string;
  /** Where the hunting is, when that is not the centre of the area. */
  hunt?: Vec;
  /** The dimension this place opens, for dungeon entries. */
  dimension?: DungeonId;
}

export const PLACES: Place[] = [
  {
    id: 'haven',
    name: 'The Last Hearth',
    subtitle: 'A little light, held against the dark.',
    x: 0,
    z: 20,
    radius: 14,
    tier: 0,
    levels: [1, 20],
    color: '#d7c99d',
    kind: 'sanctuary',
    direction: 'The centre of everything',
  },
  {
    id: 'meadow',
    name: 'Cindermeadow',
    subtitle: 'Even in the ashes, something grows.',
    x: 0,
    z: -4,
    radius: 25,
    tier: 1,
    levels: [1, 4],
    color: '#98aa76',
    kind: 'wild',
    creature: 'cinderling',
    direction: 'North of the Hearth',
    hunt: { x: -8, z: -12 },
    lesson: 'Cinderlings aim at where you stand. Move sideways after they wind up.',
  },
  {
    id: 'grove',
    name: 'The Hollow Grove',
    subtitle: 'The trees remember every name.',
    x: -43,
    z: -20,
    radius: 27,
    tier: 2,
    levels: [5, 9],
    color: '#6c9693',
    kind: 'wild',
    creature: 'wisp',
    direction: 'West of Cindermeadow',
    hunt: { x: -37, z: -16 },
    lesson: 'Wisps release rotating volleys. Circle them and leave room to retreat.',
  },
  {
    id: 'glass',
    name: 'The Glasswaste',
    subtitle: 'A thousand suns sleep beneath the sand.',
    x: 42,
    z: -22,
    radius: 29,
    tier: 3,
    levels: [10, 14],
    color: '#d3a06e',
    kind: 'wild',
    creature: 'scarab',
    direction: 'East of Cindermeadow',
    hunt: { x: 35, z: -18 },
    lesson: 'Scarabs fire fans. Step between lanes; dodge when the gap closes.',
  },
  {
    id: 'crown',
    name: 'Crown of Ash',
    subtitle: 'All fires return to their beginning.',
    x: 0,
    z: -62,
    radius: 25,
    tier: 4,
    levels: [15, 20],
    color: '#a794b0',
    kind: 'wild',
    creature: 'watcher',
    direction: 'Far north, beyond the Dusk Herald',
    hunt: { x: 0, z: -57 },
    lesson: 'Watchers release rings. Stay at range and cross a gap before the next ring.',
  },
  {
    id: 'wandering-star',
    name: 'The Wandering Star',
    subtitle: 'A fallen light, and the things that came for it.',
    x: 18,
    z: -12,
    radius: 10,
    tier: 2,
    levels: [3, 8],
    color: '#edc177',
    kind: 'setpiece',
    parent: 'meadow',
    direction: 'East of Cindermeadow',
    lesson: 'Guardians arrive in waves. Clear the ring before the next one lands.',
  },
  {
    id: 'eclipse',
    name: 'The Elder Convergence',
    subtitle: 'Three elders at the edge of creation. Break the Crown to awaken this portal.',
    x: 0,
    z: 34,
    radius: 6,
    tier: 6,
    levels: [20, 20],
    color: '#c6a4ff',
    kind: 'dungeon',
    dimension: 'eclipse',
    direction: 'South of the Hearth',
    lesson: 'Elders telegraph floor hazards. Read the disc, then leave before it closes.',
  },
  {
    id: 'hollow',
    name: 'The Sunken Archive',
    subtitle: 'A drowned library. Its keeper still tends the shelves.',
    x: -32,
    z: 25,
    radius: 6,
    tier: 3,
    levels: [5, 9],
    color: '#8fd8d2',
    kind: 'dungeon',
    dimension: 'hollow',
    direction: 'West of the Hearth',
    lesson: 'The Archivist spirals. Orbit against the spin and the gaps line up.',
  },
  {
    id: 'crucible',
    name: 'The Ember Crucible',
    subtitle: 'The forge that lit the first sun has never cooled.',
    x: 42,
    z: 12,
    radius: 6,
    tier: 4,
    levels: [10, 14],
    color: '#eda576',
    kind: 'dungeon',
    dimension: 'crucible',
    direction: 'East of the Hearth',
    lesson: 'The Forgemother bursts in threes. Move on the third, not the first.',
  },
];

/** The two roads out of the Hearth, as drawn in the world and on every map. */
export const ROADS: [Vec, Vec][] = [
  [
    { x: 0, z: -78 },
    { x: 0, z: 36 },
  ],
  [
    { x: -44, z: 20 },
    { x: 45, z: 20 },
  ],
];

export const PLACE_BY_ID = new Map(PLACES.map((p) => [p.id, p]));
export const placeById = (id: string | undefined) => (id ? PLACE_BY_ID.get(id) : undefined);

/** Overworld areas in progression order: the sanctuary, then the wilds. */
export const OVERWORLD = PLACES.filter((p) => p.kind === 'sanctuary' || p.kind === 'wild');
/** Huntable wilds in progression order. Index n is tier n+1. */
export const WILDS = PLACES.filter((p) => p.kind === 'wild');
export const DUNGEON_PLACES = PLACES.filter((p) => p.kind === 'dungeon');
export const SETPIECES = PLACES.filter((p) => p.kind === 'setpiece');
/** Where the realm's roaming event lands. */
export const WANDERING_STAR = PLACE_BY_ID.get('wandering-star')!;

/** The place a point falls in. A dungeon dimension is itself a place. */
export function placeAt(x: number, z: number, dimension: Dimension = 'wilds'): Place {
  if (dimension !== 'wilds') return PLACES.find((p) => p.dimension === dimension) ?? OVERWORLD[1];
  return OVERWORLD.find((p) => Math.hypot(x - p.x, z - p.z) < p.radius) ?? OVERWORLD[1];
}

/** How a place's band reads against a level: safe, even, or dangerous. */
export type ThreatBand = 'safe' | 'even' | 'hard' | 'deadly';
export function threatOf(level: number, place: Pick<Place, 'levels' | 'kind'>): ThreatBand {
  if (place.kind === 'sanctuary') return 'safe';
  const [low] = place.levels;
  const gap = low - level;
  return gap >= 3 ? 'deadly' : gap >= 1 ? 'hard' : level > place.levels[1] ? 'safe' : 'even';
}
/** The same reading for a single creature tier, used by enemy name plates. */
export function threatOfTier(level: number, tier: number, boss = false): ThreatBand {
  const low = Math.max(1, tier * 5 - 4) + (boss ? 3 : 0);
  const gap = low - level;
  return gap >= 3 ? 'deadly' : gap >= 1 ? 'hard' : level >= low + 5 ? 'safe' : 'even';
}
export const THREAT_COLORS: Record<ThreatBand, string> = {
  safe: '#a8c69a',
  even: '#e2cf9a',
  hard: '#eab27e',
  deadly: '#e88c76',
};
