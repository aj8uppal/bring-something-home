import { combatStats as stats, TRAITS, type Trait } from '../shared/combat.js';
import { randomUUID } from 'node:crypto';
import { CLASSES, RARITIES, MAX_LEVEL, xpForLevel } from '../shared/content.js';
import type { Character, ClassId, Item, Rarity, Slot } from '../shared/types.js';
export function makeItem(slot: Slot, tier: number, rarity: Rarity, rng = Math.random): Item {
  const names = {
    weapon: ['Sunspoke', 'Cinderwake', 'The Quiet Star', 'Dawnbreak', 'Ashen Promise'],
    armor: ['Wanderer’s Mantle', 'Barkweave', 'Duskplate', 'Keeper’s Shroud', 'The Last Shelter'],
    charm: ['Emberglass', 'Memory of Rain', 'Waking Star', 'Hearthstone', 'A Promise Kept'],
  };
  const name = names[slot][Math.floor(rng() * names[slot].length)];
  const traits: Trait[] =
    slot === 'weapon'
      ? ['echo', 'swift', 'pierce', 'ricochet', 'zeal']
      : slot === 'armor'
        ? ['leech', 'vigor', 'aegis', 'defiance']
        : ['focus', 'vigor', 'leech', 'trail', 'grace'];
  const trait =
    rarity === 'rare' || rarity === 'relic' ? traits[Math.floor(rng() * traits.length)] : undefined;
  return {
    trait,
    id: randomUUID(),
    name: `${rarity === 'relic' ? name : `${RARITIES[rarity].label} ${name}`}${trait ? ` of ${TRAITS[trait].name}` : ''}`,
    slot,
    rarity,
    tier,
    power: Math.round((3 + tier * 3) * RARITIES[rarity].mult),
    icon: slot === 'weapon' ? 'sword' : slot === 'armor' ? 'armor' : 'spark',
    description:
      rarity === 'relic'
        ? 'A fragment of the world before. Its warmth has never faded.'
        : 'Something worth carrying home.',
  };
}
export function createCharacter(classId: ClassId): Character {
  const weapon = makeItem('weapon', 1, 'common');
  weapon.icon = classId === 'arcanist' ? 'spark' : classId === 'ranger' ? 'bow' : 'sword';
  weapon.name =
    classId === 'arcanist'
      ? 'Hearthwood Staff'
      : classId === 'ranger'
        ? 'Ashwood Bow'
        : 'Dawnsteel Blade';
  return {
    classId,
    level: 1,
    xp: 0,
    hp: CLASSES[classId].hp,
    mp: CLASSES[classId].mp,
    kills: 0,
    gold: 0,
    potions: 3,
    equipment: { weapon, armor: null, charm: null },
    inventory: [],
    quest: 0,
    questProgress: 0,
    bosses: [],
    startedAt: Date.now(),
  };
}
export { combatStats as stats } from '../shared/combat.js';
export function grantXp(c: Character, amount: number) {
  if (c.level >= MAX_LEVEL) return false;
  const before = c.level;
  c.xp += amount;
  while (c.level < MAX_LEVEL && c.xp >= xpForLevel(c.level)) {
    c.xp -= xpForLevel(c.level);
    c.level++;
    const s = stats(c);
    c.hp = s.maxHp;
    c.mp = s.maxMp;
  }
  if (c.level >= MAX_LEVEL) c.xp = 0;
  return before !== c.level;
}
