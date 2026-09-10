import { DUNGEON_PLACES, GENERATED_PLACES, type Place } from './places.js';

/**
 * A dungeon template: the kind of place a door leads to. An instance is a template plus a
 * seed, so two runs of the same template are the same rooms in a different order with a
 * different path between them.
 *
 * The three story dungeons keep their names, their permanent Hearth portals, and their
 * authored keeper rooms. Everything else about a run is generated.
 */
export interface DungeonTemplate {
  id: string;
  name: string;
  /** A recommendation on the door, never a gate. */
  level: number;
  /** Rectangles the generator draws from, each with the name its chamber is announced by. */
  rooms: { shape: string; name: string; size: [number, number] }[];
  /** The keeper's stage. Bosses deserve one, so it is written rather than generated. */
  keeperRoom: string;
  /**
   * Some runs are authored end to end. The Elder Convergence keeps its five encounters and
   * its three elders exactly; only the path between the altars is generated.
   */
  authored?: boolean;
  graph: { min: number; max: number; optional: number };
  /** What fills a room of each shape. */
  encounters: Record<string, { kinds: string[]; count: [number, number] }[]>;
  keeper: string;
  palette: string;
  color: string;
  /** The one secret per template, and what it is worth. */
  secret: { chance: number; reward: number };
  /** Which creature family drops this door, and how often. Empty for the story dungeons. */
  drops?: { kinds: string[]; chance: number };
  subtitle: string;
}

const story = (id: string) => DUNGEON_PLACES.find((p) => p.dimension === id)!;

export const TEMPLATES: DungeonTemplate[] = [
  {
    id: 'hollow',
    name: story('hollow').name,
    subtitle: story('hollow').subtitle,
    level: 5,
    rooms: [
      { shape: 'stacks', name: 'The flooded stacks', size: [26, 22] },
      { shape: 'index', name: 'The forbidden index', size: [22, 26] },
      { shape: 'reading', name: 'The drowned reading room', size: [18, 18] },
    ],
    graph: { min: 3, max: 5, optional: 1 },
    encounters: {
      stacks: [{ kinds: ['wisp'], count: [4, 6] }],
      index: [
        { kinds: ['wisp'], count: [3, 5] },
        { kinds: ['thornling'], count: [2, 4] },
      ],
      reading: [{ kinds: ['thornling', 'wisp'], count: [3, 5] }],
    },
    keeperRoom: 'The keeper of every name',
    keeper: 'archivist',
    palette: '#8fd8d2',
    color: '#8fd8d2',
    secret: { chance: 0.5, reward: 4 },
  },
  {
    id: 'crucible',
    name: story('crucible').name,
    subtitle: story('crucible').subtitle,
    level: 10,
    rooms: [
      { shape: 'channels', name: 'The cooling channels', size: [26, 24] },
      { shape: 'choir', name: 'The furnace choir', size: [24, 24] },
      { shape: 'bellows', name: 'The great bellows', size: [20, 18] },
    ],
    graph: { min: 3, max: 5, optional: 1 },
    encounters: {
      channels: [{ kinds: ['scarab'], count: [5, 7] }],
      choir: [
        { kinds: ['watcher'], count: [3, 5] },
        { kinds: ['scarab'], count: [2, 4] },
      ],
      bellows: [{ kinds: ['scarab', 'watcher'], count: [4, 6] }],
    },
    keeperRoom: 'The first fire',
    keeper: 'forgemother',
    palette: '#eda576',
    color: '#eda576',
    secret: { chance: 0.5, reward: 5 },
  },
  {
    id: 'eclipse',
    name: story('eclipse').name,
    subtitle: story('eclipse').subtitle,
    level: 20,
    rooms: [
      { shape: 'threshold', name: 'The oath at the threshold', size: [42, 38] },
      { shape: 'constellation', name: 'The last constellation', size: [40, 40] },
    ],
    graph: { min: 5, max: 5, optional: 0 },
    encounters: {
      threshold: [{ kinds: ['watcher'], count: [5, 7] }],
      constellation: [
        { kinds: ['watcher'], count: [3, 5] },
        { kinds: ['scarab'], count: [3, 5] },
      ],
    },
    keeperRoom: 'The silence after stars',
    keeper: 'nullelder',
    authored: true,
    palette: '#c6a4ff',
    color: '#c6a4ff',
    secret: { chance: 0, reward: 0 },
  },
  {
    id: 'warren',
    name: 'The Thornling Warren',
    subtitle: 'Tunnels under the orchard, and something at the bottom that plants them.',
    level: 3,
    rooms: [
      { shape: 'burrow', name: 'The first burrow', size: [22, 20] },
      { shape: 'root', name: 'The root gallery', size: [20, 24] },
      { shape: 'nursery', name: 'The seedling nursery', size: [18, 18] },
    ],
    graph: { min: 3, max: 5, optional: 1 },
    encounters: {
      burrow: [{ kinds: ['thornling'], count: [3, 5] }],
      root: [{ kinds: ['thornling', 'cinderling'], count: [4, 6] }],
      nursery: [{ kinds: ['thornling'], count: [4, 6] }],
    },
    keeperRoom: 'Where the thorns are planted',
    keeper: 'warrenmother',
    palette: '#b4c489',
    color: '#b4c489',
    secret: { chance: 0.45, reward: 3 },
    drops: { kinds: ['thornling'], chance: 0.03 },
  },
  {
    id: 'lantern',
    name: 'The Wisp Lantern',
    subtitle: 'A hollow lamp the size of a hall, and every wisp in it is a memory.',
    level: 6,
    rooms: [
      { shape: 'wick', name: 'The wick', size: [24, 20] },
      { shape: 'glass', name: 'The inner glass', size: [22, 22] },
      { shape: 'reservoir', name: 'The reservoir', size: [20, 20] },
    ],
    graph: { min: 3, max: 5, optional: 1 },
    encounters: {
      wick: [{ kinds: ['wisp'], count: [4, 6] }],
      glass: [{ kinds: ['wisp', 'tidewisp'], count: [4, 6] }],
      reservoir: [{ kinds: ['wisp'], count: [5, 7] }],
    },
    keeperRoom: 'The light everything was lit from',
    keeper: 'lanternprime',
    palette: '#9fe6de',
    color: '#9fe6de',
    secret: { chance: 0.5, reward: 4 },
    drops: { kinds: ['wisp'], chance: 0.028 },
  },
  {
    id: 'hive',
    name: 'The Scarab Hive',
    subtitle: 'Glass cells, stacked to the ceiling, and all of them still warm.',
    level: 9,
    rooms: [
      { shape: 'cells', name: 'The stacked cells', size: [24, 22] },
      { shape: 'gallery', name: 'The mirror gallery', size: [22, 26] },
      { shape: 'kiln', name: 'The kiln floor', size: [20, 20] },
    ],
    graph: { min: 3, max: 5, optional: 2 },
    encounters: {
      cells: [{ kinds: ['scarab'], count: [4, 6] }],
      gallery: [{ kinds: ['scarab', 'wisp'], count: [4, 6] }],
      kiln: [{ kinds: ['scarab'], count: [5, 7] }],
    },
    keeperRoom: 'The letter she has not finished',
    keeper: 'hivequeen',
    palette: '#eec98d',
    color: '#eec98d',
    secret: { chance: 0.5, reward: 5 },
    drops: { kinds: ['scarab'], chance: 0.026 },
  },
  {
    id: 'vigil',
    name: "The Watcher's Vigil",
    subtitle: 'A watchpost with no view, still fully manned.',
    level: 13,
    rooms: [
      { shape: 'post', name: 'The forward post', size: [24, 22] },
      { shape: 'muster', name: 'The muster hall', size: [26, 24] },
      { shape: 'signal', name: 'The signal floor', size: [20, 20] },
    ],
    graph: { min: 3, max: 5, optional: 2 },
    encounters: {
      post: [{ kinds: ['watcher'], count: [3, 5] }],
      muster: [{ kinds: ['watcher', 'scarab'], count: [4, 6] }],
      signal: [{ kinds: ['watcher'], count: [4, 6] }],
    },
    keeperRoom: 'Relieved at dawn',
    keeper: 'vigilkeeper',
    palette: '#c3a8dd',
    color: '#c3a8dd',
    secret: { chance: 0.5, reward: 5 },
    drops: { kinds: ['watcher'], chance: 0.024 },
  },
  {
    id: 'choir',
    name: 'The Cinder Choir',
    subtitle: 'Somewhere under the ash, something is still keeping time.',
    level: 16,
    rooms: [
      { shape: 'nave', name: 'The burning nave', size: [26, 24] },
      { shape: 'stalls', name: 'The choir stalls', size: [24, 26] },
      { shape: 'crypt', name: 'The warm crypt', size: [20, 20] },
    ],
    graph: { min: 4, max: 6, optional: 2 },
    encounters: {
      nave: [{ kinds: ['emberkite', 'cinderling'], count: [4, 6] }],
      stalls: [{ kinds: ['ashanchor', 'emberkite'], count: [3, 5] }],
      crypt: [{ kinds: ['emberkite'], count: [4, 6] }],
    },
    keeperRoom: 'Who is singing',
    keeper: 'choirmaster',
    palette: '#f0a877',
    color: '#f0a877',
    secret: { chance: 0.55, reward: 6 },
    drops: { kinds: ['emberkite', 'ashanchor', 'cinderling'], chance: 0.022 },
  },
  {
    id: 'chapel',
    name: 'The Drowned Chapel',
    subtitle: 'The service was never called off.',
    level: 18,
    rooms: [
      { shape: 'porch', name: 'The flooded porch', size: [24, 22] },
      { shape: 'transept', name: 'The transept', size: [26, 26] },
      { shape: 'font', name: 'The font', size: [20, 20] },
    ],
    graph: { min: 4, max: 6, optional: 2 },
    encounters: {
      porch: [{ kinds: ['brineclaw', 'tidewisp'], count: [4, 6] }],
      transept: [{ kinds: ['tidewisp', 'stonebark'], count: [4, 6] }],
      font: [{ kinds: ['brineclaw'], count: [5, 7] }],
    },
    keeperRoom: 'The congregation, still seated',
    keeper: 'chapelwarden',
    palette: '#8fc9d6',
    color: '#8fc9d6',
    secret: { chance: 0.55, reward: 6 },
    drops: { kinds: ['brineclaw', 'tidewisp'], chance: 0.022 },
  },
];
export const TEMPLATE_BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));
/**
 * Which door a creature family drops. It lives beside the template rather than in the
 * ecology row because a family crosses biomes: cinder kinds live on three of them.
 */
export const PORTAL_DROPS = new Map<string, DungeonTemplate>(
  TEMPLATES.flatMap((t) => (t.drops ? t.drops.kinds.map((kind) => [kind, t] as const) : [])),
);
/** Doors that only ever fall in the world. The three story dungeons are not among them. */
export const DROP_TEMPLATES = TEMPLATES.filter((t) => t.drops);
// A dropped door is a place too, so the HUD, the threat readout, and the atlas name it.
for (const template of DROP_TEMPLATES)
  GENERATED_PLACES.set(template.id, {
    id: template.id,
    name: template.name,
    subtitle: template.subtitle,
    x: 0,
    z: 0,
    radius: 6,
    tier: Math.max(2, Math.min(8, Math.round(template.level / 4) + 1)),
    levels: [template.level, template.level + 4] as [number, number],
    color: template.color,
    kind: 'dungeon',
    dimension: template.id,
  } satisfies Place);
export const templateName = (id: string) => TEMPLATE_BY_ID.get(id)?.name ?? id;
