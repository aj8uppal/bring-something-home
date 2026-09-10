import { CLASSES } from './content.js';
import { attunementBonus } from './attunements.js';
import type { Character, Item } from './types.js';

export const TRAITS = {
  echo: { name: 'Echo', description: 'Twin bolts, each dealing 65% damage.' },
  swift: { name: 'Quickening', description: '25% faster attacks.' },
  pierce: { name: 'Threadpiercer', description: 'Shots pass through 3 extra enemies.' },
  leech: { name: 'Lifebloom', description: 'Recover 3 health on each kill.' },
  vigor: { name: 'Waywind', description: '8% faster movement.' },
  focus: { name: 'Wellspring', description: 'Recover 3 additional light per second.' },
  ricochet: { name: 'Skipstone', description: 'Shots bounce once off scenery and the world edge.' },
  aegis: { name: 'Standing Oath', description: 'Absorb one hit every 10 seconds.' },
  trail: { name: 'Emberwake', description: 'Your dash leaves a burning trail behind you.' },
  grace: { name: 'Second Breath', description: 'A perfect dodge returns 12 light.' },
  zeal: { name: 'Undimmed', description: '14% more damage while at full health.' },
  defiance: { name: 'Last Light', description: '25% more damage below a third health.' },
} as const;
export type Trait = keyof typeof TRAITS;
export function hasTrait(c: Character, trait: Trait) {
  return Object.values(c.equipment).some((item) => item?.trait === trait);
}
export function combatStats(c: Character) {
  const base = CLASSES[c.classId];
  const drank = attunementBonus(c);
  const set = setBonus(c);
  return {
    maxHp:
      base.hp + (c.level - 1) * 14 + (c.equipment.armor?.power ?? 0) * 5 + drank.maxHp + set.maxHp,
    maxMp:
      base.mp + (c.level - 1) * 4 + (c.equipment.charm?.power ?? 0) * 2.5 + drank.maxMp + set.maxMp,
    damage:
      (base.damage + (c.level - 1) * 2.6 + (c.equipment.weapon?.power ?? 0) + drank.damage) *
      set.damage,
    // Gear still caps at 38%; draughts and a set add on top of it, to a hard 55% ceiling.
    reduction: Math.min(
      0.55,
      Math.min(0.38, (c.equipment.armor?.power ?? 0) * 0.006) + drank.reduction + set.reduction,
    ),
    speed: base.speed * (hasTrait(c, 'vigor') ? 1.08 : 1) * set.speed + drank.speed,
    regen:
      6 + (c.equipment.charm?.power ?? 0) * 0.13 + (hasTrait(c, 'focus') ? 3 : 0) + drank.regen,
    rate: Math.max(0.05, base.rate / (hasTrait(c, 'swift') ? 1.25 : 1) / set.rate + drank.rate),
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
/** The damage a build actually deals right now, including the traits that read the health bar. */
export function situationalDamage(c: Character, hp: number, maxHp: number) {
  const full = hp >= maxHp - 0.5 && hasTrait(c, 'zeal') ? 1.14 : 1;
  const low = hp <= maxHp / 3 && hasTrait(c, 'defiance') ? 1.25 : 1;
  return full * low;
}
/**
 * A chain is worth more the longer you hold it. The first four steps are exactly what they
 * always were, to forty per cent; past that it keeps climbing on a shallower slope, so an
 * aggressive run is a real reward rather than a ceiling reached in twenty seconds.
 */
export const chainMultiplier = (kills: number) =>
  1 +
  Math.min(4, Math.floor(kills / 5)) * 0.1 +
  Math.max(0, Math.min(6, Math.floor((kills - 20) / 5))) * 0.05;
export const CHAIN_CAP = chainMultiplier(50);
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

  tidechoir: {
    name: 'A Note Held Underwater',
    slot: 'charm',
    trait: 'grace',
    description: 'Forty voices, one breath, and it has not run out yet.',
  },
  orchardmother: {
    name: 'The Last Seedling',
    slot: 'armor',
    trait: 'aegis',
    description: 'Something small enough to shelter, and stubborn enough to be worth it.',
  },
  saltking: {
    name: 'Crown of White Towers',
    slot: 'weapon',
    trait: 'ricochet',
    description: 'The kingdom he was promised, kept in the only place it ever existed.',
  },
  orrerywarden: {
    name: 'The Hour That Never Struck',
    slot: 'charm',
    trait: 'trail',
    description: 'One gear, still turning, still convinced the sky is up there somewhere.',
  },
  marrowherald: {
    name: 'What the Marsh Announced',
    slot: 'armor',
    trait: 'defiance',
    description: 'Nobody understood the message. Everybody understood the warning.',
  },
  fusedtitan: {
    name: 'A Hundred Held Together',
    slot: 'weapon',
    trait: 'zeal',
    description: 'One shape stood up out of the wave. It has been standing ever since.',
  },
  warrenmother: {
    name: 'The Seed She Kept Back',
    slot: 'charm',
    trait: 'focus',
    description: 'One seed she never planted, in case the orchard needed starting again.',
  },
  lanternprime: {
    name: 'The Wick That Remembers',
    slot: 'charm',
    trait: 'grace',
    description: 'Light it anywhere and it burns the colour of the room it was first lit in.',
  },
  hivequeen: {
    name: 'An Unfinished Letter',
    slot: 'weapon',
    trait: 'pierce',
    description: 'Glass, cut into a sentence nobody has managed to read all the way through.',
  },
  vigilkeeper: {
    name: 'Counting Dawns',
    slot: 'armor',
    trait: 'aegis',
    description: 'A tally on the inside of a breastplate, and it goes all the way round.',
  },
  choirmaster: {
    name: 'The Beat Under the Ash',
    slot: 'charm',
    trait: 'swift',
    description: 'Hold it and you will find yourself keeping time with something.',
  },
  chapelwarden: {
    name: 'Still Seated',
    slot: 'armor',
    trait: 'defiance',
    description: 'Whatever comes, it has decided it is not getting up.',
  },
  stormremembers: {
    name: 'Everything the Storm Kept',
    slot: 'armor',
    trait: 'leech',
    description: 'It has been holding on to all of it. It will give some of it back.',
  },
};

/**
 * Set bonuses. Three related relics worn together are a named build rather than a
 * checklist, so the relic collection is a goal instead of a wall of ticks.
 *
 * Each is one weapon, one armour and one charm. `damage`, `speed` and `rate` multiply;
 * health, light and armour add.
 */
export interface GearSet {
  id: string;
  name: string;
  /** The keepers whose relics make it, in weapon, armour, charm order. */
  relics: [string, string, string];
  description: string;
  bonus: Partial<{
    maxHp: number;
    maxMp: number;
    damage: number;
    reduction: number;
    speed: number;
    rate: number;
  }>;
}
export const GEAR_SETS: GearSet[] = [
  {
    id: 'accord',
    name: 'The Elders’ Accord',
    relics: ['nullelder', 'cinderelder', 'tideelder'],
    description: 'What three elders agreed on, in the end.',
    bonus: { damage: 1.12, maxMp: 40, rate: 1.06 },
  },
  {
    id: 'first-realm',
    name: 'The First Realm',
    relics: ['duskwarden', 'rootwarden', 'archivist'],
    description: 'The bell, the road and the blank page: everything the old world kept.',
    bonus: { maxHp: 90, speed: 1.05, reduction: 0.04 },
  },
  {
    id: 'sun-and-glass',
    name: 'The Sun and the Glass',
    relics: ['forgemother', 'glasswarden', 'orrerywarden'],
    description: 'A needle, a sunrise and an hour that never struck.',
    bonus: { damage: 1.1, rate: 1.1 },
  },
  {
    id: 'crown-entire',
    name: 'The Crown Entire',
    relics: ['sovereign', 'stormremembers', 'tidechoir'],
    description: 'Everything the Crown was holding back, worn all at once.',
    bonus: { damage: 1.15, maxHp: 70, reduction: 0.03 },
  },
  {
    id: 'salt-and-stone',
    name: 'The Salt and the Stone',
    relics: ['saltking', 'orchardmother', 'warrenmother'],
    description: 'A kingdom of white towers, a seedling, and one held breath.',
    bonus: { maxHp: 120, reduction: 0.06 },
  },
  {
    id: 'fused-choir',
    name: 'The Fused Choir',
    relics: ['fusedtitan', 'marrowherald', 'lanternprime'],
    description: 'A hundred travelers, one warning, and a light to read it by.',
    bonus: { damage: 1.08, speed: 1.08, maxMp: 50 },
  },
  {
    id: 'hive-and-vigil',
    name: 'The Hive and the Vigil',
    relics: ['hivequeen', 'vigilkeeper', 'choirmaster'],
    description: 'An unfinished letter, a tally of dawns, and something keeping time.',
    bonus: { rate: 1.14, maxHp: 60 },
  },
];
export const NEUTRAL_SET = { maxHp: 0, maxMp: 0, damage: 1, reduction: 0, speed: 1, rate: 1 };
/** The set a traveler is actually wearing, if their three relics happen to agree. */
export function activeSet(c: Character): GearSet | undefined {
  const worn = new Set(
    Object.values(c.equipment)
      .map((item) => item?.relicId)
      .filter(Boolean) as string[],
  );
  if (worn.size < 3) return undefined;
  return GEAR_SETS.find((set) => set.relics.every((kind) => worn.has(kind)));
}
export function setBonus(c: Character) {
  return { ...NEUTRAL_SET, ...(activeSet(c)?.bonus ?? {}) };
}
