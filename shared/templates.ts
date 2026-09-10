import { DUNGEON_PLACES } from './places.js';

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
  /** Rectangles the generator draws from. Compound shapes come from overlapping two. */
  rooms: { shape: string; size: [number, number] }[];
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
      { shape: 'stacks', size: [26, 22] },
      { shape: 'index', size: [22, 26] },
      { shape: 'reading', size: [18, 18] },
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
      { shape: 'channels', size: [26, 24] },
      { shape: 'choir', size: [24, 24] },
      { shape: 'bellows', size: [20, 18] },
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
      { shape: 'threshold', size: [28, 26] },
      { shape: 'constellation', size: [26, 26] },
    ],
    graph: { min: 5, max: 5, optional: 0 },
    encounters: {
      threshold: [{ kinds: ['watcher'], count: [5, 7] }],
      constellation: [
        { kinds: ['watcher'], count: [3, 5] },
        { kinds: ['scarab'], count: [3, 5] },
      ],
    },
    keeper: 'nullelder',
    palette: '#c6a4ff',
    color: '#c6a4ff',
    secret: { chance: 0, reward: 0 },
  },
];
export const TEMPLATE_BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));
export const templateName = (id: string) => TEMPLATE_BY_ID.get(id)?.name ?? id;
