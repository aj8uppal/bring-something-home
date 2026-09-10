export type ClassId = 'arcanist' | 'ranger' | 'sentinel';
export type Dimension = 'wilds' | 'hollow' | 'crucible' | 'eclipse';
export type DungeonId = Exclude<Dimension, 'wilds'>;
export type Slot = 'weapon' | 'armor' | 'charm';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'relic';
export interface Vec {
  x: number;
  z: number;
}
export interface Item {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  tier: number;
  power: number;
  icon: string;
  description: string;
  trait?: import('./combat.js').Trait;
  relicId?: string;
  locked?: boolean;
}
export interface Character {
  classId: ClassId;
  level: number;
  xp: number;
  hp: number;
  mp: number;
  kills: number;
  gold: number;
  potions: number;
  equipment: Record<Slot, Item | null>;
  inventory: Item[];
  quest: number;
  questProgress: number;
  bosses: string[];
  clears?: DungeonId[];
  huntRound?: number;
  huntKills?: number;
  /** Overworld zones this life has entered; the first arc advances on zone entry. */
  visited?: string[];
  startedAt: number;
}
export interface Grave {
  name: string;
  classId: ClassId;
  level: number;
  kills: number;
  fame: number;
  cause: string;
  at: number;
}
export interface Profile {
  id: string;
  name: string;
  embers: number;
  vault: Item[];
  character: Character | null;
  graves: Grave[];
  totalKills: number;
  victories: number;
  discovered: string[];
  createdAt: number;
  trackedRelic?: string;
  /** A place or goal the player pinned; outranks the chapter goal on the compass. */
  pinned?: string;
  lastExpedition?: ExpeditionResult;
  legacy?: {
    shards: number;
    highestDepth: number;
    selectedDepth: number;
    clears: number;
    bossKills: Record<string, number>;
    relics: string[];
    bestTimes: Record<string, number>;
  };
}
export interface ExpeditionResult {
  id: string;
  dimension: DungeonId;
  depth: number;
  modifier: string;
  elapsed: number;
  at: number;
  chambers: number;
  totalChambers: number;
  shards: number;
  gold: number;
  personalBest: boolean;
  crew: { name: string; classId: ClassId }[];
}
export interface ExpeditionListing {
  dimension: DungeonId;
  status: 'empty' | DungeonState['status'];
  depth: number;
  stage: number;
  started: boolean;
  population: number;
  travelers: { name: string; classId: ClassId; level: number }[];
}
export interface DungeonState {
  dimension: DungeonId;
  depth: number;
  modifier: string;
  stage: number;
  stages: number;
  name: string;
  status: 'ready' | 'active' | 'cleared';
  remaining: number;
  elapsed: number;
  altar: Vec;
  next: string;
}
export interface HazardState extends Vec {
  id: number;
  radius: number;
  starts: number;
  detonates: number;
  color: string;
  name: string;
  dimension: Dimension;
}
export interface PlayerState extends Vec {
  id: string;
  name: string;
  classId: ClassId;
  angle: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  level: number;
  dimension: Dimension;
  safe: boolean;
  invulnerable: boolean;
  connected: boolean;
  attacking: boolean;
}
/** Realm-wide 1 Hz presence for the map and travel-to; positions may be up to a second old. */
export interface RosterEntry extends Vec {
  id: string;
  name: string;
  classId: ClassId;
  level: number;
  dimension: Dimension;
}
export interface EnemyState extends Vec {
  id: string;
  kind: string;
  name: string;
  hp: number;
  maxHp: number;
  angle: number;
  radius: number;
  dimension: Dimension;
  boss: boolean;
  phase: number;
  telegraph: number;
  attack?: number;
}
export interface BulletState extends Vec {
  style?: number;
  id: number;
  vx: number;
  vz: number;
  friendly: boolean;
  radius: number;
  color: string;
  owner: string;
  dimension: Dimension;
}
export interface LootState extends Vec {
  id: string;
  /** Highest-quality item, also understood by older clients. */
  item: Item;
  items?: Item[];
  expires: number;
  dimension: Dimension;
}
export interface Effect extends Vec {
  id: number;
  kind: 'hit' | 'kill' | 'heal' | 'dash' | 'level' | 'ability' | 'portal' | 'reward';
  color: string;
  value?: string;
  player?: string;
}
export interface ChatLine {
  id: string;
  name: string;
  text: string;
  system?: boolean;
  senderId?: string;
}
export interface RealmInfo {
  id: string;
  name: string;
  players: number;
  capacity: number;
  wardens: number;
  seals?: string[];
  crown?: 'sealed' | 'open' | 'restoring';
  renewal?: number;
  /** Living overworld bosses and their health, so the atlas can show where the fight is. */
  bosses?: { kind: string; hp: number }[];
}
export interface Snapshot {
  type: 'snapshot';
  tick: number;
  time: number;
  self: PlayerState;
  players: PlayerState[];
  enemies: EnemyState[];
  bullets: BulletState[];
  loot: LootState[];
  effects: Effect[];
  cooldowns: { dash: number; ability: number; potion: number; travel?: number };
  realm: RealmInfo;
  event: { active: boolean; remaining: number; kills: number; target: number };
  latency?: number;
  motion?: { seq: number; heldFor: number; epoch: number };
  chain?: { kills: number; remaining: number; multiplier: number };
  hunt?: { round: number; kills: number; target: number; tier: number };
  dungeon?: DungeonState;
  hazards?: HazardState[];
  expeditions?: ExpeditionListing[];
  roster?: RosterEntry[];
}
export interface Input {
  x: number;
  z: number;
  angle: number;
  fire: boolean;
  seq: number;
}
export type Action =
  | 'dash'
  | 'ability'
  | 'potion'
  | 'recall'
  | 'interact'
  | 'loot'
  | 'loot-all'
  | 'loot-equip'
  | 'drop'
  | 'lock'
  | 'salvage'
  | 'equip'
  | 'unequip'
  | 'store'
  | 'withdraw'
  | 'sell'
  | 'buy'
  | 'attune'
  | 'craft'
  | 'delve'
  | 'rally'
  | 'track'
  | 'pin'
  | 'travel'
  | 'upgrade';
export type ClientMessage =
  | { type: 'join'; token: string; classId: ClassId; realm?: string }
  | { type: 'input'; input: Input }
  | { type: 'action'; action: Action; id?: string }
  | { type: 'chat'; text: string }
  | { type: 'ping'; time: number };
export type ServerMessage =
  | Snapshot
  | { type: 'welcome'; id: string; profile: Profile; realm: RealmInfo }
  | { type: 'profile'; profile: Profile }
  | { type: 'notice'; text: string; tone: 'info' | 'good' | 'bad' }
  | { type: 'chat'; line: ChatLine }
  | { type: 'death'; grave: Grave; profile: Profile }
  | { type: 'pong'; time: number }
  | { type: 'error'; text: string };
