import type { Rarity, Slot, Vec } from './types.js';

/**
 * The shape of trouble at a setpiece. Which shape occupies which of the twelve anchors is
 * the realm's choice, drawn from its seed, so the same landmark is a shrine in one realm
 * and a nest in the next and nobody can memorise the map.
 */
export interface SetpieceShape {
  id: string;
  kind: 'shrine' | 'ambush' | 'caravan' | 'lanterns' | 'nest';
  /** What the banner says when you walk in. */
  title: string;
  detail: string;
  /** How many waves, or how many lanterns, or how many nests. */
  count: number;
  /** The guaranteed bag. */
  bag: { tier: number; rarity: Rarity; slots: Slot[] };
}

export const SETPIECE_SHAPES: SetpieceShape[] = [
  {
    id: 'shrine',
    kind: 'shrine',
    title: 'Something is still being kept here',
    detail: 'One keeper, and it has not been relieved. Break it for what it guards.',
    count: 1,
    bag: { tier: 5, rarity: 'rare', slots: ['weapon', 'charm'] },
  },
  {
    id: 'ambush',
    kind: 'ambush',
    title: 'The ground closes behind you',
    detail: 'Three waves, and the way out burns until the last of them is down.',
    count: 3,
    bag: { tier: 5, rarity: 'rare', slots: ['armor', 'charm'] },
  },
  {
    id: 'caravan',
    kind: 'caravan',
    title: 'Nobody came back for this',
    detail: 'A guardian stands over the wagons. Its front is armoured; its back is not.',
    count: 1,
    bag: { tier: 6, rarity: 'rare', slots: ['weapon', 'armor'] },
  },
  {
    id: 'lanterns',
    kind: 'lanterns',
    title: 'Light them, all of them',
    detail: 'Stand at each unlit post until it catches. Something objects.',
    count: 4,
    bag: { tier: 6, rarity: 'rare', slots: ['charm', 'weapon'] },
  },
  {
    id: 'nest',
    kind: 'nest',
    title: 'It keeps making more',
    detail: 'The brood never runs out. Break what is producing it.',
    count: 1,
    bag: { tier: 6, rarity: 'rare', slots: ['armor', 'weapon'] },
  },
];
export const SHAPE_BY_ID = new Map(SETPIECE_SHAPES.map((s) => [s.id, s]));

/** How long a cleared setpiece stays quiet before it is worth walking back to. */
export const SETPIECE_COOLDOWN = 420;

/** What the atlas and the objective board read. */
export interface SetpieceState extends Vec {
  id: string;
  name: string;
  place: string;
  shape: string;
  title: string;
  status: 'ready' | 'active' | 'cleared';
  /** Progress through the encounter: waves down, lanterns lit, or keeper health. */
  current: number;
  total: number;
  /** Seconds until a cleared setpiece is worth returning to. */
  ready: number;
  color: string;
}
