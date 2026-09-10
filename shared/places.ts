import type { Dimension, DungeonId, Vec } from './types.js';

/**
 * The realm is one disc. The inner island is the level 1-20 story track and is unchanged
 * since the beginning; the outer ring holds the seven biomes of the long game.
 *
 * Every radius here is measured from the island centre, so old coordinates never move.
 */
export const ISLAND = { x: 0, z: -8, radius: 86 };
/** The whole wilds. Roughly thirty seconds to cross at base speed. */
export const WILDS_RADIUS = 150;
/** The ring road, and every outer biome centre, sit on this radius. */
export const RING_RADIUS = 116;
/** Where the seven spokes leave the island, and where the inner ring road runs. */
export const GATE_RING_RADIUS = 80;
const ring = (degrees: number, radius = RING_RADIUS) => ({
  x: Math.round((ISLAND.x + Math.cos((degrees * Math.PI) / 180) * radius) * 10) / 10,
  z: Math.round((ISLAND.z + Math.sin((degrees * Math.PI) / 180) * radius) * 10) / 10,
});
/** The seven outer biomes, by bearing. Two ladders rise from the Hearth side and meet
 * at the Ashfall behind the Crown, so a player mid-band always has a choice of three. */
export const BIOME_BEARINGS = {
  coast: 115.714,
  orchard: 64.286,
  saltflat: 167.143,
  observatory: 12.857,
  marsh: 218.571,
  glacier: 321.429,
  ashfall: 270,
} as const;
export type BiomeId = keyof typeof BIOME_BEARINGS;

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
  {
    id: 'coast',
    name: 'The Drowned Coast',
    subtitle: 'The sea came inland and never went home.',
    x: -50.3,
    z: 96.5,
    radius: 52,
    tier: 5,
    levels: [15, 19],
    color: '#7fa8a6',
    kind: 'wild',
    creature: 'brineclaw',
    direction: 'South-west, past the island shore',
    hunt: { x: -46, z: 90 },
    lesson: 'Tidal shots are slow and wide. Walk the gaps; never stand still in the shallows.',
  },
  {
    id: 'orchard',
    name: 'The Petrified Orchard',
    subtitle: 'Stone trees in rows, planted by nobody living.',
    x: 50.3,
    z: 96.5,
    radius: 52,
    tier: 5,
    levels: [18, 22],
    color: '#8e8a6e',
    kind: 'wild',
    creature: 'stonebark',
    direction: 'South-east, past the island shore',
    hunt: { x: 46, z: 90 },
    lesson: 'Stonebarks block their own front. Flank them, and watch the rows for ambushes.',
  },
  {
    id: 'saltflat',
    name: 'The Salt Flat',
    subtitle: 'Nothing grows, and nothing hides.',
    x: -113.1,
    z: 17.8,
    radius: 52,
    tier: 6,
    levels: [21, 25],
    color: '#d8cdb0',
    kind: 'wild',
    creature: 'saltstrider',
    direction: 'Due west, beyond the Grove',
    hunt: { x: -108, z: 12 },
    lesson: 'Striders retreat to hold range. Close the distance or you fight at their pace.',
  },
  {
    id: 'observatory',
    name: 'The Shattered Observatory',
    subtitle: 'Broken rings that once counted the stars.',
    x: 113.1,
    z: 17.8,
    radius: 52,
    tier: 6,
    levels: [24, 28],
    color: '#9aa6c4',
    kind: 'wild',
    creature: 'orrery',
    direction: 'Due east, beyond the Glasswaste',
    hunt: { x: 108, z: 12 },
    lesson: 'Orreries feed the pack. Kill the lit one first and everything else slows down.',
  },
  {
    id: 'marsh',
    name: 'The Bone Marsh',
    subtitle: 'The fog keeps what the water takes.',
    x: -90.7,
    z: -80.3,
    radius: 52,
    tier: 7,
    levels: [27, 31],
    color: '#6d7f6a',
    kind: 'wild',
    creature: 'bogfiend',
    direction: 'North-west, past the Grove',
    hunt: { x: -86, z: -76 },
    lesson: 'You will hear them before you see them. Keep your back to open ground.',
  },
  {
    id: 'glacier',
    name: 'The Glacier of Fused Glass',
    subtitle: 'A wave of sand caught mid-fall and frozen.',
    x: 90.7,
    z: -80.3,
    radius: 52,
    tier: 7,
    levels: [30, 34],
    color: '#a9d3dd',
    kind: 'wild',
    creature: 'glasshound',
    direction: 'North-east, past the Glasswaste',
    hunt: { x: 86, z: -76 },
    lesson: 'Shots skip off the glass. Assume every lane has a second pass coming back.',
  },
  {
    id: 'ashfall',
    name: 'The Ashfall',
    subtitle: 'The storm the Crown has been holding back.',
    x: 0,
    z: -124,
    radius: 52,
    tier: 8,
    levels: [33, 40],
    color: '#c08a6d',
    kind: 'wild',
    creature: 'ashanchor',
    direction: 'Far north, on the Crown’s far side',
    hunt: { x: 0, z: -118 },
    lesson: 'The ash burns where it lands. Read the floor first, the bullets second.',
  },
  {
    id: 'weeping-steps',
    name: 'The Weeping Steps',
    subtitle: 'A stair into water that goes down further than the coast is deep.',
    x: -76.3,
    z: 82.5,
    radius: 13,
    tier: 5,
    levels: [15, 19],
    color: '#8fc4c0',
    kind: 'setpiece',
    parent: 'coast',
    direction: 'The western shoulder of the Drowned Coast',
  },
  {
    id: 'drowned-bell',
    name: 'The Drowned Bell',
    subtitle: 'It still rings, once, whenever someone comes close.',
    x: -24,
    z: 108,
    radius: 13,
    tier: 5,
    levels: [15, 19],
    color: '#8fc4c0',
    kind: 'setpiece',
    parent: 'coast',
    direction: 'The inner edge of the Drowned Coast',
  },
  {
    id: 'stone-nursery',
    name: 'The Stone Nursery',
    subtitle: 'Saplings, mid-growth, turned to rock in a single afternoon.',
    x: 76.3,
    z: 82.5,
    radius: 13,
    tier: 5,
    levels: [18, 22],
    color: '#a39c7c',
    kind: 'setpiece',
    parent: 'orchard',
    direction: 'The eastern shoulder of the Petrified Orchard',
  },
  {
    id: 'orchard-gate',
    name: 'The Orchard Gate',
    subtitle: 'Someone kept the gate long after the orchard stopped needing one.',
    x: 24,
    z: 108,
    radius: 13,
    tier: 5,
    levels: [18, 22],
    color: '#a39c7c',
    kind: 'setpiece',
    parent: 'orchard',
    direction: 'The inner edge of the Petrified Orchard',
  },
  {
    id: 'salt-caravan',
    name: 'The Salt Caravan',
    subtitle: 'Twelve wagons, still in line, still pointed home.',
    x: -118,
    z: -12,
    radius: 13,
    tier: 6,
    levels: [21, 25],
    color: '#e4dabe',
    kind: 'setpiece',
    parent: 'saltflat',
    direction: 'The northern reach of the Salt Flat',
  },
  {
    id: 'pillar-of-thirst',
    name: 'The Pillar of Thirst',
    subtitle: 'A well the size of a tower, and no water in it.',
    x: -100,
    z: 46,
    radius: 13,
    tier: 6,
    levels: [21, 25],
    color: '#e4dabe',
    kind: 'setpiece',
    parent: 'saltflat',
    direction: 'The southern reach of the Salt Flat',
  },
  {
    id: 'fallen-ring',
    name: 'The Fallen Ring',
    subtitle: 'One arc of the great orrery, driven into the ground on its edge.',
    x: 118,
    z: -12,
    radius: 13,
    tier: 6,
    levels: [24, 28],
    color: '#b3bedb',
    kind: 'setpiece',
    parent: 'observatory',
    direction: 'The northern reach of the Shattered Observatory',
  },
  {
    id: 'star-chart',
    name: 'The Star Chart',
    subtitle: 'A floor of inlaid brass that still knows where everything is.',
    x: 100,
    z: 46,
    radius: 13,
    tier: 6,
    levels: [24, 28],
    color: '#b3bedb',
    kind: 'setpiece',
    parent: 'observatory',
    direction: 'The southern reach of the Shattered Observatory',
  },
  {
    id: 'marrow-nest',
    name: 'The Marrow Nest',
    subtitle: 'Something has been building here, patiently, for a long time.',
    x: -108,
    z: -50,
    radius: 13,
    tier: 7,
    levels: [27, 31],
    color: '#849a80',
    kind: 'setpiece',
    parent: 'marsh',
    direction: 'The southern edge of the Bone Marsh',
  },
  {
    id: 'lantern-walk',
    name: 'The Lantern Walk',
    subtitle: 'Nine posts, and whoever lit them is not coming back.',
    x: -66,
    z: -100,
    radius: 13,
    tier: 7,
    levels: [27, 31],
    color: '#849a80',
    kind: 'setpiece',
    parent: 'marsh',
    direction: 'The northern edge of the Bone Marsh',
  },
  {
    id: 'frozen-choir',
    name: 'The Frozen Choir',
    subtitle: 'Glass figures mid-song, facing a stage that is not there.',
    x: 108,
    z: -50,
    radius: 13,
    tier: 7,
    levels: [30, 34],
    color: '#bde2ea',
    kind: 'setpiece',
    parent: 'glacier',
    direction: 'The southern edge of the Glacier',
  },
  {
    id: 'ashen-forge',
    name: 'The Ashen Forge',
    subtitle: 'The Crown’s own smithy, buried and still warm.',
    x: -24,
    z: -132,
    radius: 13,
    tier: 8,
    levels: [33, 40],
    color: '#d3a184',
    kind: 'setpiece',
    parent: 'ashfall',
    direction: 'The western Ashfall',
  },
];

const arc = (radius: number, steps: number): [Vec, Vec][] =>
  Array.from({ length: steps }, (_, i) => [
    ring((i / steps) * 360, radius),
    ring(((i + 1) / steps) * 360, radius),
  ]);
/**
 * Every road in the realm, as segments. The world, the minimap, and the atlas all draw
 * this one table, and `makeProps()` keeps scenery off it, so a new road is a new row.
 *
 * The two original Hearth roads reach out to an inner ring; seven spokes carry that ring
 * to the ring road, which passes through the centre of all seven outer biomes.
 */
export const ROADS: [Vec, Vec][] = [
  [
    { x: 0, z: -88 },
    { x: 0, z: 72 },
  ],
  [
    { x: -75, z: 20 },
    { x: 75, z: 20 },
  ],
  ...arc(GATE_RING_RADIUS, 40),
  ...arc(RING_RADIUS, 56),
  ...(Object.values(BIOME_BEARINGS).map((d) => [
    ring(d, GATE_RING_RADIUS),
    ring(d, RING_RADIUS),
  ]) as [Vec, Vec][]),
];

/**
 * One-way passes back toward the Hearth. Stepping into the mouth of one drops you at its
 * foot on the island side, so the walk home from the far ring is shorter than the walk out.
 */
export const SHORTCUTS: { id: string; name: string; from: Vec; to: Vec; radius: number }[] = [
  {
    id: 'tide-race',
    name: 'The Tide Race',
    from: ring(BIOME_BEARINGS.coast, 96),
    to: ring(BIOME_BEARINGS.coast, 70),
    radius: 2.6,
  },
  {
    id: 'sunken-culvert',
    name: 'The Sunken Culvert',
    from: ring(BIOME_BEARINGS.marsh, 96),
    to: ring(BIOME_BEARINGS.marsh, 68),
    radius: 2.6,
  },
  {
    id: 'ash-chute',
    name: 'The Ash Chute',
    from: ring(BIOME_BEARINGS.ashfall, 96),
    to: { x: 0, z: -74 },
    radius: 2.6,
  },
];

export const PLACE_BY_ID = new Map(PLACES.map((p) => [p.id, p]));
export const placeById = (id: string | undefined) => (id ? PLACE_BY_ID.get(id) : undefined);

/** Overworld areas in progression order: the sanctuary, then the wilds. */
export const OVERWORLD = PLACES.filter((p) => p.kind === 'sanctuary' || p.kind === 'wild');
/** Huntable wilds in progression order. The first four are the island's original zones,
 * whose index still equals `tier - 1`; the seven outer biomes follow, ring order. */
export const WILDS = PLACES.filter((p) => p.kind === 'wild');
/** The seven outer biomes, in the order they sit around the ring road. */
const RING_ORDER: BiomeId[] = [
  'observatory',
  'orchard',
  'coast',
  'saltflat',
  'marsh',
  'ashfall',
  'glacier',
];
export const BIOME_PLACES = RING_ORDER.map((id) => PLACE_BY_ID.get(id)!);
const ISLAND_PLACES = OVERWORLD.filter((p) => !BIOME_PLACES.includes(p));
export const DUNGEON_PLACES = PLACES.filter((p) => p.kind === 'dungeon');
export const SETPIECES = PLACES.filter((p) => p.kind === 'setpiece');
/** The twelve outer setpiece anchors. Which encounter occupies each is the realm's choice. */
export const SETPIECE_SLOTS = SETPIECES.filter((p) => p.parent && p.parent !== 'meadow');
/** Where the realm's roaming event lands. */
export const WANDERING_STAR = PLACE_BY_ID.get('wandering-star')!;

/** The place a point falls in. A dungeon dimension is itself a place.
 *
 * The island resolves exactly as it always has. Beyond it the seven biomes tile the whole
 * ring by nearest centre, so no square of the outer world belongs to nobody. */
export function placeAt(x: number, z: number, dimension: Dimension = 'wilds'): Place {
  if (dimension !== 'wilds') return PLACES.find((p) => p.dimension === dimension) ?? OVERWORLD[1];
  if (Math.hypot(x - ISLAND.x, z - ISLAND.z) < ISLAND.radius)
    return ISLAND_PLACES.find((p) => Math.hypot(x - p.x, z - p.z) < p.radius) ?? OVERWORLD[1];
  return BIOME_PLACES[biomeIndex(x, z)];
}

/** The seven bearings are evenly spaced, so the sector a point falls in is arithmetic
 * rather than a search. Terrain sampling calls this for every vertex in the world. */
const RING_STEP = 360 / RING_ORDER.length;
const RING_FIRST = BIOME_BEARINGS[RING_ORDER[0]];
export function biomeIndex(x: number, z: number) {
  const degrees = (Math.atan2(z - ISLAND.z, x - ISLAND.x) * 180) / Math.PI;
  const slot = Math.round((degrees - RING_FIRST) / RING_STEP);
  return ((slot % RING_ORDER.length) + RING_ORDER.length) % RING_ORDER.length;
}
/** The outer biome a point sits in, ignoring the island. */
export const biomeAt = (x: number, z: number) => BIOME_PLACES[biomeIndex(x, z)];

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
