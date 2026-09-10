import { DUNGEON_PLACES, OVERWORLD, placeAt } from './places.js';
import type { ClassId, Dimension, Rarity, Slot, Vec } from './types.js';
export const VERSION = '1.4.1';
export const TICK_RATE = 20;
export const MAX_PLAYERS = 48;
export const MAX_LEVEL = 20;
export const MAX_INVENTORY = 18;
export const MAX_VAULT = 48;
export const HAVEN = { x: 0, z: 20, radius: 12 };
/** Trouble at the gate: two creatures just outside the sanctuary edge, visible from spawn. */
export const GATE = { x: 0, z: 3 };
export const GATE_SPAWNS = [
  { kind: 'cinderling', x: -3, z: 5 },
  { kind: 'cinderling', x: 3, z: 4 },
] as const;
export const CLASSES: Record<
  ClassId,
  {
    name: string;
    title: string;
    description: string;
    color: string;
    hp: number;
    mp: number;
    speed: number;
    damage: number;
    rate: number;
    range: number;
    ability: string;
    abilityDescription: string;
    abilityCost: number;
    abilityCooldown: number;
    weapon: string;
    icon: string;
    difficulty: string;
  }
> = {
  arcanist: {
    name: 'Arcanist',
    title: 'THE LIGHT BETWEEN',
    description: 'Turn the old world’s last magic into a storm. Fragile, brilliant, devastating.',
    color: '#9ae2dc',
    hp: 180,
    mp: 120,
    speed: 9,
    damage: 24,
    rate: 0.2,
    range: 26,
    ability: 'Astral nova',
    abilityDescription: 'Unleash 24 piercing bolts. Clears nearby enemy projectiles.',
    abilityCost: 35,
    abilityCooldown: 4.5,
    weapon: 'staff',
    icon: 'spark',
    difficulty: 'Ranged · Area damage',
  },
  ranger: {
    name: 'Wayfarer',
    title: 'FOLLOW THE WIND',
    description: 'A steady bow and a second chance. Slip between the chaos, then strike true.',
    color: '#c8d98b',
    hp: 210,
    mp: 90,
    speed: 10.5,
    damage: 19,
    rate: 0.15,
    range: 30,
    ability: 'Thorn volley',
    abilityDescription: 'Loose a piercing fan of 9 arrows and gain a moment of invulnerability.',
    abilityCost: 28,
    abilityCooldown: 3.5,
    weapon: 'bow',
    icon: 'bow',
    difficulty: 'Long range · Mobility',
  },
  sentinel: {
    name: 'Sentinel',
    title: 'STAND AGAINST THE ASH',
    description:
      'An oath clad in old iron. Carry a shield into the storm and leave a path for others.',
    color: '#edb879',
    hp: 300,
    mp: 85,
    speed: 8.5,
    damage: 36,
    rate: 0.25,
    range: 15,
    ability: 'Dawn ward',
    abilityDescription:
      'Heal nearby allies, erase close projectiles, and become invulnerable for 1.5 seconds.',
    abilityCost: 32,
    abilityCooldown: 5,
    weapon: 'blade',
    icon: 'shield',
    difficulty: 'Mid range · Protection',
  },
};
export const RARITIES: Record<Rarity, { label: string; color: string; mult: number }> = {
  common: { label: 'Weathered', color: '#acb5aa', mult: 1 },
  uncommon: { label: 'Verdant', color: '#a9d28d', mult: 1.4 },
  rare: { label: 'Astral', color: '#a8bcff', mult: 1.95 },
  relic: { label: 'Relic', color: '#ecc087', mult: 2.8 },
};
/** Derived view of the overworld places, kept for existing callers and saved tests. */
export const ZONES = OVERWORLD.map((p) => ({
  id: p.id,
  name: p.name,
  subtitle: p.subtitle,
  x: p.x,
  z: p.z,
  radius: p.radius,
  tier: p.tier,
  color: p.color,
}));
/** Derived view of the dungeon places, in their established key order. */
export const DUNGEONS = Object.fromEntries(
  DUNGEON_PLACES.map((p) => [
    p.dimension!,
    {
      name: p.name,
      x: p.x,
      z: p.z,
      color: p.color,
      level: p.levels[0],
      description: p.subtitle,
    },
  ]),
) as Record<
  Exclude<Dimension, 'wilds'>,
  {
    name: string;
    x: number;
    z: number;
    color: string;
    level: number;
    description: string;
  }
>;
export const LANDMARKS = [
  { id: 'vault', name: 'Memory vault', x: 6, z: 22, icon: 'chest' },
  { id: 'forge', name: 'The Cinder Smith', x: -6, z: 22, icon: 'anvil' },
  { id: 'hollow', ...DUNGEONS.hollow, icon: 'portal' },
  { id: 'crucible', ...DUNGEONS.crucible, icon: 'portal' },
  { id: 'eclipse', ...DUNGEONS.eclipse, icon: 'portal' },
];
export const QUESTS = [
  {
    name: 'A spark in the ashes',
    text: 'Defeat 6 creatures at the gate.',
    target: 6,
    kind: 'kill',
    gold: 35,
    xp: 100,
    hint: 'Trouble waits just north of the Hearth. Your third kill drops a better weapon.',
  },
  {
    name: 'Old roots, new courage',
    text: 'Break a realm seal or defeat the Sovereign.',
    target: 1,
    kind: 'warden',
    gold: 100,
    xp: 250,
    hint: 'Wardens wait in the Grove, Glasswaste, and northern meadow.',
  },
  {
    name: 'What the water kept',
    text: 'Defeat the keeper of the Sunken Archive.',
    target: 1,
    kind: 'archivist',
    gold: 150,
    xp: 450,
    hint: 'The teal portal lies west of the Hearth. Level 5 recommended.',
  },
  {
    name: 'At the heart of the fire',
    text: 'Defeat the Forgemother in the Ember Crucible.',
    target: 1,
    kind: 'forgemother',
    gold: 220,
    xp: 700,
    hint: 'Find the amber portal east of the Hearth. Level 10 recommended.',
  },
  {
    name: 'Keep the fire alive',
    text: 'Defeat the Ashen Sovereign at the Crown.',
    target: 1,
    kind: 'sovereign',
    gold: 500,
    xp: 1500,
    hint: 'Defeat all three realm wardens to break the Sovereign’s seal.',
  },
  {
    name: 'The world is still yours',
    text: 'Reach level 20 and prepare for the Elder Convergence.',
    target: 20,
    kind: 'level',
    gold: 500,
    xp: 0,
    hint: 'The violet portal south of the Hearth awakens after your first Sovereign victory.',
  },
  {
    name: 'Beyond the last horizon',
    text: 'Defeat Vesper and complete the Elder Convergence.',
    target: 1,
    kind: 'nullelder',
    gold: 700,
    xp: 0,
    hint: 'Three elders. Five encounters. Return to each lit altar to advance.',
  },
  {
    name: 'A deeper kind of dawn',
    text: 'Complete Elder depth 3.',
    target: 3,
    kind: 'depth',
    gold: 900,
    xp: 0,
    hint: 'Choose a depth in your journey. Each clear unlocks the next, up to 12.',
  },
];
export interface EnemyDef {
  name: string;
  hp: number;
  damage: number;
  speed: number;
  radius: number;
  range: number;
  rate: number;
  xp: number;
  tier: number;
  pattern: 'aim' | 'fan' | 'ring' | 'spiral' | 'burst';
  color: string;
  boss?: boolean;
  elder?: boolean;
  lore: string;
}
export const ENEMIES: Record<string, EnemyDef> = {
  tideelder: {
    name: 'Thalassa, Elder of Tides',
    hp: 18000,
    damage: 38,
    speed: 0.7,
    radius: 2.6,
    range: 38,
    rate: 1.8,
    xp: 2200,
    tier: 6,
    pattern: 'ring',
    color: '#8fe3ef',
    boss: true,
    elder: true,
    lore: 'She remembers the ocean before there were shores. Every tide is an attempt to bring it back.',
  },
  cinderelder: {
    name: 'Pyra, Elder of Cinders',
    hp: 22000,
    damage: 42,
    speed: 0.8,
    radius: 2.8,
    range: 38,
    rate: 1.85,
    xp: 2600,
    tier: 6,
    pattern: 'burst',
    color: '#ffbd81',
    boss: true,
    elder: true,
    lore: 'The Forgemother borrowed her flame. Pyra has crossed the dark to reclaim it.',
  },
  nullelder: {
    name: 'Vesper, Elder of Silence',
    hp: 28000,
    damage: 44,
    speed: 0.6,
    radius: 3,
    range: 40,
    rate: 1.8,
    xp: 3200,
    tier: 6,
    pattern: 'spiral',
    color: '#d0b4ff',
    boss: true,
    elder: true,
    lore: 'In the space between stars, something listened. Now it has learned to answer.',
  },
  cinderling: {
    name: 'Cinderling',
    hp: 56,
    damage: 14,
    speed: 2.2,
    radius: 0.65,
    range: 12,
    rate: 2.5,
    xp: 24,
    tier: 1,
    pattern: 'aim',
    color: '#e9aa70',
    lore: 'A coal that forgot how to go out. It follows the warmth of living things.',
  },
  thornling: {
    name: 'Thornling',
    hp: 82,
    damage: 16,
    speed: 1.4,
    radius: 0.8,
    range: 17,
    rate: 2.8,
    xp: 32,
    tier: 1,
    pattern: 'fan',
    color: '#a8bf7b',
    lore: 'The orchard’s last guardians, still defending trees that burned long ago.',
  },
  wisp: {
    name: 'Hollow Wisp',
    hp: 145,
    damage: 23,
    speed: 2.7,
    radius: 0.6,
    range: 20,
    rate: 2.3,
    xp: 42,
    tier: 2,
    pattern: 'spiral',
    color: '#91d8d2',
    lore: 'Unfinished thoughts, set adrift when the Archive sank.',
  },
  scarab: {
    name: 'Glass Scarab',
    hp: 200,
    damage: 28,
    speed: 2,
    radius: 0.85,
    range: 20,
    rate: 2.3,
    xp: 58,
    tier: 3,
    pattern: 'fan',
    color: '#e2bc8a',
    lore: 'Their mirrored shells contain the sunrise from the day the world ended.',
  },
  watcher: {
    name: 'Ash Watcher',
    hp: 300,
    damage: 32,
    speed: 1.5,
    radius: 0.9,
    range: 22,
    rate: 2.8,
    xp: 85,
    tier: 4,
    pattern: 'ring',
    color: '#c0a4d7',
    lore: 'They kept their vigil through the fire. No one told them the war was over.',
  },
  rootwarden: {
    name: 'The Rootbound',
    hp: 3200,
    damage: 25,
    speed: 1.1,
    radius: 1.9,
    range: 25,
    rate: 1.9,
    xp: 350,
    tier: 2,
    pattern: 'ring',
    color: '#afce92',
    boss: true,
    lore: 'The oldest tree gave up its roots to search for rain. It has found only ash.',
  },
  glasswarden: {
    name: 'The Glass Colossus',
    hp: 5100,
    damage: 32,
    speed: 1.2,
    radius: 2,
    range: 26,
    rate: 1.7,
    xp: 500,
    tier: 3,
    pattern: 'fan',
    color: '#efbd7f',
    boss: true,
    lore: 'A giant cast in the heat of a dying star. Every step grinds a century to dust.',
  },
  duskwarden: {
    name: 'The Dusk Herald',
    hp: 4000,
    damage: 28,
    speed: 1.5,
    radius: 1.7,
    range: 26,
    rate: 1.6,
    xp: 450,
    tier: 2,
    pattern: 'spiral',
    color: '#b6a0d1',
    boss: true,
    lore: 'It once rang the bells for evening prayers. Now it announces the end of all things.',
  },
  archivist: {
    name: 'The Drowned Archivist',
    hp: 8000,
    damage: 28,
    speed: 0.8,
    radius: 2,
    range: 32,
    rate: 1.4,
    xp: 900,
    tier: 3,
    pattern: 'spiral',
    color: '#8ae1dd',
    boss: true,
    lore: 'Every book was saved. Every reader was lost. The keeper sees no difference now.',
  },
  forgemother: {
    name: 'The Forgemother',
    hp: 12500,
    damage: 36,
    speed: 1,
    radius: 2.3,
    range: 34,
    rate: 1.5,
    xp: 1400,
    tier: 4,
    pattern: 'burst',
    color: '#f0ad79',
    boss: true,
    lore: 'She forged a sun to keep her children warm. She is still trying to mend it.',
  },
  sovereign: {
    name: 'The Ashen Sovereign',
    hp: 26000,
    damage: 42,
    speed: 0.9,
    radius: 2.7,
    range: 38,
    rate: 1.25,
    xp: 3000,
    tier: 5,
    pattern: 'spiral',
    color: '#f0c991',
    boss: true,
    lore: 'The first to carry the flame. The last to let it go. A crown is just another kind of kindling.',
  },
};
export function xpForLevel(level: number) {
  return Math.round(50 + level * 24 + level * level * 4);
}
/** The place at a point. Kept under its original name; `placeAt` is the full record. */
export const zoneAt = placeAt;
export function isSafe(p: Vec, dimension: Dimension) {
  return dimension === 'wilds' && Math.hypot(p.x - HAVEN.x, p.z - HAVEN.z) < HAVEN.radius;
}
export function distance(a: Vec, b: Vec) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
export const SHOP: {
  id: string;
  name: string;
  cost: number;
  description: string;
  slot?: Slot;
  icon: string;
}[] = [
  {
    id: 'potion',
    name: 'Hearth tonic',
    cost: 12,
    description: 'Restore 45% health. Carry up to 5.',
    icon: 'potion',
  },
  {
    id: 'weapon',
    name: 'Starforged weapon',
    cost: 90,
    description: 'Tier 2 Verdant weapon. +14 power.',
    slot: 'weapon',
    icon: 'sword',
  },
  {
    id: 'armor',
    name: 'Waykeeper’s mantle',
    cost: 75,
    description: 'Tier 2 Verdant armor. +70 health and damage reduction.',
    slot: 'armor',
    icon: 'armor',
  },
  {
    id: 'charm',
    name: 'A little remaining light',
    cost: 65,
    description: 'Tier 2 Verdant charm. +35 mana and faster recovery.',
    slot: 'charm',
    icon: 'spark',
  },
];
