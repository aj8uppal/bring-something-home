export type ClassId = 'arcanist' | 'ranger' | 'sentinel';
/**
 * Where a traveler is. `'wilds'` is the one shared overworld; anything else is the id of a
 * live dungeon instance, shaped `template:seed`. The three story dungeons keep their
 * template names as shorthand for the realm's current instance of each.
 */
export type Dimension = string;
/** A dungeon template: the three story dungeons, plus every drop-only door. */
export type DungeonId = string;
/** One live dungeon. Its layout is generated from the seed, identically for everyone. */
export interface Instance {
  id: string;
  template: string;
  seed: number;
  depth: number;
  modifier: string;
  /** Who opened the door, and when the door itself closes. The run outlives the portal. */
  openedBy: string;
  expiresAt: number;
}
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
    /** Keyed `template:depth`. Older saves keyed Elder depths by the bare depth number. */
    bestTimes: Record<string, number>;
    /** Deepest clear per template, which is what a depth dial is gated on. */
    bestDepths?: Record<string, number>;
    /** The depth this account has chosen to open each template at, next time. */
    selectedDepths?: Record<string, number>;
  };
}
/** A dropped door, as the atlas and the rally board see it. */
export interface PortalState extends Vec {
  id: string;
  instance: string;
  template: string;
  name: string;
  place: string;
  color: string;
  depth: number;
  remaining: number;
  population: number;
  openedBy: string;
}
export interface ExpeditionResult {
  id: string;
  /** The template, which is also what older saves stored here. */
  dimension: DungeonId;
  template?: string;
  instance?: string;
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
  /** The template, so existing callers and invitations keep working. */
  dimension: DungeonId;
  /** The live instance this listing describes, when one exists. */
  instance?: string;
  template?: string;
  name?: string;
  modifier?: string;
  status: 'empty' | DungeonState['status'];
  depth: number;
  stage: number;
  stages?: number;
  started: boolean;
  population: number;
  travelers: { name: string; classId: ClassId; level: number }[];
  /** Seconds left on the portal that opened this instance, if it was a dropped one. */
  portal?: number;
  /** Where the portal stands in the world, for the atlas. */
  x?: number;
  z?: number;
  place?: string;
  /** True for the three story dungeons, which are always available at the Hearth. */
  permanent?: boolean;
}
export interface DungeonState {
  dimension: Dimension;
  template?: string;
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
  event: import('./events.js').EventState;
  latency?: number;
  motion?: { seq: number; heldFor: number; epoch: number };
  chain?: { kills: number; remaining: number; multiplier: number };
  hunt?: { round: number; kills: number; target: number; tier: number };
  dungeon?: DungeonState;
  hazards?: HazardState[];
  expeditions?: ExpeditionListing[];
  roster?: RosterEntry[];
  /** Realm-wide setpiece state, sent with the roster once a second. */
  setpieces?: import('./setpieces.js').SetpieceState[];
  /** Doors standing open in the world right now, with the time left on each. */
  portals?: PortalState[];
  /** The setpiece the traveler is standing inside, if any. */
  setpiece?: {
    id: string;
    name: string;
    title: string;
    detail: string;
    current: number;
    total: number;
    kind: string;
  };
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
