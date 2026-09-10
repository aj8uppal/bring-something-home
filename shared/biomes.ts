import { BIOME_BEARINGS, BIOME_PLACES, PLACE_BY_ID, type BiomeId } from './places.js';
import type { Vec } from './types.js';

/**
 * One row per biome. Terrain shape, ground and fog colour, scenery mix, ambient chord,
 * resident boss, and the ecology that populates it all live here.
 *
 * Adding a biome is adding a bearing in `places.ts` and a row in this file. Nothing in the
 * world, the server, or the client asks which biome it is looking at by name.
 */
export interface Terrain {
  /** Vertical scale of the rolling fold. */
  amp: number;
  /** How tight the folds are. Low is open country; high is broken ground. */
  freq: number;
  /** Base elevation relative to the island. */
  lift: number;
  /** Sharp folds on top of the roll: cliffs, ridges, and terraces. */
  ridge: number;
  /** Ground at or below this height is standing water. */
  water: number;
}

export type PropKind =
  'tree' | 'rock' | 'grass' | 'ruin' | 'crystal' | 'signpost' | 'water' | 'wall';

export interface Scenery {
  /** Props per hundred square units. The Salt Flat is nearly bare; the Orchard is dense. */
  density: number;
  mix: { kind: PropKind; weight: number }[];
  colors: string[];
  scale: [number, number];
}

export interface Biome {
  id: BiomeId;
  terrain: Terrain;
  /** Ground base colour, before the place tint grades over it. */
  ground: string;
  fog: string;
  scenery: Scenery;
  /** The ambient sound bed: four tones, held and re-struck. */
  chord: number[];
  /** The resident boss and how long it stays dead. */
  boss: { kind: string; respawn: number };
}
/**
 * How many creatures a realm has to put down before a place is its own again.
 *
 * Thresholds along the way wake the biome's setpieces for good, surface a second keeper,
 * and finally lift the fog. The world map draws it as a ring, so an arriving traveler can
 * see where the fight is before they have spoken to anybody.
 */
export const LIBERATION_QUOTA = 220;
export const LIBERATION_STEPS = [0.34, 0.67, 1] as const;
export function liberationStage(kills: number, quota = LIBERATION_QUOTA) {
  const share = kills / quota;
  return LIBERATION_STEPS.filter((step) => share >= step).length;
}

const at = (id: BiomeId, tangent: number, radial: number): Vec => {
  const p = PLACE_BY_ID.get(id)!,
    bearing = (BIOME_BEARINGS[id] * Math.PI) / 180;
  return {
    x: p.x + Math.cos(bearing) * radial - Math.sin(bearing) * tangent,
    z: p.z + Math.sin(bearing) * radial + Math.cos(bearing) * tangent,
  };
};
/** Five hunting grounds per biome: the heart, the two shoulders, and the two edges. */
const anchorsOf = (id: BiomeId): Vec[] => [
  at(id, 0, 0),
  at(id, 27, 6),
  at(id, -27, 6),
  at(id, 10, -25),
  at(id, -10, 24),
];

export const BIOMES: Record<BiomeId, Biome> = {
  coast: {
    id: 'coast',
    terrain: { amp: 0.55, freq: 0.05, lift: -0.55, ridge: 0, water: -0.3 },
    ground: '#7f9c9a',
    fog: '#93b6b2',
    scenery: {
      density: 4.2,
      mix: [
        { kind: 'water', weight: 5 },
        { kind: 'rock', weight: 3 },
        { kind: 'grass', weight: 8 },
        { kind: 'ruin', weight: 2 },
      ],
      colors: ['#7fa8a6', '#93b8ac', '#6f9490'],
      scale: [0.7, 1.7],
    },
    chord: [110, 164.81, 220, 293.66],
    boss: { kind: 'tidechoir', respawn: 300 },
  },
  orchard: {
    id: 'orchard',
    terrain: { amp: 0.62, freq: 0.11, lift: 0.2, ridge: 0.22, water: -99 },
    ground: '#8a8770',
    fog: '#a29c81',
    scenery: {
      density: 8.5,
      mix: [
        { kind: 'tree', weight: 11 },
        { kind: 'wall', weight: 2 },
        { kind: 'rock', weight: 3 },
        { kind: 'grass', weight: 4 },
      ],
      colors: ['#8e8a6e', '#9d9d7a', '#7d7a63'],
      scale: [0.8, 2],
    },
    chord: [123.47, 185, 246.94, 311.13],
    boss: { kind: 'orchardmother', respawn: 300 },
  },
  saltflat: {
    id: 'saltflat',
    terrain: { amp: 0.09, freq: 0.03, lift: 0.05, ridge: 0, water: -99 },
    ground: '#d3c8ab',
    fog: '#e2d9c0',
    scenery: {
      density: 1.5,
      mix: [
        { kind: 'crystal', weight: 4 },
        { kind: 'rock', weight: 3 },
        { kind: 'ruin', weight: 1 },
        { kind: 'grass', weight: 2 },
      ],
      colors: ['#d8cdb0', '#e6dcc2', '#c6b997'],
      scale: [0.6, 1.5],
    },
    chord: [146.83, 220, 293.66, 392],
    boss: { kind: 'saltking', respawn: 320 },
  },
  observatory: {
    id: 'observatory',
    terrain: { amp: 2.1, freq: 0.07, lift: 0.7, ridge: 1.7, water: -99 },
    ground: '#8f99b4',
    fog: '#aab3cb',
    scenery: {
      density: 5.4,
      mix: [
        { kind: 'ruin', weight: 7 },
        { kind: 'wall', weight: 4 },
        { kind: 'crystal', weight: 2 },
        { kind: 'grass', weight: 3 },
      ],
      colors: ['#9aa6c4', '#b0b9d2', '#8790ad'],
      scale: [0.8, 2.2],
    },
    chord: [130.81, 196, 261.63, 392],
    boss: { kind: 'orrerywarden', respawn: 340 },
  },
  marsh: {
    id: 'marsh',
    terrain: { amp: 0.6, freq: 0.09, lift: -0.4, ridge: 0.1, water: -0.2 },
    ground: '#66765f',
    fog: '#7d8c76',
    scenery: {
      density: 6.8,
      mix: [
        { kind: 'water', weight: 4 },
        { kind: 'tree', weight: 5 },
        { kind: 'grass', weight: 7 },
        { kind: 'rock', weight: 2 },
      ],
      colors: ['#6d7f6a', '#7d8f74', '#5d6d5b'],
      scale: [0.7, 1.9],
    },
    chord: [98, 130.81, 146.83, 196],
    boss: { kind: 'marrowherald', respawn: 360 },
  },
  glacier: {
    id: 'glacier',
    terrain: { amp: 1.15, freq: 0.045, lift: 0.55, ridge: 0.55, water: -99 },
    ground: '#9fc7d2',
    fog: '#bcdde4',
    scenery: {
      density: 3.6,
      mix: [
        { kind: 'crystal', weight: 9 },
        { kind: 'wall', weight: 3 },
        { kind: 'rock', weight: 2 },
        { kind: 'grass', weight: 1 },
      ],
      colors: ['#a9d3dd', '#c3e5eb', '#8fbcc8'],
      scale: [0.8, 2.1],
    },
    chord: [164.81, 246.94, 329.63, 493.88],
    boss: { kind: 'fusedtitan', respawn: 380 },
  },
  ashfall: {
    id: 'ashfall',
    terrain: { amp: 1.6, freq: 0.13, lift: 0.45, ridge: 1.05, water: -99 },
    ground: '#a67a63',
    fog: '#c2907a',
    scenery: {
      density: 4.8,
      mix: [
        { kind: 'rock', weight: 6 },
        { kind: 'wall', weight: 3 },
        { kind: 'crystal', weight: 3 },
        { kind: 'ruin', weight: 2 },
        { kind: 'grass', weight: 1 },
      ],
      colors: ['#c08a6d', '#a97659', '#d19c7d'],
      scale: [0.7, 2],
    },
    chord: [87.31, 116.54, 174.61, 233.08],
    boss: { kind: 'stormremembers', respawn: 420 },
  },
};

export const BIOME_LIST = BIOME_PLACES.map((p) => BIOMES[p.id as BiomeId]);

/** The height of the ground inside one biome, before it is blended with the island. */
export function biomeHeight(b: Biome, x: number, z: number) {
  const t = b.terrain;
  const roll =
    Math.sin(x * t.freq) * Math.cos(z * t.freq * 0.83) * t.amp +
    Math.sin((x + z * 1.7) * t.freq * 2.4) * t.amp * 0.32;
  // A folded ridge: sharp where it crosses zero, which reads as a cliff edge from above.
  const fold = t.ridge
    ? (0.5 - Math.abs(((Math.sin(x * t.freq * 0.62) + Math.cos(z * t.freq * 0.55)) % 2) / 2)) *
      t.ridge *
      2
    : 0;
  return roll + fold + t.lift;
}

/**
 * A pack, not a spawn slot. Packs are picked by weight, land together around one anchor,
 * and move together, so the same clearing holds a different fight on the next visit.
 */
export interface Ecology {
  place: string;
  packs: { kinds: { kind: string; count: number }[]; weight: number }[];
  /** Solo population. Unchanged from the pre-budget fixed counts on the island. */
  baseCount: number;
  perPlayer: number;
  cap: number;
  roam: 'anchored' | 'patrol' | 'wander';
  patrolRadius: number;
  anchors: Vec[];
}

const solo = (kind: string, weight: number) => ({ kinds: [{ kind, count: 1 }], weight });

/**
 * The island's four zones keep their original counts, weights, and spread exactly, so solo
 * pacing on the story track is untouched. The seven biomes below them fight in packs.
 */
export const ECOLOGY: Ecology[] = [
  {
    place: 'meadow',
    packs: [solo('cinderling', 8), solo('thornling', 3)],
    baseCount: 11,
    perPlayer: 0.75,
    cap: 29,
    roam: 'anchored',
    patrolRadius: 5,
    anchors: [
      { x: -11, z: -10 },
      { x: 12, z: -15 },
      { x: -9, z: -22 },
      { x: 0, z: -9 },
    ],
  },
  {
    place: 'grove',
    packs: [solo('wisp', 1)],
    baseCount: 12,
    perPlayer: 0.75,
    cap: 30,
    roam: 'anchored',
    patrolRadius: 22,
    anchors: [{ x: -44, z: -15 }],
  },
  {
    place: 'glass',
    packs: [solo('scarab', 1)],
    baseCount: 12,
    perPlayer: 0.75,
    cap: 30,
    roam: 'anchored',
    patrolRadius: 24,
    anchors: [{ x: 43, z: -22 }],
  },
  {
    place: 'crown',
    packs: [solo('watcher', 1)],
    baseCount: 9,
    perPlayer: 0.75,
    cap: 27,
    roam: 'anchored',
    patrolRadius: 19,
    anchors: [{ x: 0, z: -63 }],
  },
  {
    place: 'coast',
    packs: [
      { kinds: [{ kind: 'brineclaw', count: 3 }], weight: 5 },
      { kinds: [{ kind: 'tidewisp', count: 3 }], weight: 4 },
      {
        kinds: [
          { kind: 'tidewisp', count: 2 },
          { kind: 'brineclaw', count: 2 },
        ],
        weight: 6,
      },
    ],
    baseCount: 14,
    perPlayer: 0.75,
    cap: 34,
    roam: 'patrol',
    patrolRadius: 22,
    anchors: anchorsOf('coast'),
  },
  {
    place: 'orchard',
    packs: [
      {
        kinds: [
          { kind: 'stonebark', count: 2 },
          { kind: 'thornling', count: 3 },
        ],
        weight: 5,
      },
      {
        kinds: [
          { kind: 'thornmother', count: 1 },
          { kind: 'stonebark', count: 1 },
        ],
        weight: 4,
      },
      { kinds: [{ kind: 'stonebark', count: 4 }], weight: 3 },
    ],
    baseCount: 14,
    perPlayer: 0.75,
    cap: 34,
    roam: 'anchored',
    patrolRadius: 20,
    anchors: anchorsOf('orchard'),
  },
  {
    place: 'saltflat',
    packs: [
      { kinds: [{ kind: 'saltstrider', count: 3 }], weight: 6 },
      {
        kinds: [
          { kind: 'saltstrider', count: 2 },
          { kind: 'mirage', count: 2 },
        ],
        weight: 5,
      },
      { kinds: [{ kind: 'mirage', count: 3 }], weight: 3 },
    ],
    baseCount: 14,
    perPlayer: 0.75,
    cap: 34,
    roam: 'wander',
    patrolRadius: 30,
    anchors: anchorsOf('saltflat'),
  },
  {
    place: 'observatory',
    packs: [
      {
        kinds: [
          { kind: 'orrery', count: 1 },
          { kind: 'voidmoth', count: 3 },
        ],
        weight: 6,
      },
      { kinds: [{ kind: 'voidmoth', count: 4 }], weight: 4 },
      {
        kinds: [
          { kind: 'orrery', count: 2 },
          { kind: 'saltstrider', count: 2 },
        ],
        weight: 3,
      },
    ],
    baseCount: 14,
    perPlayer: 0.75,
    cap: 34,
    roam: 'patrol',
    patrolRadius: 24,
    anchors: anchorsOf('observatory'),
  },
  {
    place: 'marsh',
    packs: [
      {
        kinds: [
          { kind: 'marshlantern', count: 1 },
          { kind: 'bogfiend', count: 3 },
        ],
        weight: 6,
      },
      { kinds: [{ kind: 'bogfiend', count: 4 }], weight: 4 },
      {
        kinds: [
          { kind: 'marshlantern', count: 2 },
          { kind: 'voidmoth', count: 2 },
        ],
        weight: 3,
      },
    ],
    baseCount: 14,
    perPlayer: 0.75,
    cap: 34,
    roam: 'wander',
    patrolRadius: 26,
    anchors: anchorsOf('marsh'),
  },
  {
    place: 'glacier',
    packs: [
      {
        kinds: [
          { kind: 'prismshard', count: 2 },
          { kind: 'glasshound', count: 2 },
        ],
        weight: 6,
      },
      { kinds: [{ kind: 'glasshound', count: 4 }], weight: 4 },
      { kinds: [{ kind: 'prismshard', count: 3 }], weight: 3 },
    ],
    baseCount: 14,
    perPlayer: 0.75,
    cap: 34,
    roam: 'patrol',
    patrolRadius: 26,
    anchors: anchorsOf('glacier'),
  },
  {
    place: 'ashfall',
    packs: [
      {
        kinds: [
          { kind: 'ashanchor', count: 1 },
          { kind: 'emberkite', count: 2 },
        ],
        weight: 6,
      },
      {
        kinds: [
          { kind: 'emberkite', count: 2 },
          { kind: 'glasshound', count: 2 },
        ],
        weight: 4,
      },
      {
        kinds: [
          { kind: 'ashanchor', count: 2 },
          { kind: 'bogfiend', count: 2 },
        ],
        weight: 3,
      },
    ],
    baseCount: 14,
    perPlayer: 0.75,
    cap: 34,
    roam: 'wander',
    patrolRadius: 28,
    anchors: anchorsOf('ashfall'),
  },
];
export const ECOLOGY_BY_PLACE = new Map(ECOLOGY.map((e) => [e.place, e]));
