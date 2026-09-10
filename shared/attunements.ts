import type { Character } from './types.js';

/**
 * Attunements: the stat economy. One kind per stat in `combatStats()`, each a consumable
 * that permanently raises that stat on the traveler who drinks it, up to a cap that grows
 * with their level.
 *
 * They belong to the life, not the account. Death takes them, exactly as it takes levels
 * and carried gear, which is why they drop generously.
 */
export type AttunedStat = 'maxHp' | 'maxMp' | 'damage' | 'reduction' | 'speed' | 'regen' | 'rate';
export interface Attunement {
  id: string;
  name: string;
  stat: AttunedStat;
  /** What the stat readout calls it. */
  label: string;
  /** What one of them is worth. Negative for `rate`, where lower is faster. */
  step: number;
  color: string;
  description: string;
}

export const ATTUNEMENTS: Attunement[] = [
  {
    id: 'vitality',
    name: 'Draught of Deep Roots',
    stat: 'maxHp',
    label: 'Health',
    step: 6,
    color: '#e0836f',
    description: 'Permanently +6 health for this life.',
  },
  {
    id: 'light',
    name: 'Draught of Held Light',
    stat: 'maxMp',
    label: 'Light',
    step: 4,
    color: '#9ae2dc',
    description: 'Permanently +4 light for this life.',
  },
  {
    id: 'might',
    name: 'Draught of the Long Arm',
    stat: 'damage',
    label: 'Damage',
    step: 1.2,
    color: '#edc48e',
    description: 'Permanently +1.2 damage for this life.',
  },
  {
    id: 'ward',
    name: 'Draught of Standing Stone',
    stat: 'reduction',
    label: 'Armour',
    step: 0.004,
    color: '#c3b79a',
    description: 'Permanently +0.4% damage blocked for this life.',
  },
  {
    id: 'swiftness',
    name: 'Draught of Open Road',
    stat: 'speed',
    label: 'Speed',
    step: 0.09,
    color: '#c8d98b',
    description: 'Permanently +0.09 move speed for this life.',
  },
  {
    id: 'wellspring',
    name: 'Draught of the Quiet Spring',
    stat: 'regen',
    label: 'Regen',
    step: 0.35,
    color: '#8fd8d2',
    description: 'Permanently +0.35 light per second for this life.',
  },
  {
    id: 'quickness',
    name: 'Draught of the Short Breath',
    stat: 'rate',
    label: 'Rate',
    step: -0.0022,
    color: '#f0a877',
    description: 'Permanently faster attacks for this life.',
  },
];
export const ATTUNEMENT_BY_ID = new Map(ATTUNEMENTS.map((a) => [a.id, a]));
/** How many of one kind a traveler at this level can hold. Cap is a visible milestone. */
export const attunementCap = (level: number) => Math.max(4, Math.floor(level * 0.75));
export const attunementCount = (c: Character, id: string) => c.attunements?.[id] ?? 0;
export const atAttunementCap = (c: Character, id: string) =>
  attunementCount(c, id) >= attunementCap(c.level);
/** The total each stat has gained from draughts. */
export function attunementBonus(c: Character): Record<AttunedStat, number> {
  const total = {
    maxHp: 0,
    maxMp: 0,
    damage: 0,
    reduction: 0,
    speed: 0,
    regen: 0,
    rate: 0,
  } as Record<AttunedStat, number>;
  for (const a of ATTUNEMENTS) total[a.stat] += attunementCount(c, a.id) * a.step;
  return total;
}
/**
 * Which two kinds a keeper favours. Every door is worth running after its relic is
 * collected, because it is still the best place to find two particular draughts.
 */
export const FAVOURED: Record<string, [string, string]> = {
  rootwarden: ['vitality', 'swiftness'],
  duskwarden: ['light', 'wellspring'],
  glasswarden: ['might', 'ward'],
  archivist: ['light', 'quickness'],
  forgemother: ['might', 'vitality'],
  sovereign: ['might', 'ward'],
  tideelder: ['wellspring', 'light'],
  cinderelder: ['vitality', 'might'],
  nullelder: ['quickness', 'swiftness'],
  tidechoir: ['wellspring', 'vitality'],
  orchardmother: ['ward', 'vitality'],
  saltking: ['swiftness', 'might'],
  orrerywarden: ['quickness', 'light'],
  marrowherald: ['vitality', 'ward'],
  fusedtitan: ['might', 'quickness'],
  stormremembers: ['ward', 'might'],
  warrenmother: ['vitality', 'wellspring'],
  lanternprime: ['light', 'wellspring'],
  hivequeen: ['quickness', 'might'],
  vigilkeeper: ['ward', 'swiftness'],
  choirmaster: ['might', 'quickness'],
  chapelwarden: ['ward', 'vitality'],
};
/** What a keeper is worth drawing from, favouring its two, with everything else possible. */
export function attunementRoll(kind: string, roll: number) {
  const favoured = FAVOURED[kind];
  if (favoured && roll < 0.72) return favoured[roll < 0.36 ? 0 : 1];
  return ATTUNEMENTS[Math.floor(roll * ATTUNEMENTS.length) % ATTUNEMENTS.length].id;
}
/** The exchange at the Cinder Smith: a floor for unlucky travelers, at a poor rate. */
export const ATTUNEMENT_SHARD_COST = 14;
