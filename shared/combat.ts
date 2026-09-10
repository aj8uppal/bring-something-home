import { CLASSES } from './content.js';
import type { Character, Item } from './types.js';

export const TRAITS = {
  echo: { name: 'Echo', description: 'Twin bolts, each dealing 65% damage.' },
  swift: { name: 'Quickening', description: '25% faster attacks.' },
  pierce: { name: 'Threadpiercer', description: 'Shots pass through 3 extra enemies.' },
  leech: { name: 'Lifebloom', description: 'Recover 3 health on each kill.' },
  vigor: { name: 'Waywind', description: '8% faster movement.' },
  focus: { name: 'Wellspring', description: 'Recover 3 additional light per second.' },
} as const;
export type Trait = keyof typeof TRAITS;
export function hasTrait(c: Character, trait: Trait) {
  return Object.values(c.equipment).some((item) => item?.trait === trait);
}
export function combatStats(c: Character) {
  const base = CLASSES[c.classId];
  return {
    maxHp: base.hp + (c.level - 1) * 14 + (c.equipment.armor?.power ?? 0) * 5,
    maxMp: base.mp + (c.level - 1) * 4 + (c.equipment.charm?.power ?? 0) * 2.5,
    damage: base.damage + (c.level - 1) * 2.6 + (c.equipment.weapon?.power ?? 0),
    reduction: Math.min(0.38, (c.equipment.armor?.power ?? 0) * 0.006),
    speed: base.speed * (hasTrait(c, 'vigor') ? 1.08 : 1),
    regen: 6 + (c.equipment.charm?.power ?? 0) * 0.13 + (hasTrait(c, 'focus') ? 3 : 0),
    rate: base.rate / (hasTrait(c, 'swift') ? 1.25 : 1),
  };
}
export function weaponShots(c: Character) {
  const echo = hasTrait(c, 'echo');
  return (echo ? [-0.045, 0.045] : [0]).map((angle) => ({
    angle,
    damage: echo ? 0.65 : 1,
    speed: c.classId === 'ranger' ? 38 : c.classId === 'sentinel' ? 30 : 34,
    radius: c.classId === 'sentinel' ? 0.36 : 0.22,
    pierce: (c.classId === 'ranger' ? 1 : 0) + (hasTrait(c, 'pierce') ? 3 : 0),
  }));
}
export function itemSummary(item: Item) {
  const stat =
    item.slot === 'weapon'
      ? `+${item.power} damage`
      : item.slot === 'armor'
        ? `+${item.power * 5} health`
        : `+${item.power * 2.5} light`;
  return `${stat}${item.trait ? ` · ${TRAITS[item.trait].name}` : ''}`;
}
export const chainMultiplier = (kills: number) => 1 + Math.min(4, Math.floor(kills / 5)) * 0.1;
export const CHAIN_WINDOW = 12;

/** Each boss has a specific chase item, so choosing an encounter can shape a build. */
export const BOSS_RELICS: Record<
  string,
  { name: string; slot: Item['slot']; trait: Trait; description: string }
> = {
  tideelder: {
    name: 'The Sea Between Seconds',
    slot: 'charm',
    trait: 'focus',
    description: 'A tide that returns before it has ever left.',
  },
  cinderelder: {
    name: 'The Undying Sunrise',
    slot: 'armor',
    trait: 'leech',
    description: 'Beneath the ash, a sun still beats.',
  },
  nullelder: {
    name: 'A Voice in the Nothing',
    slot: 'weapon',
    trait: 'echo',
    description: 'Even the silence cannot hold back an answer.',
  },

  rootwarden: {
    name: 'The Walking Forest',
    slot: 'armor',
    trait: 'vigor',
    description: 'The Rootbound left one last path open. Your steps remember it.',
  },
  duskwarden: {
    name: 'Two Bells at Dusk',
    slot: 'weapon',
    trait: 'echo',
    description: 'One note for the world that ended. One for the world you will make.',
  },
  glasswarden: {
    name: 'Sunlight Under Glass',
    slot: 'armor',
    trait: 'leech',
    description: 'A living sunrise, sealed inside the Colossus’s broken heart.',
  },
  archivist: {
    name: 'The Unwritten Page',
    slot: 'charm',
    trait: 'focus',
    description: 'The Archive kept one blank page for a story that has not ended.',
  },
  forgemother: {
    name: 'Needle of the First Sun',
    slot: 'weapon',
    trait: 'pierce',
    description: 'Forged to stitch the sky together. No darkness can stop its passage.',
  },
  sovereign: {
    name: 'The Last Word of Fire',
    slot: 'weapon',
    trait: 'swift',
    description: 'The crown was never the source of the flame. You are.',
  },
};
