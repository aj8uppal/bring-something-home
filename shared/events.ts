import type { Vec } from './types.js';

/**
 * Every live event in the realm, as rows. An event raises a beam you can see across a
 * biome, puts a counting icon on the atlas, and announces itself in chat with a place
 * name, so the reason to change what you were doing is always visible from where you are.
 */
export interface WorldEvent {
  id: string;
  name: string;
  /** Eligible places. The realm picks one it can reach. */
  places: string[];
  /**
   * `siege` holds one spot and sends waves at it. `tide` spawns each wave on a wider ring
   * than the last, so the fight walks outward. `procession` moves: the light it is built
   * around walks toward the Hearth, and what it draws follows.
   */
  shape: 'siege' | 'tide' | 'procession';
  waves: { kinds: string[]; count: number }[];
  /** A single stronger creature that arrives with the last wave. */
  miniBoss?: string;
  /** A procession's light. If it falls, the event is lost. */
  escort?: { kind: string; hp: number; speed: number };
  duration: number;
  cooldown: number;
  target: number;
  reward: { embers: number; gold: number; shards?: number };
  /** Colour of the world beam and the map icon. */
  beacon: string;
  lesson: string;
}

export const WORLD_EVENTS: WorldEvent[] = [
  {
    id: 'wandering-star',
    name: 'The Wandering Star',
    places: ['meadow'],
    shape: 'siege',
    waves: [
      { kinds: ['wisp', 'thornling'], count: 6 },
      { kinds: ['wisp', 'thornling'], count: 6 },
    ],
    duration: 90,
    cooldown: 180,
    target: 12,
    reward: { embers: 10, gold: 60 },
    beacon: '#edc177',
    lesson: 'Guardians arrive in waves. Clear the ring before the next one lands.',
  },
  {
    id: 'meteor',
    name: 'A Second Fall',
    places: ['glass', 'saltflat', 'glacier'],
    shape: 'siege',
    waves: [
      { kinds: ['scarab', 'glasshound'], count: 5 },
      { kinds: ['prismshard'], count: 3 },
    ],
    miniBoss: 'glasswarden',
    duration: 130,
    cooldown: 260,
    target: 9,
    reward: { embers: 14, gold: 110, shards: 1 },
    beacon: '#e8d3a0',
    lesson: 'The shards split when they break. Clear the small ones before the big one lands.',
  },
  {
    id: 'cinder-tide',
    name: 'The Cinder Tide',
    places: ['crown', 'ashfall', 'coast'],
    shape: 'tide',
    waves: [
      { kinds: ['cinderling'], count: 6 },
      { kinds: ['emberkite'], count: 4 },
      { kinds: ['ashanchor', 'emberkite'], count: 4 },
    ],
    duration: 140,
    cooldown: 300,
    target: 14,
    reward: { embers: 16, gold: 120, shards: 1 },
    beacon: '#e79a6d',
    lesson: 'Each wave lands further out than the last. Fight outward or be surrounded.',
  },
  {
    id: 'wisp-procession',
    name: 'The Wisp Procession',
    places: ['grove', 'orchard', 'marsh'],
    shape: 'procession',
    waves: [
      { kinds: ['wisp', 'voidmoth'], count: 5 },
      { kinds: ['voidmoth', 'bogfiend'], count: 5 },
    ],
    escort: { kind: 'wisp', hp: 2400, speed: 1.5 },
    duration: 160,
    cooldown: 280,
    target: 10,
    reward: { embers: 14, gold: 100 },
    beacon: '#9fe3d8',
    lesson: 'The light is walking home. Nothing that follows it may reach it.',
  },
  {
    id: 'lost-traveler',
    name: 'The Long Way Home',
    places: ['coast', 'saltflat', 'observatory', 'orchard'],
    shape: 'procession',
    waves: [
      { kinds: ['brineclaw', 'saltstrider'], count: 4 },
      { kinds: ['mirage', 'voidmoth'], count: 4 },
    ],
    escort: { kind: 'tidewisp', hp: 1500, speed: 2.1 },
    duration: 150,
    cooldown: 320,
    target: 8,
    reward: { embers: 12, gold: 90 },
    beacon: '#f0dcae',
    lesson: 'Someone is trying to get back. Walk with them and keep the road clear.',
  },
];
export const EVENT_BY_ID = new Map(WORLD_EVENTS.map((e) => [e.id, e]));

/** The live state a snapshot carries, so the beam, the icon, and the countdown all agree. */
export interface EventState extends Partial<Vec> {
  active: boolean;
  remaining: number;
  kills: number;
  target: number;
  id?: string;
  name?: string;
  place?: string;
  beacon?: string;
  lesson?: string;
}
