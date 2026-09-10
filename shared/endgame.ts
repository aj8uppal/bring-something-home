import type { DungeonId, Profile, Vec } from './types.js';

export const MAX_DEPTH = 12;
export const ELDER_KINDS = ['tideelder', 'cinderelder', 'nullelder'] as const;
export const MODIFIERS = {
  still: {
    name: 'Still waters',
    description: 'The standard expedition.',
    hp: 1,
    damage: 1,
    speed: 1,
    rate: 1,
  },
  iron: {
    name: 'Iron hearts',
    description: 'Enemies have 20% more health.',
    hp: 1.2,
    damage: 1,
    speed: 1,
    rate: 1,
  },
  swift: {
    name: 'Swift current',
    description: 'Hostile projectiles travel 8% faster.',
    hp: 1,
    damage: 1,
    speed: 1.08,
    rate: 1,
  },
  fervor: {
    name: 'Elder fervor',
    description: 'Enemies attack 12% more often.',
    hp: 1,
    damage: 1,
    speed: 1,
    rate: 0.88,
  },
} as const;
export type Modifier = keyof typeof MODIFIERS;
export function legacyOf(p: Profile) {
  return (
    p.legacy ?? {
      shards: 0,
      highestDepth: 0,
      selectedDepth: 1,
      clears: 0,
      bossKills: {},
      relics: [],
      bestTimes: {},
    }
  );
}
export function ensureLegacy(p: Profile) {
  return (p.legacy ??= legacyOf(p));
}
export function depthScaling(depth: number) {
  const d = Math.max(1, Math.min(MAX_DEPTH, depth)) - 1;
  return { hp: 1 + d * 0.11, damage: 1 + d * 0.035, speed: 1 + d * 0.012 };
}
export interface Encounter {
  name: string;
  altar: Vec;
  enemies: { kind: string; count: number; x: number; z: number; spread: number }[];
}
export const EXPEDITIONS: Record<DungeonId, Encounter[]> = {
  hollow: [
    {
      name: 'The flooded stacks',
      altar: { x: 0, z: 17 },
      enemies: [{ kind: 'wisp', count: 5, x: 0, z: 6, spread: 9 }],
    },
    {
      name: 'The forbidden index',
      altar: { x: 0, z: 3 },
      enemies: [
        { kind: 'wisp', count: 4, x: -6, z: -7, spread: 5 },
        { kind: 'thornling', count: 3, x: 7, z: -8, spread: 4 },
      ],
    },
    {
      name: 'The keeper of every name',
      altar: { x: 0, z: -8 },
      enemies: [{ kind: 'archivist', count: 1, x: 0, z: -20, spread: 0 }],
    },
  ],
  crucible: [
    {
      name: 'The cooling channels',
      altar: { x: 0, z: 17 },
      enemies: [{ kind: 'scarab', count: 6, x: 0, z: 6, spread: 9 }],
    },
    {
      name: 'The furnace choir',
      altar: { x: 0, z: 3 },
      enemies: [
        { kind: 'watcher', count: 4, x: 0, z: -6, spread: 8 },
        { kind: 'scarab', count: 3, x: 0, z: -10, spread: 5 },
      ],
    },
    {
      name: 'The first fire',
      altar: { x: 0, z: -8 },
      enemies: [{ kind: 'forgemother', count: 1, x: 0, z: -20, spread: 0 }],
    },
  ],
  eclipse: [
    {
      name: 'The oath at the threshold',
      altar: { x: 0, z: 17 },
      enemies: [{ kind: 'watcher', count: 6, x: 0, z: 5, spread: 10 }],
    },
    {
      name: 'A sea without a shore',
      altar: { x: 0, z: 1 },
      enemies: [{ kind: 'tideelder', count: 1, x: 0, z: -12, spread: 0 }],
    },
    {
      name: 'The last constellation',
      altar: { x: 0, z: 1 },
      enemies: [
        { kind: 'watcher', count: 4, x: -8, z: -10, spread: 5 },
        { kind: 'scarab', count: 4, x: 8, z: -10, spread: 5 },
      ],
    },
    {
      name: 'A sun that will not die',
      altar: { x: 0, z: 1 },
      enemies: [{ kind: 'cinderelder', count: 1, x: 0, z: -12, spread: 0 }],
    },
    {
      name: 'The silence after stars',
      altar: { x: 0, z: 1 },
      enemies: [{ kind: 'nullelder', count: 1, x: 0, z: -12, spread: 0 }],
    },
  ],
};
export const masteryTitle = (depth: number) =>
  depth >= 12
    ? 'Starbreaker'
    : depth >= 8
      ? 'Elderbane'
      : depth >= 4
        ? 'Dawnkeeper'
        : depth >= 1
          ? 'Convergence walker'
          : 'Ember bearer';
export const relicCost = (kind: string) =>
  ELDER_KINDS.includes(kind as (typeof ELDER_KINDS)[number]) ? 30 : 18;
