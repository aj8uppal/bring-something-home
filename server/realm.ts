import { CHAPTER_CACHES, CHAPTER_UNLOCKS, huntContract } from '../shared/progression.js';
import {
  BAG_CAPACITY,
  BAG_REACH,
  bagItems,
  bagRepresentative,
  salvageable,
  salvageValue,
} from '../shared/loot.js';
import { Dungeons } from './dungeons.js';
import { Grid } from './grid.js';
import {
  depthCap,
  ensureLegacy,
  MODIFIERS,
  seasonModifier,
  seasonNumber,
  legacyOf,
  masteryTitle,
  MAX_DEPTH,
  relicCost,
} from '../shared/endgame.js';
import { attackPlan } from '../shared/patterns.js';
import {
  combatStats,
  weaponShots,
  hasTrait,
  chainMultiplier,
  situationalDamage,
  CHAIN_WINDOW,
  BOSS_RELICS,
} from '../shared/combat.js';
import { randomUUID } from 'node:crypto';
import {
  CLASSES,
  DUNGEONS,
  ENEMIES,
  GATE_SPAWNS,
  HAVEN,
  LANDMARKS,
  MAX_LEVEL,
  MAX_PLAYERS,
  MAX_TIER,
  QUESTS,
  SHOP,
  distance,
  isSafe,
  zoneAt,
} from '../shared/content.js';
import { canMove, inBounds, move, random, shortcutAt } from '../shared/world.js';
import { hasPerk, PERK_BY_ID, satchelSize, vaultSize } from '../shared/perks.js';
import { templateOf } from '../shared/instances.js';
import { PORTAL_DROPS, TEMPLATE_BY_ID } from '../shared/templates.js';
import {
  BIOMES,
  ECOLOGY,
  ECOLOGY_BY_PLACE,
  LIBERATION_QUOTA,
  liberationStage,
  type Ecology,
} from '../shared/biomes.js';
import { BIOME_PLACES, PLACE_BY_ID, WANDERING_STAR, type BiomeId } from '../shared/places.js';
import { EVENT_BY_ID, WORLD_EVENTS, type EventState, type WorldEvent } from '../shared/events.js';
import {
  SETPIECE_COOLDOWN,
  SETPIECE_SHAPES,
  SHAPE_BY_ID,
  type SetpieceShape,
  type SetpieceState,
} from '../shared/setpieces.js';
import { SETPIECE_SLOTS } from '../shared/places.js';
import type {
  Action,
  BulletState,
  Character,
  ClassId,
  Dimension,
  DungeonId,
  Effect,
  EnemyState,
  Input,
  Item,
  LootState,
  HazardState,
  PlayerState,
  Profile,
  RealmInfo,
  GraveMarker,
  LiberationState,
  PortalState,
  RosterEntry,
  ServerMessage,
} from '../shared/types.js';
import { createCharacter, grantXp, makeAttunement, makeItem, stats } from './model.js';
import {
  atAttunementCap,
  attunementCap,
  attunementCount,
  attunementRoll,
  ATTUNEMENT_BY_ID,
  ATTUNEMENT_SHARD_COST,
} from '../shared/attunements.js';
import type { Store } from './database.js';
export interface Player {
  profile: Profile;
  x: number;
  z: number;
  dimension: Dimension;
  input: Input;
  send: ((m: ServerMessage) => void) | null;
  disconnectedAt: number;
  lastInput: number;
  lastSeq: number;
  heldFor: number;
  epoch: number;
  chainKills: number;
  chainUntil: number;
  nextFire: number;
  dashUntil: number;
  dashX: number;
  dashZ: number;
  invulnerableUntil: number;
  /** Standing Oath: the next hit is absorbed once this has passed. */
  shieldReady: number;
  perfectDodges?: number;
  cooldowns: { dash: number; ability: number; potion: number; travel: number };
  lastChat: number;
  lastNotice: number;
  /** The party this traveler walks with. Party members share every kill in the dimension. */
  party?: string;
}
interface Enemy extends EnemyState {
  homeX: number;
  homeZ: number;
  nextFire: number;
  aiming: boolean;
  scaledFor: number;
  lastActive: number;
  born: number;
  contributors: Map<string, number>;
  event?: boolean;
  runId?: string;
  /** Spawn-budget zone (`gate` and bosses are fixed and never counted or dropped). */
  zone?: string;
  fixed?: boolean;
  /** The pack this creature travels with. Packs spawn, move, and are budgeted together. */
  packId?: string;
  summonedBy?: string;
  noRespawn?: boolean;
  /** The setpiece that owns this creature, so clearing one takes its whole encounter with it. */
  setpiece?: string;
  /** The optional side room this creature belongs to. Side rooms never gate the main run. */
  sideRoom?: number;
  nest?: boolean;
  /** Behaviour state: a charger's committed rush, a summoner's cooldown, a lantern's reach. */
  rushUntil?: number;
  nextSummon?: number;
  /** Rate multiplier granted by a nearby lantern this tick, and which lantern granted it. */
  boost?: number;
  boostFrom?: string;
  /** Damage taken during the current windup, and how long a broken attack keeps it staggered. */
  windupDamage?: number;
  breaking?: number;
  staggerUntil?: number;
  nextHazard?: number;
  healthScale: number;
  damageScale: number;
  speedScale: number;
  rateScale: number;
}
interface Bullet extends BulletState {
  damage: number;
  expires: number;
  hits: Set<string>;
  pierce: number;
  source: string;
  /** Skipstone: how many times this shot may still turn off scenery. */
  bounces?: number;
}
interface Drop extends LootState {
  owner: string;
}
const EMPTY_INPUT: Input = { x: 0, z: 0, angle: 0, fire: false, seq: 0 };
/** The ecology is the spawn table now: one row per place, packs instead of slots.
 * The island's four rows keep their original counts, weights, and spread exactly. */
export { ECOLOGY } from '../shared/biomes.js';
/** One anchor, the shape this realm gave it, and how far through it a crew has got. */
interface Setpiece {
  id: string;
  shape: SetpieceShape;
  status: 'ready' | 'active' | 'cleared';
  current: number;
  readyAt: number;
  /** Ids of the creatures this encounter owns, and the lantern posts still unlit. */
  posts: { x: number; z: number; lit: number }[];
  crew: Set<string>;
  wave: number;
  nextBeat: number;
}
/** A door something dropped, and the instance behind it. The instance outlives the door. */
export interface Portal {
  id: string;
  instance: string;
  template: string;
  name: string;
  x: number;
  z: number;
  place: string;
  color: string;
  depth: number;
  expiresAt: number;
  openedBy: string;
}
/** A group of creatures that arrived together and travels together. */
interface Pack {
  id: string;
  place: string;
  x: number;
  z: number;
  toX: number;
  toZ: number;
  roam: Ecology['roam'];
  radius: number;
}
export const BUDGET_INTERVAL = 5;
/** How long a dropped door stands open, and how many may stand open in one realm at once. */
export const PORTAL_SECONDS = 80;
export const MAX_OPEN_PORTALS = 8;
/** How fast a shielded creature can bring its front around, in radians per second. */
const BULWARK_TURN = 1.2;
/** A keeper brings its guard around more slowly than a creature does. */
const BOSS_TURN = 0.55;
/** How far ahead a dash has to be to count as perfect. Roughly a fifth of a second. */
export const PERFECT_WINDOW = 0.2;
/** How long the realm has to gather before the Crown opens. */
export const MUSTER_SECONDS = 60;
/** How many travelers may share one party's kills. */
export const MAX_PARTY = 6;
/** The widest creature in the roster, so a swept-shot query can never miss one. */
const MAX_ENEMY_RADIUS = Math.max(...Object.values(ENEMIES).map((e) => e.radius));
function segmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax,
    dz = bz - az,
    d = dx * dx + dz * dz;
  const t = d === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / d));
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}
export class Realm {
  players = new Map<string, Player>();
  enemies = new Map<string, Enemy>();
  bullets = new Map<number, Bullet>();
  loot = new Map<string, Drop>();
  effects: (Effect & { dimension: Dimension })[] = [];
  hazards = new Map<number, HazardState & { owner: string; damage: number; resolved: boolean }>();
  dungeons = new Dungeons(this);
  wardens = new Set<string>();
  time = 0;
  tick = 0;
  serial = 0;
  event: EventState = { active: false, remaining: 150, kills: 0, target: 12 };
  eventWaveIndex = 0;
  escortId?: string;
  /** The twelve outer anchors and whatever this realm decided to put in each of them. */
  setpieces = new Map<string, Setpiece>();
  respawns: {
    at: number;
    kind: string;
    x: number;
    z: number;
    dim: Dimension;
    zone?: string;
    fixed?: boolean;
  }[] = [];
  resetAt = Infinity;
  rng = random(38071);
  lastSave = 0;
  lastBudget = 0;
  packs = new Map<string, Pack>();
  /** Doors standing open in the world, keyed by the instance each one leads to. */
  portals = new Map<string, Portal>();
  /** How far each place has been taken back, and which thresholds it has crossed. */
  liberation = new Map<string, number>();
  liberationStages = new Map<string, number>();
  /** Where travelers fell. The most recent forty stand in the world where they went down. */
  graveMarkers: GraveMarker[] = [];
  /** The realm's own clock: when the Crown broke, and when this realm begins again. */
  season = seasonNumber();
  endingAt = Infinity;
  zoneTargets = new Map<string, number>();
  zoneKills = new Map<string, number>();
  lastRoster = -Infinity;
  /** Rebuilt once per broadcast so visibility is a bucket lookup, not a full scan. */
  enemyGrid = new Grid<Enemy>();
  bulletGrid = new Grid<Bullet>();
  lootGrid = new Grid<Drop>();
  playerGrid = new Grid<PlayerState>();
  constructor(
    public id: string,
    public name: string,
    public store: Store,
  ) {
    this.populate();
  }
  info(): RealmInfo {
    return {
      id: this.id,
      name: this.name,
      players: [...this.players.values()].filter((p) => p.send && p.profile.character).length,
      capacity: MAX_PLAYERS,
      wardens: this.wardens.size,
      seals: [...this.wardens],
      crown: Number.isFinite(this.resetAt)
        ? 'restoring'
        : this.wardens.size === 3
          ? 'open'
          : 'sealed',
      season: {
        number: this.season,
        modifier: seasonModifier(),
        name: MODIFIERS[seasonModifier()].name,
        description: MODIFIERS[seasonModifier()].description,
      },
      ...(Number.isFinite(this.endingAt)
        ? { ending: Math.max(0, Math.ceil(this.endingAt - this.time)) }
        : {}),
      renewal: Number.isFinite(this.resetAt) ? Math.max(0, Math.ceil(this.resetAt - this.time)) : 0,
      // At most four, once a second: enough for the atlas to show a fight in progress.
      bosses: [...this.enemies.values()]
        .filter((e) => e.boss && e.dimension === 'wilds')
        .map((e) => ({ kind: e.kind, hp: Math.max(0, Math.min(1, e.hp / e.maxHp)) })),
    };
  }
  populate() {
    for (const eco of ECOLOGY)
      for (let guard = 0; this.placeLiving(eco.place) < eco.baseCount && guard < 40; guard++)
        if (!this.spawnPack(eco)) break;
    // Trouble at the gate: visible from spawn, outside the sanctuary, always restored.
    for (const g of GATE_SPAWNS) this.spawn(g.kind, g.x, g.z, 'wilds', false, 'gate').fixed = true;
    for (const w of [
      ['rootwarden', -43, -20],
      ['glasswarden', 42, -25],
      ['duskwarden', 0, -35],
    ] as const)
      this.spawn(w[0], w[1], w[2], 'wilds').fixed = true;
    // One resident boss per outer biome, at the far shoulder of its hunting ground.
    for (const place of BIOME_PLACES) {
      const boss = BIOMES[place.id as BiomeId].boss;
      const at = ECOLOGY_BY_PLACE.get(place.id)!.anchors[3];
      this.spawn(boss.kind, at.x, at.z, 'wilds').fixed = true;
    }
    // Each realm decides for itself what stands at each of the twelve outer anchors.
    for (const slot of SETPIECE_SLOTS) {
      const shape = SETPIECE_SHAPES[Math.floor(this.rng() * SETPIECE_SHAPES.length)];
      this.setpieces.set(slot.id, {
        id: slot.id,
        shape,
        status: 'ready',
        current: 0,
        readyAt: 0,
        posts: [],
        crew: new Set(),
        wave: 0,
        nextBeat: 0,
      });
    }
    this.lastBudget = this.time;
  }
  /** How many budgeted creatures are alive in a place. Bosses, events, and runs are outside it. */
  placeLiving(place: string) {
    let n = 0;
    for (const e of this.enemies.values())
      if (e.zone === place && !e.boss && !e.event && !e.runId) n++;
    return n;
  }
  /** Kept under its original name for the budget's respawn rule. */
  zoneLiving(zone: string) {
    return this.placeLiving(zone);
  }
  pickPack(eco: Ecology) {
    const total = eco.packs.reduce((n, p) => n + p.weight, 0);
    let roll = this.rng() * total;
    for (const pack of eco.packs) {
      roll -= pack.weight;
      if (roll <= 0) return pack;
    }
    return eco.packs[eco.packs.length - 1];
  }
  /** A spot inside a place, away from the sanctuary and inside the wilds. */
  pickSpot(eco: Ecology, spread = eco.patrolRadius) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const anchor = eco.anchors[Math.floor(this.rng() * eco.anchors.length)];
      const a = this.rng() * Math.PI * 2,
        r = (0.3 + this.rng() * 0.7) * spread;
      const x = anchor.x + Math.cos(a) * r,
        z = anchor.z + Math.sin(a) * r;
      if (inBounds(x, z, 'wilds') && !isSafe({ x, z }, 'wilds')) return { x, z };
    }
    return undefined;
  }
  /**
   * One pack, landed together. A single-creature pack is exactly the old spawn: same weights,
   * same anchors, same spread, so the island's pacing is untouched.
   */
  spawnPack(eco: Ecology) {
    const pack = this.pickPack(eco),
      spot = this.pickSpot(eco);
    if (!spot) return undefined;
    const id = `p${++this.serial}`;
    const record: Pack = {
      id,
      place: eco.place,
      x: spot.x,
      z: spot.z,
      toX: spot.x,
      toZ: spot.z,
      roam: eco.roam,
      radius: eco.patrolRadius,
    };
    this.packs.set(id, record);
    const members: Enemy[] = [];
    let index = 0;
    for (const entry of pack.kinds)
      for (let i = 0; i < entry.count; i++, index++) {
        const a = (index / 5) * Math.PI * 2,
          r = index === 0 ? 0 : 1.6 + index * 0.7;
        const x = spot.x + Math.cos(a) * r,
          z = spot.z + Math.sin(a) * r;
        if (!inBounds(x, z, 'wilds') || isSafe({ x, z }, 'wilds')) continue;
        const e = this.spawn(entry.kind, x, z, 'wilds', false, eco.place);
        e.packId = id;
        members.push(e);
      }
    if (!members.length) this.packs.delete(id);
    return members.length ? members : undefined;
  }
  /**
   * Packs walk. A patrol steps between the place's anchors on a seeded loop; a wanderer
   * drifts to a new spot near one of them. Creatures leash to their pack, not to a fixed
   * point, so the clearing that held four cinder kin an hour ago holds something else now.
   */
  updatePacks(dt: number) {
    const alive = new Set<string>();
    for (const e of this.enemies.values()) if (e.packId) alive.add(e.packId);
    for (const [id, pack] of this.packs) {
      if (!alive.has(id)) {
        this.packs.delete(id);
        continue;
      }
      if (pack.roam === 'anchored') continue;
      const dx = pack.toX - pack.x,
        dz = pack.toZ - pack.z,
        d = Math.hypot(dx, dz);
      if (d < 2.5) {
        const eco = ECOLOGY_BY_PLACE.get(pack.place);
        if (!eco) continue;
        const spot =
          pack.roam === 'patrol'
            ? eco.anchors[Math.floor(this.rng() * eco.anchors.length)]
            : this.pickSpot(eco, eco.patrolRadius);
        if (spot) {
          pack.toX = spot.x;
          pack.toZ = spot.z;
        }
        continue;
      }
      const step = Math.min(d, 1.4 * dt);
      const nx = pack.x + (dx / d) * step,
        nz = pack.z + (dz / d) * step;
      if (!inBounds(nx, nz, 'wilds') || isSafe({ x: nx, z: nz }, 'wilds')) {
        pack.toX = pack.x;
        pack.toZ = pack.z;
        continue;
      }
      pack.x = nx;
      pack.z = nz;
    }
  }
  /** Every five seconds: raise each place toward `base + perPlayer × travelers`. With two or
   * more travelers present the living count is also topped up to `baseCount` at once, and
   * a staggered trickle over the next interval refills toward the target and replaces what
   * the crowd cleared, capped per interval. Solo play keeps the original counts and timers. */
  updateSpawnBudget() {
    const live = [...this.players.values()].filter(
      (p) => p.send && p.profile.character && p.dimension === 'wilds' && !isSafe(p, p.dimension),
    );
    for (const eco of ECOLOGY) {
      const players = live.filter((p) => zoneAt(p.x, p.z).id === eco.place).length;
      const target = Math.min(eco.cap, eco.baseCount + Math.floor(eco.perPlayer * players));
      this.zoneTargets.set(eco.place, target);
      const cleared = this.zoneKills.get(eco.place) ?? 0;
      this.zoneKills.set(eco.place, 0);
      const living = this.placeLiving(eco.place),
        pending = this.respawns.filter((r) => r.zone === eco.place && !r.fixed).length;
      let wanted = Math.max(0, target - living - pending);
      if (players >= 2) {
        wanted = Math.max(wanted, eco.baseCount - living);
        // Enough to refill to the target and replace the last interval's kills; the crowded
        // rule at respawn time discards whatever a slower crowd does not consume.
        const trickle = Math.min(eco.cap, Math.max(0, target - living) + cleared);
        for (let i = 0; i < trickle; i++) {
          const pick = this.pickSpot(eco);
          if (pick)
            this.respawns.push({
              at: this.time + ((i + 1) * BUDGET_INTERVAL) / (trickle + 1),
              kind: this.pickPack(eco).kinds[0].kind,
              ...pick,
              dim: 'wilds',
              zone: eco.place,
            });
        }
      }
      for (let made = 0, guard = 0; made < wanted && guard < 40; guard++) {
        const pack = this.spawnPack(eco);
        if (!pack) break;
        made += pack.length;
      }
    }
  }
  spawn(
    kind: string,
    x: number,
    z: number,
    dimension: Dimension,
    event = false,
    zone = dimension === 'wilds' ? zoneAt(x, z).id : dimension,
  ) {
    const def = ENEMIES[kind],
      id = `e${++this.serial}`;
    const e: Enemy = {
      id,
      kind,
      name: def.name,
      hp: def.hp,
      maxHp: def.hp,
      x,
      z,
      homeX: x,
      homeZ: z,
      angle: 0,
      dimension,
      radius: def.radius,
      boss: !!def.boss,
      phase: 0,
      telegraph: 0,
      attack: 0,
      aiming: false,
      scaledFor: 0,
      healthScale: 1,
      damageScale: 1,
      speedScale: 1,
      rateScale: 1,
      lastActive: this.time,
      nextFire: this.time + 1.5 + this.rng(),
      nextHazard: this.time + 4 + this.rng() * 2,
      nextSummon: this.time + 6,
      born: this.time,
      contributors: new Map(),
      event,
      zone,
    };
    this.enemies.set(id, e);
    return e;
  }
  add(profile: Profile, classId: ClassId, send: Player['send']) {
    const existing = this.players.get(profile.id);
    if (existing) {
      existing.send = send;
      existing.disconnectedAt = 0;
      existing.lastSeq = -1;
      existing.heldFor = 0;
      existing.epoch++;
      existing.input = { ...EMPTY_INPUT };
      existing.lastInput = this.time;
      this.welcome(existing);
      return existing;
    }
    if (this.players.size >= MAX_PLAYERS)
      throw new Error('This realm is full. Choose another realm.');
    if (!profile.character) {
      profile.character = createCharacter(classId);
      // A kit left ready: rebuilding after a death is quicker for an account that paid for it.
      if (hasPerk(profile, 'kit'))
        for (const slot of ['weapon', 'armor', 'charm'] as const) {
          const item = makeItem(slot, 2, 'uncommon', this.rng);
          if (slot === 'weapon') item.icon = CLASSES[classId].icon;
          profile.character.equipment[slot] = item;
        }
      profile.character.hp = stats(profile.character).maxHp;
      profile.character.mp = stats(profile.character).maxMp;
    }
    ensureLegacy(profile);
    const p: Player = {
      profile,
      x: 0,
      z: 22,
      dimension: 'wilds',
      // Face north: the trouble at the gate is the first thing in view.
      input: { ...EMPTY_INPUT, angle: -Math.PI / 2 },
      send,
      disconnectedAt: 0,
      lastInput: this.time,
      lastSeq: -1,
      heldFor: 0,
      epoch: 0,
      chainKills: 0,
      chainUntil: 0,
      nextFire: 0,
      dashUntil: 0,
      dashX: 0,
      dashZ: 0,
      invulnerableUntil: this.time + 2,
      shieldReady: 0,
      cooldowns: { dash: 0, ability: 0, potion: 0, travel: 0 },
      lastChat: -5,
      lastNotice: -5,
    };
    // Older saves predate explicit relic identities; preserve their collection credit.
    const legacy = ensureLegacy(profile);
    for (const item of [
      ...profile.vault,
      ...profile.character.inventory,
      ...Object.values(profile.character.equipment),
    ]) {
      if (!item || item.rarity !== 'relic') continue;
      const kind =
        item.relicId ?? Object.keys(BOSS_RELICS).find((k) => BOSS_RELICS[k].name === item.name);
      if (kind && BOSS_RELICS[kind]) {
        item.relicId = kind;
        if (!legacy.relics.includes(kind)) legacy.relics.push(kind);
      }
    }
    this.players.set(profile.id, p);
    this.completeJourney(p);
    this.store.save(profile);
    this.welcome(p);
    this.chat('The Hearth', `${profile.name} carries a new light into the realm.`, true);
    return p;
  }
  welcome(p: Player) {
    p.send?.({ type: 'welcome', id: p.profile.id, profile: p.profile, realm: this.info() });
  }
  disconnect(id: string) {
    const p = this.players.get(id);
    if (p) {
      p.send = null;
      p.disconnectedAt = this.time;
      p.input = { ...EMPTY_INPUT };
      this.store.save(p.profile);
    }
  }
  notice(p: Player, text: string, tone: 'good' | 'bad' | 'info' = 'info') {
    p.send?.({ type: 'notice', text, tone });
  }
  sync(p: Player, save = false) {
    if (save) this.store.save(p.profile);
    p.send?.({ type: 'profile', profile: p.profile });
  }
  chat(name: string, text: string, system = false, senderId?: string) {
    const line = { id: randomUUID(), name, text, system, senderId };
    for (const p of this.players.values()) p.send?.({ type: 'chat', line });
  }
  input(id: string, input: Input) {
    const p = this.players.get(id);
    if (!p || input.seq <= p.lastSeq) return;
    p.lastSeq = input.seq;
    p.heldFor = 0;
    p.input = input;
    p.lastInput = this.time;
  }
  effect(
    kind: Effect['kind'],
    p: { x: number; z: number; dimension: Dimension },
    color: string,
    value?: string,
    player?: string,
  ) {
    this.effects.push({
      id: ++this.serial,
      kind,
      x: p.x,
      z: p.z,
      dimension: p.dimension,
      color,
      value,
      player,
    });
  }
  shot(
    p: { x: number; z: number; dimension: Dimension },
    angle: number,
    speed: number,
    damage: number,
    owner: string,
    friendly: boolean,
    life: number,
    color: string,
    radius = 0.25,
    pierce = 0,
    source = '',
    style?: number,
    bounces = 0,
  ) {
    if (this.bullets.size >= 3000) return;
    const id = ++this.serial;
    this.bullets.set(id, {
      id,
      x: p.x + Math.cos(angle) * 0.75,
      z: p.z + Math.sin(angle) * 0.75,
      vx: Math.cos(angle) * speed,
      vz: Math.sin(angle) * speed,
      damage,
      owner,
      friendly,
      ...(style !== undefined ? { style } : {}),
      radius,
      expires: this.time + life,
      color,
      dimension: p.dimension,
      hits: new Set(),
      pierce,
      source,
      ...(bounces ? { bounces } : {}),
    });
  }
  /** Personal containers coalesce nearby rewards without moving existing items. */
  dropItems(
    owner: string,
    at: { x: number; z: number; dimension: Dimension },
    items: Item[],
    lifetime = 120,
  ) {
    for (const item of items) {
      let bag = [...this.loot.values()].find(
        (b) =>
          b.owner === owner &&
          b.dimension === at.dimension &&
          b.expires > this.time &&
          distance(b, at) < 2.6 &&
          bagItems(b).length < BAG_CAPACITY,
      );
      if (bag) {
        bag.items = [...bagItems(bag), item];
        bag.item = bagRepresentative(bag.items);
        bag.expires = Math.max(bag.expires, this.time + lifetime);
      } else {
        const id = randomUUID();
        bag = {
          id,
          item,
          items: [item],
          x: at.x,
          z: at.z,
          dimension: at.dimension,
          owner,
          expires: this.time + lifetime,
        };
        this.loot.set(id, bag);
      }
    }
  }
  updateBag(bag: Drop, items: Item[]) {
    if (!items.length) this.loot.delete(bag.id);
    else {
      bag.items = items;
      bag.item = bagRepresentative(items);
    }
  }
  action(id: string, action: Action, itemId?: string) {
    const p = this.players.get(id),
      c = p?.profile.character;
    if (!p || !c) return;
    const s = stats(c),
      safe = isSafe(p, p.dimension),
      cls = CLASSES[c.classId];
    if (action === 'track') {
      if (itemId && !Object.hasOwn(BOSS_RELICS, itemId)) return;
      p.profile.trackedRelic = itemId || undefined;
      this.sync(p, true);
      return;
    }
    if (action === 'pin') {
      // A waypoint is the player's own business; the server only remembers it.
      p.profile.pinned = itemId ? itemId.slice(0, 64) : undefined;
      this.sync(p, true);
      return;
    }
    if (action === 'travel') {
      this.travel(p, itemId);
      return;
    }
    if (action === 'party') {
      this.party(p, itemId);
      return;
    }
    if (action === 'friend') {
      if (!itemId) return;
      const list = new Set(p.profile.friends ?? []);
      const target = this.players.get(itemId);
      if (list.has(itemId)) list.delete(itemId);
      else if (target && target !== p) list.add(itemId);
      else return;
      p.profile.friends = [...list].slice(0, 60);
      this.notice(
        p,
        list.has(itemId)
          ? `${target?.profile.name ?? 'They'} is on your list. You will see when they are in a realm.`
          : 'Removed from your list.',
        'info',
      );
      this.sync(p, true);
      return;
    }
    if (action === 'rally') {
      if (!safe) {
        this.notice(p, 'Recall to the Hearth before joining an expedition.', 'bad');
        return;
      }
      // A rally names either a template or a live instance; both resolve to one door.
      if (!itemId) return;
      const template = templateOf(itemId);
      if (!TEMPLATE_BY_ID.has(template)) return;
      const run = this.dungeons.runs.get(itemId) ?? this.dungeons.run(itemId);
      if (run?.status === 'cleared' && this.dungeons.occupants(run.id).length) {
        this.notice(
          p,
          'This expedition is cleared. A new run opens after everyone recalls.',
          'info',
        );
        return;
      }
      this.enterDungeon(p, itemId);
      return;
    }
    if (action === 'recall') {
      this.recall(p);
      return;
    }
    if (action === 'dash' && p.cooldowns.dash <= this.time) {
      const norm = Math.hypot(p.input.x, p.input.z);
      p.dashX = norm > 0.1 ? p.input.x / norm : Math.cos(p.input.angle);
      p.dashZ = norm > 0.1 ? p.input.z / norm : Math.sin(p.input.angle);
      p.dashUntil = this.time + 0.2;
      p.invulnerableUntil = this.time + 0.32;
      // A perfect dodge: a shot that was about to land, left instead. The server already
      // knows every projectile's swept path, so nothing about this is a client's opinion.
      const perfect = !safe && this.wouldBeHit(p, PERFECT_WINDOW);
      p.cooldowns.dash = this.time + (perfect ? 1.35 : 2.2);
      if (perfect) {
        c.mp = Math.min(s.maxMp, c.mp + (hasTrait(c, 'grace') ? 12 : 6));
        p.perfectDodges = (p.perfectDodges ?? 0) + 1;
        this.effect('dash', p, '#eef2ff', 'PERFECT', id);
      }
      this.effect('dash', p, cls.color, undefined, id);
      // Emberwake: the dash lays a short burning line that anything crossing it walks into.
      if (hasTrait(c, 'trail'))
        for (let i = 0; i < 5; i++) {
          const at = {
            x: p.x + p.dashX * i * 1.5,
            z: p.z + p.dashZ * i * 1.5,
            dimension: p.dimension,
          };
          if (!inBounds(at.x, at.z, p.dimension)) break;
          this.shot(at, 0, 0, s.damage * 0.55, id, true, 1.4, '#f0a765', 0.85, 40, '', 4);
        }
      return;
    }
    if (action === 'ability' && p.cooldowns.ability <= this.time) {
      if (c.mp < cls.abilityCost) {
        this.notice(p, 'Your light needs a moment to recover.', 'bad');
        return;
      }
      c.mp -= cls.abilityCost;
      p.cooldowns.ability = this.time + cls.abilityCooldown;
      this.effect('ability', p, cls.color, cls.ability, id);
      if (c.classId === 'sentinel') {
        p.invulnerableUntil = this.time + 1.5;
        for (const ally of this.players.values())
          if (ally.profile.character && ally.dimension === p.dimension && distance(ally, p) < 9) {
            const a = ally.profile.character;
            a.hp = Math.min(stats(a).maxHp, a.hp + stats(a).maxHp * 0.25);
            this.effect('heal', ally, '#acd69a', '+WARD');
          }
      } else {
        const count = c.classId === 'arcanist' ? 24 : 9;
        for (let i = 0; i < count; i++)
          this.shot(
            p,
            c.classId === 'arcanist' ? (i / count) * Math.PI * 2 : p.input.angle + (i - 4) * 0.12,
            22,
            s.damage * 1.8,
            id,
            true,
            1.3,
            cls.color,
            0.32,
            3,
          );
        if (c.classId === 'ranger') p.invulnerableUntil = this.time + 0.55;
      }
      if (c.classId !== 'ranger')
        for (const [key, b] of this.bullets)
          if (!b.friendly && b.dimension === p.dimension && distance(b, p) < 7)
            this.bullets.delete(key);
      this.sync(p);
      return;
    }
    if (action === 'potion' && p.cooldowns.potion <= this.time) {
      if (!c.potions) {
        this.notice(p, 'No tonics left. Return to the Hearth to refill.', 'bad');
        return;
      }
      if (c.hp >= s.maxHp) {
        this.notice(p, 'Your health is already full.');
        return;
      }
      c.potions--;
      c.hp = Math.min(s.maxHp, c.hp + s.maxHp * 0.45);
      p.cooldowns.potion = this.time + 1;
      this.effect('heal', p, '#b8d795', '+HEALTH');
      this.sync(p, true);
      return;
    }
    if (action === 'delve') {
      this.dungeons.interact(p);
      return;
    }
    if (['loot', 'loot-all', 'loot-equip', 'interact'].includes(action)) {
      const [bagId, targetItem] = (itemId ?? '').split(':');
      const drop = [...this.loot.values()]
        .sort((a, b) => distance(p, a) - distance(p, b))
        .find(
          (d) =>
            d.owner === id &&
            d.dimension === p.dimension &&
            distance(p, d) < BAG_REACH &&
            d.expires > this.time &&
            (!bagId || d.id === bagId),
        );
      if (drop) {
        const items = [...bagItems(drop)],
          index = targetItem
            ? items.findIndex((i) => i.id === targetItem)
            : items.findIndex((i) => i.id === drop.item.id);
        if (index < 0) return;
        if (action === 'loot-equip') {
          const item = items[index],
            old = c.equipment[item.slot];
          if (old?.locked && c.inventory.length >= satchelSize(p.profile)) {
            this.notice(
              p,
              'Your equipped item is locked. Make satchel space to keep it before swapping.',
              'bad',
            );
            return;
          }
          c.equipment[item.slot] = item;
          items.splice(index, 1, ...(old && !old.locked ? [old] : []));
          if (old?.locked) c.inventory.push(old);
          this.collectRelic(p, item.relicId);
          c.hp = Math.min(c.hp, stats(c).maxHp);
          c.mp = Math.min(c.mp, stats(c).maxMp);
          this.updateBag(drop, items);
          this.notice(
            p,
            `${item.name} equipped${old ? ' · previous gear left in the bag' : ''}.`,
            'good',
          );
          this.sync(p, true);
        } else if (items[index]?.attune && action !== 'loot-all') {
          const [draught] = items.splice(index, 1);
          this.drink(p, draught);
          this.updateBag(drop, items);
          this.sync(p, true);
        } else if (c.inventory.length >= satchelSize(p.profile) && !items.some((i) => i.attune)) {
          this.notice(p, 'Satchel full. Shift-click an item to swap gear, or drop a spare.', 'bad');
        } else {
          const collected =
            action === 'loot-all'
              ? items.splice(
                  0,
                  Math.max(0, satchelSize(p.profile) - c.inventory.length) +
                    items.filter((i) => i.attune).length,
                )
              : items.splice(index, 1);
          // Draughts are drunk where they lie; they never take a satchel slot.
          for (const item of collected.filter((i) => i.attune)) this.drink(p, item);
          c.inventory.push(...collected.filter((i) => !i.attune));
          for (const item of collected) this.collectRelic(p, item.relicId);
          this.updateBag(drop, items);
          this.notice(
            p,
            collected.length === 1
              ? `${collected[0].name} collected.`
              : `${collected.length} items collected.`,
            'good',
          );
          this.sync(p, true);
        }
        return;
      }
      if (action !== 'interact') return;
      if (this.dungeons.interact(p)) return;
      if (p.dimension !== 'wilds' && distance(p, { x: 0, z: 23 }) < 5) {
        this.recall(p);
        return;
      }
      if (p.dimension === 'wilds') {
        // A door on the ground is entered exactly the way a Hearth portal is.
        const door = [...this.portals.values()]
          .filter((q) => distance(q, p) < 4.5)
          .sort((a, b) => distance(a, p) - distance(b, p))[0];
        if (door) {
          this.enterDungeon(p, door.instance);
          return;
        }
        const landmark = LANDMARKS.find((l) => distance(l, p) < 5);
        if (
          landmark?.id === 'hollow' ||
          landmark?.id === 'crucible' ||
          landmark?.id === 'eclipse'
        ) {
          this.enterDungeon(p, landmark.id);
        }
      }
      return;
    }
    if (action === 'lock' && itemId) {
      const item = [...c.inventory, ...p.profile.vault, ...Object.values(c.equipment)].find(
        (i) => i?.id === itemId,
      );
      if (!item) return;
      item.locked = !item.locked;
      this.sync(p, true);
      return;
    }
    if (action === 'drop' && itemId) {
      const index = c.inventory.findIndex((i) => i.id === itemId);
      if (index < 0) return;
      if (c.inventory[index].locked) {
        this.notice(p, 'Unlock this item before dropping it.', 'bad');
        return;
      }
      const [item] = c.inventory.splice(index, 1);
      this.dropItems(id, p, [item]);
      this.notice(p, `${item.name} left in your personal bag.`, 'info');
      this.sync(p, true);
      return;
    }
    if (
      (action === 'unequip' || action === 'withdraw') &&
      c.inventory.length >= satchelSize(p.profile)
    ) {
      this.notice(p, 'Your satchel is full. Store or salvage an item first.', 'bad');
      return;
    }
    if (action === 'equip' && itemId) {
      const index = c.inventory.findIndex((i) => i.id === itemId);
      if (index < 0) return;
      const item = c.inventory.splice(index, 1)[0],
        old = c.equipment[item.slot];
      c.equipment[item.slot] = item;
      if (old) c.inventory.push(old);
      c.hp = Math.min(c.hp, stats(c).maxHp);
      c.mp = Math.min(c.mp, stats(c).maxMp);
      this.sync(p, true);
      return;
    }
    if (
      action === 'unequip' &&
      itemId &&
      ['weapon', 'armor', 'charm'].includes(itemId) &&
      c.inventory.length < satchelSize(p.profile)
    ) {
      const slot = itemId as 'weapon' | 'armor' | 'charm',
        item = c.equipment[slot];
      if (!item) return;
      c.inventory.push(item);
      c.equipment[slot] = null;
      c.hp = Math.min(c.hp, stats(c).maxHp);
      c.mp = Math.min(c.mp, stats(c).maxMp);
      this.sync(p, true);
      return;
    }
    if (!safe) {
      if (
        ['store', 'withdraw', 'sell', 'salvage', 'buy', 'upgrade', 'attune', 'craft'].includes(
          action,
        )
      )
        this.notice(p, 'Return to the Hearth to use the vault and forge.', 'bad');
      return;
    }
    if (action === 'attune') {
      // `template:depth`, or a bare number, which older clients send for the Elder ladder.
      const [rawTemplate, rawDepth] = (itemId ?? '').includes(':')
        ? itemId!.split(':')
        : ['eclipse', itemId ?? ''];
      const template = rawTemplate,
        depth = Number(rawDepth),
        legacy = ensureLegacy(p.profile);
      const known = TEMPLATE_BY_ID.get(template);
      const best =
        template === 'eclipse'
          ? Math.max(legacy.highestDepth, legacy.bestDepths?.eclipse ?? 0)
          : (legacy.bestDepths?.[template] ?? 0);
      if (
        !known ||
        !Number.isInteger(depth) ||
        depth < 1 ||
        depth > depthCap(template) ||
        depth > best + 1 ||
        (template === 'eclipse' && !p.profile.victories)
      ) {
        this.notice(
          p,
          `Clear depth ${Math.max(1, depth - 1)} of ${known?.name ?? 'this door'} before attuning deeper.`,
          'bad',
        );
        return;
      }
      if (template === 'eclipse') legacy.selectedDepth = depth;
      legacy.selectedDepths ??= {};
      legacy.selectedDepths[template] = depth;
      this.notice(
        p,
        `Attuned to ${known.name} depth ${depth}. Applies when your group opens a new door.`,
        'good',
      );
    } else if (action === 'craft' && itemId?.startsWith('draught:')) {
      // The exchange: a floor for an unlucky traveler, at a deliberately poor rate.
      const kind = ATTUNEMENT_BY_ID.get(itemId.slice(8)),
        legacy = ensureLegacy(p.profile);
      if (!kind) return;
      if (legacy.shards < ATTUNEMENT_SHARD_COST) {
        this.notice(
          p,
          `${kind.name} costs ${ATTUNEMENT_SHARD_COST} star shards at the Smith.`,
          'bad',
        );
        return;
      }
      if (atAttunementCap(c, kind.id)) {
        this.notice(p, `${kind.label} is already at its cap for level ${c.level}.`, 'bad');
        return;
      }
      legacy.shards -= ATTUNEMENT_SHARD_COST;
      this.drink(p, { ...makeAttunement(kind.id) });
    } else if (action === 'craft') {
      const relic = BOSS_RELICS[itemId ?? ''],
        legacy = ensureLegacy(p.profile);
      if (!relic || !p.profile.discovered.includes(itemId!)) {
        this.notice(p, 'Defeat this boss to learn its relic recipe.', 'bad');
        return;
      }
      if (legacy.shards < relicCost(itemId!)) {
        this.notice(p, 'You need more star shards. Defeat bosses and complete expeditions.', 'bad');
        return;
      }
      if (c.inventory.length >= satchelSize(p.profile)) {
        this.notice(p, 'Make room in your satchel before crafting.', 'bad');
        return;
      }
      const item = makeItem(relic.slot, ENEMIES[itemId!].tier, 'relic', this.rng);
      Object.assign(item, relic, { relicId: itemId });
      if (item.slot === 'weapon') item.icon = cls.icon;
      legacy.shards -= relicCost(itemId!);
      c.inventory.push(item);
      this.collectRelic(p, itemId);
      this.notice(p, `${relic.name} reforged.`, 'good');
    } else if (action === 'store') {
      const i = c.inventory.findIndex((item) => item.id === itemId);
      if (i < 0) return;
      if (p.profile.vault.length >= vaultSize(p.profile)) {
        this.notice(p, 'Your memory vault is full.', 'bad');
        return;
      }
      p.profile.vault.push(c.inventory.splice(i, 1)[0]);
      this.notice(p, 'Stored. This memory will outlive you.', 'good');
    } else if (action === 'withdraw') {
      const i = p.profile.vault.findIndex((item) => item.id === itemId);
      if (i < 0 || c.inventory.length >= satchelSize(p.profile)) return;
      c.inventory.push(p.profile.vault.splice(i, 1)[0]);
    } else if (action === 'salvage') {
      const items = salvageable(c),
        ids = new Set(items.map((i) => i.id)),
        value = items.reduce((sum, item) => sum + salvageValue(item), 0);
      if (!items.length) {
        this.notice(p, 'No unlocked, outclassed gear to salvage.');
        return;
      }
      c.inventory = c.inventory.filter((i) => !ids.has(i.id));
      c.gold += value;
      this.notice(p, `Salvaged ${items.length} outclassed items for ${value} gold.`, 'good');
    } else if (action === 'sell') {
      const i = c.inventory.findIndex((item) => item.id === itemId);
      if (i < 0) return;
      if (c.inventory[i].locked) {
        this.notice(p, 'Unlock this item before salvaging it.', 'bad');
        return;
      }
      const item = c.inventory.splice(i, 1)[0];
      const value = salvageValue(item);
      c.gold += value;
      this.notice(p, `Salvaged for ${value} gold.`, 'good');
    } else if (action === 'buy' && itemId?.startsWith('perk:')) {
      const perk = PERK_BY_ID.get(itemId.slice(5));
      if (!perk) return;
      if (hasPerk(p.profile, perk.id)) {
        this.notice(p, `${perk.name} is already yours.`, 'info');
        return;
      }
      if (p.profile.embers < perk.cost) {
        this.notice(p, `${perk.name} costs ${perk.cost} embers.`, 'bad');
        return;
      }
      p.profile.embers -= perk.cost;
      p.profile.perks = [...(p.profile.perks ?? []), perk.id];
      this.notice(p, `${perk.name}. ${perk.description}`, 'good');
    } else if (action === 'buy') {
      const product = SHOP.find((q) => q.id === itemId);
      if (!product) return;
      if (c.gold < product.cost) {
        this.notice(p, 'You need more gold.', 'bad');
        return;
      }
      if (product.id === 'potion') {
        if (c.potions >= 5) {
          this.notice(p, 'You can carry 5 tonics.');
          return;
        }
        c.potions++;
      } else if (product.slot) {
        if (c.inventory.length >= satchelSize(p.profile)) {
          this.notice(p, 'Your satchel is full.', 'bad');
          return;
        }
        const item = makeItem(product.slot, 2, 'uncommon');
        item.name = product.name;
        item.power = 14;
        c.inventory.push(item);
      }
      c.gold -= product.cost;
      this.notice(p, `${product.name} is yours.`, 'good');
    } else if (action === 'upgrade') {
      const slot = itemId as 'weapon' | 'armor' | 'charm';
      if (!['weapon', 'armor', 'charm'].includes(slot)) return;
      const item = c.equipment[slot];
      if (!item || item.tier >= MAX_TIER) {
        this.notice(p, `Equip an item below tier ${MAX_TIER} to temper it.`, 'bad');
        return;
      }
      const cost = item.tier * 50;
      if (c.gold < cost || p.profile.embers < 5) {
        this.notice(p, `Tempering costs ${cost} gold and 5 embers.`, 'bad');
        return;
      }
      c.gold -= cost;
      p.profile.embers -= 5;
      item.tier++;
      item.power += 4;
      this.notice(p, `${item.name} tempered to tier ${item.tier}.`, 'good');
    } else return;
    this.sync(p, true);
  }
  /** True when a hostile shot would have swept over this traveler within the window. */
  wouldBeHit(p: Player, window: number) {
    // Read the live bullets, not the broadcast index: a dash happens between snapshots.
    for (const b of this.bullets.values()) {
      if (b.friendly || b.dimension !== p.dimension) continue;
      const relX = b.x - p.x,
        approach = Math.hypot(relX, b.z - p.z);
      if (approach > 26) continue;
      const relZ = b.z - p.z;
      // Closest approach of a straight shot to a stationary point, clamped to the window.
      const speed = b.vx * b.vx + b.vz * b.vz;
      if (!speed) continue;
      const t = Math.max(0, Math.min(window, -(relX * b.vx + relZ * b.vz) / speed));
      const gap = Math.hypot(relX + b.vx * t, relZ + b.vz * t);
      if (gap <= 0.4 + b.radius) return true;
    }
    return false;
  }
  /**
   * Drink a draught. Its stat rises permanently for this life, up to the cap this level
   * allows; at cap it is worth a little gold instead, so a lucky drop is never wasted.
   */
  drink(p: Player, item: Item) {
    const c = p.profile.character!,
      kind = ATTUNEMENT_BY_ID.get(item.attune ?? '');
    if (!kind) return;
    if (atAttunementCap(c, kind.id)) {
      c.gold += 25;
      this.notice(p, `${kind.name}: ${kind.label} is already at its cap. +25 gold.`, 'info');
      return;
    }
    c.attunements = { ...(c.attunements ?? {}), [kind.id]: attunementCount(c, kind.id) + 1 };
    const count = attunementCount(c, kind.id),
      cap = attunementCap(c.level);
    c.hp = Math.min(stats(c).maxHp, c.hp);
    c.mp = Math.min(stats(c).maxMp, c.mp);
    this.effect('level', p, kind.color, kind.label.toUpperCase(), p.profile.id);
    this.notice(
      p,
      count >= cap
        ? `${kind.label} is at its cap for level ${c.level}. ${kind.name} drunk.`
        : `${kind.name}. ${kind.label} ${count}/${cap} for this life.`,
      'good',
    );
  }
  recall(p: Player) {
    p.epoch++;
    p.chainKills = 0;
    p.chainUntil = 0;
    p.dimension = 'wilds';
    p.x = 0;
    p.z = 22;
    p.input = { ...EMPTY_INPUT };
    p.dashUntil = 0;
    p.invulnerableUntil = this.time + 2;
    if (p.profile.character) p.profile.character.potions = Math.max(p.profile.character.potions, 3);
    this.effect('portal', p, '#edc48e');
    this.notice(p, 'The Hearth remembers you. Health and light are recovering.', 'good');
    this.sync(p, true);
  }
  /** Travel-to: only from the sanctuary, only toward a connected traveler fighting in the wilds.
   * The actor lands two units away on the Hearth side, briefly invulnerable, then waits 20 s. */
  travel(p: Player, targetId?: string) {
    // While the realm musters, the road to the Crown is free, from wherever you are stood.
    if (targetId === 'crown' && Number.isFinite(this.endingAt)) {
      p.epoch++;
      p.dimension = 'wilds';
      p.x = (this.rng() - 0.5) * 14;
      p.z = -52 + (this.rng() - 0.5) * 6;
      p.input = { ...EMPTY_INPUT, angle: -Math.PI / 2 };
      p.heldFor = 0;
      p.dashUntil = 0;
      p.lastInput = this.time;
      p.invulnerableUntil = this.time + 3;
      this.effect('portal', p, '#e3c68c');
      this.notice(p, 'You arrive at the Crown. The sky is already changing.', 'good');
      this.sync(p);
      return true;
    }
    if (!isSafe(p, p.dimension)) {
      this.notice(p, 'Travel from the Hearth. R brings you home first.', 'bad');
      return false;
    }
    if (p.cooldowns.travel > this.time) {
      this.notice(p, `Travel again in ${Math.ceil(p.cooldowns.travel - this.time)} s.`, 'bad');
      return false;
    }
    const target = targetId ? this.players.get(targetId) : undefined,
      tc = target?.profile.character;
    if (
      !target ||
      target === p ||
      !tc ||
      !target.send ||
      target.dimension !== 'wilds' ||
      isSafe(target, target.dimension)
    ) {
      this.notice(p, 'That traveler is somewhere you can’t follow right now.', 'bad');
      return false;
    }
    const toward = Math.atan2(HAVEN.z - target.z, HAVEN.x - target.x);
    let landed = false;
    for (const offset of [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1, Math.PI]) {
      const x = target.x + Math.cos(toward + offset) * 2,
        z = target.z + Math.sin(toward + offset) * 2;
      if (canMove(x, z, 'wilds') && !isSafe({ x, z }, 'wilds')) {
        p.x = x;
        p.z = z;
        landed = true;
        break;
      }
    }
    if (!landed) {
      p.x = target.x;
      p.z = target.z;
    }
    p.dimension = 'wilds';
    p.epoch++;
    p.input = { ...EMPTY_INPUT, angle: p.input.angle };
    p.heldFor = 0;
    p.dashUntil = 0;
    p.lastInput = this.time;
    p.chainKills = 0;
    p.chainUntil = 0;
    p.invulnerableUntil = this.time + 2;
    p.cooldowns.travel = this.time + 20;
    this.effect('portal', p, CLASSES[tc.classId].color);
    this.notice(p, `You arrive beside ${target.profile.name}.`, 'good');
    this.sync(p);
    return true;
  }
  /**
   * Parties. Joining someone means sharing every kill they earn in the same dimension, at
   * any distance, and standing out on each other's maps. Leaving is the same action, empty.
   */
  party(p: Player, targetId?: string) {
    if (!targetId) {
      if (!p.party) return;
      p.party = undefined;
      this.notice(p, 'You are walking alone again.', 'info');
      return;
    }
    const target = this.players.get(targetId);
    if (!target || target === p || !target.profile.character) {
      this.notice(p, 'That traveler is not in this realm.', 'bad');
      return;
    }
    const party = (target.party ??= target.profile.id);
    const size = [...this.players.values()].filter((q) => q.party === party).length;
    if (size >= MAX_PARTY) {
      this.notice(p, `That party is full at ${MAX_PARTY}.`, 'bad');
      return;
    }
    p.party = party;
    this.notice(p, `You are walking with ${target.profile.name}. Kills are shared.`, 'good');
    for (const ally of this.players.values())
      if (ally.party === party && ally !== p)
        this.notice(ally, `${p.profile.name} is walking with you.`, 'info');
  }
  publicPlayer(p: Player): PlayerState {
    const c = p.profile.character!,
      s = stats(c);
    return {
      id: p.profile.id,
      name: p.profile.name,
      classId: c.classId,
      x: p.x,
      z: p.z,
      angle: p.input.angle,
      hp: Math.ceil(c.hp),
      maxHp: s.maxHp,
      mp: Math.floor(c.mp),
      maxMp: s.maxMp,
      level: c.level,
      dimension: p.dimension,
      safe: isSafe(p, p.dimension),
      invulnerable: this.time < p.invulnerableUntil,
      connected: !!p.send,
      attacking: p.input.fire && !isSafe(p, p.dimension),
    };
  }
  step(dt = 0.05) {
    this.time += dt;
    this.tick++;
    const live = [...this.players.values()].filter((p) => p.profile.character);
    for (const p of live) {
      const c = p.profile.character!,
        s = stats(c),
        safe = isSafe(p, p.dimension);
      if (!p.send && this.time - p.disconnectedAt > 8) {
        this.store.save(p.profile);
        this.players.delete(p.profile.id);
        continue;
      }
      if (this.time - p.lastInput > 0.35) p.input = { ...EMPTY_INPUT, angle: p.input.angle };
      p.heldFor += dt;
      if (!safe && p.dimension === 'wilds') {
        // The first arc advances on zone entry; the journal reads the same field.
        const zone = zoneAt(p.x, p.z).id;
        if (!c.visited?.includes(zone)) {
          c.visited = [...(c.visited ?? []), zone];
          this.sync(p);
        }
      }
      if (p.chainUntil < this.time) p.chainKills = 0;
      const n = Math.max(1, Math.hypot(p.input.x, p.input.z));
      const dashing = p.dashUntil > 0 && this.time <= p.dashUntil + 1e-7;
      move(
        p,
        (dashing ? p.dashX * 4 : p.input.x / n) * s.speed * dt,
        (dashing ? p.dashZ * 4 : p.input.z / n) * s.speed * dt,
        p.dimension,
      );
      c.mp = Math.min(s.maxMp, c.mp + dt * (safe ? 35 : s.regen));
      if (safe) c.hp = Math.min(s.maxHp, c.hp + dt * s.maxHp * 0.16);
      if (p.input.fire && !safe && p.nextFire <= this.time + 1e-7) {
        const cls = CLASSES[c.classId];
        const situational = situationalDamage(c, c.hp, s.maxHp);
        for (const shot of weaponShots(c))
          this.shot(
            p,
            p.input.angle + shot.angle,
            shot.speed,
            s.damage * shot.damage * situational,
            p.profile.id,
            true,
            cls.range / shot.speed,
            cls.color,
            shot.radius,
            shot.pierce,
            '',
            undefined,
            hasTrait(c, 'ricochet') ? 1 : 0,
          );
        // Preserve the fractional cadence across 20 Hz ticks (e.g. Quickening at 6.25 shots/s).
        p.nextFire = (p.nextFire < this.time - dt - 1e-7 ? this.time : p.nextFire) + s.rate;
      }
    }
    this.updatePacks(dt);
    this.updateLanterns();
    for (const enemy of this.enemies.values()) this.updateEnemy(enemy, live, dt);
    // Friendly shots test only the creatures near their swept path. With six hundred
    // creatures and three thousand shots in flight, the old full scan was the ceiling.
    this.enemyGrid.fill(this.enemies.values());
    for (const [id, b] of this.bullets) {
      if (b.expires < this.time) {
        this.bullets.delete(id);
        continue;
      }
      const ox = b.x,
        oz = b.z;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      // Rooms are rooms: inside an instance a shot stops at the wall rather than crossing
      // it. In the open wilds shots still fly over scenery, exactly as they always have.
      if (b.dimension !== 'wilds' && !b.bounces && !inBounds(b.x, b.z, b.dimension)) {
        this.bullets.delete(id);
        continue;
      }
      // Skipstone: a shot that meets scenery or the world edge turns off it once.
      if (b.bounces && !canMove(b.x, b.z, b.dimension)) {
        b.bounces--;
        b.x = ox;
        b.z = oz;
        if (canMove(ox - b.vx * dt, oz + b.vz * dt, b.dimension)) b.vx = -b.vx;
        else b.vz = -b.vz;
        b.hits.clear();
        this.effect('hit', b, b.color, undefined);
      }
      if (b.friendly) {
        const reach = Math.hypot(b.x - ox, b.z - oz) / 2 + MAX_ENEMY_RADIUS + b.radius + 0.1;
        for (const e of this.enemyGrid.near(b.dimension, (ox + b.x) / 2, (oz + b.z) / 2, reach)) {
          if (
            !this.enemies.has(e.id) ||
            b.hits.has(e.id) ||
            segmentDistance(e.x, e.z, ox, oz, b.x, b.z) > e.radius + b.radius
          )
            continue;
          b.hits.add(e.id);
          // Which side of the creature this shot came in on. A bulwark's front turns shots
          // aside; a boss's back is its core and takes more. Both are the same reading.
          const def = ENEMIES[e.kind];
          const incoming = Math.atan2(oz - e.z, ox - e.x) - e.angle;
          const off = Math.abs(Math.atan2(Math.sin(incoming), Math.cos(incoming)));
          let facing = 1;
          if (def.guard && off < def.guard) {
            // A creature's guard is absolute; a keeper's is a wall you can still chip.
            facing = e.boss ? 0.3 : 0;
            this.effect('hit', e, '#cfd6c4', 'GUARD');
            if (!e.boss) {
              if (b.pierce-- <= 0) {
                this.bullets.delete(id);
                break;
              }
              continue;
            }
          } else if (def.weak && off > def.weak.arc) {
            facing = def.weak.multiplier;
            this.effect('hit', e, '#f6e3b0', 'CORE');
          }
          if (e.boss && !e.scaledFor && e.hp === e.maxHp) {
            const allies = live.filter(
              (p) =>
                p.profile.character &&
                p.dimension === e.dimension &&
                !isSafe(p, p.dimension) &&
                distance(p, e) < 30,
            ).length;
            e.scaledFor = Math.max(1, allies);
            const multiplier = 1 + Math.pow(e.scaledFor - 1, 0.85) * 0.65;
            e.hp = e.maxHp = Math.round(ENEMIES[e.kind].hp * e.healthScale * multiplier);
          }
          const damage = b.damage * facing;
          e.hp -= damage;
          e.contributors.set(b.owner, this.time);
          this.effect('hit', e, b.color, `${Math.round(damage)}`);
          // The break window: enough damage while a boss is winding up cancels the pattern.
          const breakPoint = ENEMIES[e.kind].breakPoint;
          if (breakPoint && e.telegraph > 0 && e.hp > 0) {
            e.windupDamage = (e.windupDamage ?? 0) + damage;
            e.breaking = Math.min(1, e.windupDamage / (e.maxHp * breakPoint));
            if (e.windupDamage >= e.maxHp * breakPoint) this.breakAttack(e);
          }
          if (e.hp <= 0) this.killEnemy(e, live);
          if (b.pierce-- <= 0) {
            this.bullets.delete(id);
            break;
          }
        }
      } else {
        for (const p of live) {
          if (
            !p.profile.character ||
            p.dimension !== b.dimension ||
            isSafe(p, p.dimension) ||
            this.time < p.invulnerableUntil ||
            segmentDistance(p.x, p.z, ox, oz, b.x, b.z) > 0.4 + b.radius
          )
            continue;
          const c = p.profile.character;
          if (hasTrait(c, 'aegis') && this.time >= p.shieldReady) {
            p.shieldReady = this.time + 10;
            p.invulnerableUntil = this.time + 0.25;
            this.effect('ability', p, '#dfe6cf', 'OATH', p.profile.id);
            this.bullets.delete(id);
            break;
          }
          const damage = Math.max(1, Math.round(b.damage * (1 - stats(c).reduction)));
          c.hp -= damage;
          p.invulnerableUntil = this.time + 0.18;
          this.effect('hit', p, '#f18780', `−${damage}`, p.profile.id);
          this.bullets.delete(id);
          if (c.hp <= 0) this.die(p, b.source);
          break;
        }
      }
    }
    for (const [id, drop] of this.loot) if (drop.expires < this.time) this.loot.delete(id);
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      if (r.at <= this.time) {
        // A crowded zone topped up by the budget does not also replay every respawn.
        const crowded =
          !r.fixed &&
          r.zone !== undefined &&
          this.zoneTargets.has(r.zone) &&
          this.zoneLiving(r.zone) >= this.zoneTargets.get(r.zone)!;
        if (!crowded) this.spawn(r.kind, r.x, r.z, r.dim, false, r.zone).fixed = r.fixed;
        this.respawns.splice(i, 1);
      }
    }
    if (this.time - this.lastBudget >= BUDGET_INTERVAL) {
      this.lastBudget = this.time;
      this.updateSpawnBudget();
    }
    if (this.resetAt <= this.time) {
      this.resetAt = Infinity;
      this.reseed();
    }
    // The muster ends and the Sovereign comes out.
    if (this.endingAt <= this.time) {
      this.endingAt = Infinity;
      this.spawn('sovereign', 0, -66, 'wilds');
      this.chat('The Hearth', 'The Crown is open. The Ashen Sovereign is here.', true);
    }
    this.updateHazards(live);
    this.updateSetpieces(dt);
    this.updatePortals();
    this.dungeons.step();
    this.updateEvent(dt);
    if (this.tick % 2 === 0) this.broadcast();
    if (this.time - this.lastSave >= 5) {
      this.store.saveMany([...this.players.values()].map((p) => p.profile));
      for (const p of this.players.values()) this.sync(p);
      this.lastSave = this.time;
    }
  }
  /**
   * Lanterns feed the pack. Every creature inside one's light fires faster and is joined to
   * it by a visible line, so the correct play — kill the lit one first — is something you
   * see rather than something you are told.
   */
  updateLanterns() {
    const lanterns: Enemy[] = [];
    for (const e of this.enemies.values()) {
      e.boost = undefined;
      e.boostFrom = undefined;
      if (ENEMIES[e.kind].aura) lanterns.push(e);
    }
    if (!lanterns.length) return;
    this.enemyGrid.fill(this.enemies.values());
    for (const lantern of lanterns) {
      const aura = ENEMIES[lantern.kind].aura!;
      for (const ally of this.enemyGrid.near(
        lantern.dimension,
        lantern.x,
        lantern.z,
        aura.radius,
      )) {
        if (ally.id === lantern.id || (ally.boost ?? 1) <= aura.rate) continue;
        ally.boost = aura.rate;
        ally.boostFrom = lantern.id;
      }
    }
  }
  /**
   * Where a creature wants to stand. One pattern each keeps the bullets readable; the
   * behaviour decides the shape of the fight and which target the group has to pick first.
   */
  behave(
    e: Enemy,
    def: (typeof ENEMIES)[string],
    target: Player,
    near: number,
    dt: number,
    telegraph: boolean,
  ) {
    const pack = e.packId ? this.packs.get(e.packId) : undefined;
    const homeX = pack ? pack.x : e.homeX,
      homeZ = pack ? pack.z : e.homeZ;
    const leash = pack ? pack.radius + 8 : 9;
    const prefer = def.prefer ?? def.range * 0.55;
    let speed = def.speed,
      angle = e.angle,
      go = false;
    if (def.behaviour === 'anchor') return;
    if (def.behaviour === 'charger') {
      // Close, then commit: the rush starts on the windup and does not turn.
      if (telegraph && this.time > (e.rushUntil ?? 0) + 2.4) e.rushUntil = this.time + 0.85;
      if (this.time < (e.rushUntil ?? 0)) {
        speed = def.speed * 2.6;
        go = true;
      } else if (near > prefer) go = true;
    } else if (def.behaviour === 'kiter') {
      // Holds its range. Standing still and trading is how you lose to one of these.
      if (near < prefer * 0.82) {
        angle = e.angle + Math.PI;
        go = true;
        speed = def.speed * 1.15;
      } else if (near > prefer * 1.18) go = true;
      else {
        angle = e.angle + Math.PI / 2;
        speed = def.speed * 0.6;
        go = !telegraph;
      }
    } else if (def.behaviour === 'bulwark') {
      speed = def.speed * 0.8;
      go = near > prefer;
    } else if (def.behaviour === 'lantern') {
      if (near < 13) {
        angle = e.angle + Math.PI;
        go = true;
      } else go = near > def.range * 0.85;
    } else go = near > 7;
    if (telegraph && def.behaviour !== 'charger') go = false;
    if (!go) return;
    // The leash follows the pack, so a patrol carries its fight with it.
    if (Math.hypot(e.x - homeX, e.z - homeZ) >= leash) {
      angle = Math.atan2(homeZ - e.z, homeX - e.x);
      speed = def.speed;
    }
    const nx = e.x + Math.cos(angle) * speed * dt,
      nz = e.z + Math.sin(angle) * speed * dt;
    if (inBounds(nx, nz, e.dimension) && !isSafe({ x: nx, z: nz }, e.dimension)) {
      e.x = nx;
      e.z = nz;
    }
  }
  updateEnemy(e: Enemy, players: Player[], dt: number) {
    const def = ENEMIES[e.kind];
    let target: Player | undefined,
      near =
        e.boss && e.dimension === 'wilds' && !e.scaledFor && e.hp === e.maxHp
          ? 18
          : def.range + (def.tier === 1 ? 0 : 4);
    for (const p of players) {
      if (!p.profile.character || p.dimension !== e.dimension || isSafe(p, p.dimension)) continue;
      const d = distance(e, p);
      if (d < near) {
        near = d;
        target = p;
      }
    }
    if (!target) {
      e.telegraph = 0;
      e.aiming = false;
      e.nextFire = Math.max(e.nextFire, this.time + (e.boss ? 0.85 : 0.6));
      if (e.boss && e.scaledFor && this.time - e.lastActive > 10) {
        e.hp = (ENEMIES[e.kind].hp * e.healthScale * e.hp) / e.maxHp;
        e.maxHp = Math.round(ENEMIES[e.kind].hp * e.healthScale);
        e.scaledFor = 0;
      }
      e.hp = Math.min(e.maxHp, e.hp + dt * e.maxHp * 0.025);
      // A pack that has walked on gathers itself again; anchored creatures never move.
      const pack = e.packId ? this.packs.get(e.packId) : undefined;
      if (pack && pack.roam !== 'anchored') {
        const d = Math.hypot(pack.x - e.x, pack.z - e.z);
        if (d > 3) {
          const nx = e.x + ((pack.x - e.x) / d) * def.speed * dt,
            nz = e.z + ((pack.z - e.z) / d) * def.speed * dt;
          if (inBounds(nx, nz, e.dimension) && !isSafe({ x: nx, z: nz }, e.dimension)) {
            e.x = nx;
            e.z = nz;
            e.angle = Math.atan2(pack.z - e.z, pack.x - e.x);
          }
        }
      }
      return;
    }
    e.lastActive = this.time;
    const phase = e.hp < e.maxHp * 0.3 ? 2 : e.hp < e.maxHp * 0.65 ? 1 : 0;
    if (e.boss && phase !== e.phase) {
      e.nextFire = this.time + 1.3;
      e.aiming = false;
      this.effect('ability', e, def.color, `PHASE ${phase + 1}`);
      for (const [id, b] of this.bullets)
        if (b.owner === e.id && distance(b, e) < 8) this.bullets.delete(id);
    }
    e.phase = phase;
    const windup = def.elder ? 1 : e.boss ? 0.85 : 0.6;
    const telegraph = near <= def.range && e.nextFire - this.time <= windup;
    if (!e.aiming) {
      const want = Math.atan2(target.z - e.z, target.x - e.x);
      if (def.guard) {
        // A bulwark turns, it does not snap. Getting inside its guard is the counterplay,
        // and a lone traveler can do it by closing the distance rather than circling wide.
        const delta = Math.atan2(Math.sin(want - e.angle), Math.cos(want - e.angle));
        const turn = (e.boss ? BOSS_TURN : BULWARK_TURN) * dt;
        e.angle += Math.max(-turn, Math.min(turn, delta));
      } else e.angle = want;
    }
    // A broken attack costs the creature its next pattern and a moment on its feet.
    if (this.time < (e.staggerUntil ?? 0)) {
      e.telegraph = 0;
      e.aiming = false;
      e.nextFire = Math.max(e.nextFire, e.staggerUntil!);
      return;
    }
    if (telegraph && !e.aiming) {
      e.windupDamage = 0;
      e.breaking = 0;
    }
    if (!telegraph) e.breaking = 0;
    e.aiming = telegraph;
    if (def.behaviour) this.behave(e, def, target, near, dt, telegraph);
    else if (
      !telegraph &&
      near > (e.boss ? 13 : 7) &&
      distance(e, { x: e.homeX, z: e.homeZ }) < (e.boss ? 7 : 9)
    ) {
      const strafe = e.kind === 'wisp' ? Math.sin(this.time + e.born) * 0.8 : 0;
      const nx = e.x + Math.cos(e.angle + strafe) * def.speed * dt;
      const nz = e.z + Math.sin(e.angle + strafe) * def.speed * dt;
      if (inBounds(nx, nz, e.dimension) && !isSafe({ x: nx, z: nz }, e.dimension)) {
        e.x = nx;
        e.z = nz;
      }
    }
    // Summoners call while their brood is dead; anchors keep the floor unsafe.
    if (def.summons && this.time >= (e.nextSummon ?? 0)) {
      let alive = 0;
      for (const other of this.enemies.values()) if (other.summonedBy === e.id) alive++;
      if (alive < def.summons.count) {
        for (let i = alive; i < def.summons.count; i++) {
          const a = e.angle + Math.PI + (i - 0.5) * 0.9;
          const x = e.x + Math.cos(a) * 3.2,
            z = e.z + Math.sin(a) * 3.2;
          if (!inBounds(x, z, e.dimension) || isSafe({ x, z }, e.dimension)) continue;
          const minion = this.spawn(def.summons.kind, x, z, e.dimension, e.event, e.zone);
          minion.summonedBy = e.id;
          minion.noRespawn = true;
          minion.packId = e.packId;
          minion.runId = e.runId;
        }
        this.effect('ability', e, def.color, 'CALLED');
      }
      e.nextSummon = this.time + def.summons.cooldown;
    }
    if (def.behaviour === 'anchor' && this.time >= (e.nextHazard ?? this.time + 4)) {
      e.nextHazard = this.time + 6.5;
      this.summonHazards(e, target);
    }
    if (near > def.range) {
      e.telegraph = 0;
      e.nextFire = Math.max(e.nextFire, this.time + windup);
      return;
    }
    e.telegraph = telegraph ? Math.max(0, Math.min(1, 1 - (e.nextFire - this.time) / windup)) : 0;
    if (this.time < e.nextFire) return;
    const speed = e.boss ? 7 + e.phase * 0.7 : 5.8 + def.tier * 0.65;
    for (const shot of attackPlan(e).shots)
      this.shot(
        e,
        shot.angle,
        speed * shot.speed * e.speedScale,
        def.damage * e.damageScale,
        e.id,
        false,
        e.boss ? 4.8 : 3,
        e.phase === 2 ? '#f384c1' : '#ff865f',
        e.boss ? 0.32 : 0.26,
        0,
        def.name,
        def.style,
      );
    if (e.boss && (e.attack ?? 0) % 3 === 2 && (def.elder || e.phase > 0))
      this.summonHazards(e, target);
    e.attack = (e.attack ?? 0) + 1;
    e.nextFire = this.time + def.rate * e.rateScale * (e.boost ?? 1) * (1 - e.phase * 0.12);
    e.telegraph = 0;
    e.aiming = false;
  }
  /**
   * The twelve setpieces. Each is idle until somebody walks into it, then it is a named,
   * self-contained fight with a guaranteed bag and its own beat. Nothing here is an `if`
   * on a place: the shape decides what happens and the anchor decides where.
   */
  updateSetpieces(dt: number) {
    for (const slot of SETPIECE_SLOTS) {
      const piece = this.setpieces.get(slot.id);
      if (!piece) continue;
      if (piece.status === 'cleared') {
        if (this.time >= piece.readyAt) {
          piece.status = 'ready';
          piece.current = 0;
          piece.wave = 0;
          piece.crew.clear();
        }
        continue;
      }
      const inside = [...this.players.values()].filter(
        (p) => p.profile.character && p.dimension === 'wilds' && distance(p, slot) < slot.radius,
      );
      if (piece.status === 'ready') {
        if (!inside.length) continue;
        this.beginSetpiece(piece, slot, inside);
        continue;
      }
      for (const p of inside) piece.crew.add(p.profile.id);
      this.runSetpiece(piece, slot, inside, dt);
    }
  }
  beginSetpiece(piece: Setpiece, slot: (typeof SETPIECE_SLOTS)[number], inside: Player[]) {
    piece.status = 'active';
    piece.current = 0;
    piece.wave = 0;
    piece.posts = [];
    piece.nextBeat = this.time;
    const kinds = ECOLOGY_BY_PLACE.get(slot.parent!)!;
    const boss = BIOMES[slot.parent as BiomeId].boss.kind;
    if (piece.shape.kind === 'shrine' || piece.shape.kind === 'caravan') {
      const keeper = this.spawn(boss, slot.x, slot.z - 4, 'wilds', false, slot.parent);
      keeper.hp = keeper.maxHp = Math.round(ENEMIES[boss].hp * 0.42);
      keeper.healthScale = 0.42;
      keeper.name = `${slot.name} · ${ENEMIES[boss].name}`;
      keeper.noRespawn = true;
      keeper.fixed = true;
      keeper.setpiece = piece.id;
    } else if (piece.shape.kind === 'nest') {
      const nest = this.spawn(
        kinds.packs[0].kinds[0].kind,
        slot.x,
        slot.z,
        'wilds',
        false,
        slot.parent,
      );
      nest.hp = nest.maxHp = 5200;
      nest.name = `${slot.name} · the nest`;
      nest.radius = 2.2;
      nest.boss = true;
      nest.noRespawn = true;
      nest.fixed = true;
      nest.setpiece = piece.id;
      nest.nest = true;
    } else if (piece.shape.kind === 'lanterns') {
      for (let i = 0; i < piece.shape.count; i++) {
        const a = (i / piece.shape.count) * Math.PI * 2;
        piece.posts.push({
          x: slot.x + Math.cos(a) * slot.radius * 0.6,
          z: slot.z + Math.sin(a) * slot.radius * 0.6,
          lit: 0,
        });
      }
    }
    for (const p of inside) {
      piece.crew.add(p.profile.id);
      if (!p.profile.discovered.includes(piece.id)) {
        p.profile.discovered.push(piece.id);
        this.sync(p, true);
      }
      this.notice(p, `${slot.name}. ${piece.shape.title} — ${piece.shape.detail}`, 'info');
    }
    this.chat('The Hearth', `${slot.name} has woken. ${piece.shape.title}.`, true);
    this.effect('portal', { ...slot, dimension: 'wilds' }, slot.color);
  }
  runSetpiece(
    piece: Setpiece,
    slot: (typeof SETPIECE_SLOTS)[number],
    inside: Player[],
    dt: number,
  ) {
    const owned = [...this.enemies.values()].filter((e) => e.setpiece === piece.id);
    const eco = ECOLOGY_BY_PLACE.get(slot.parent!)!;
    if (piece.shape.kind === 'ambush') {
      // The way out burns until the last wave is down.
      if (this.time >= piece.nextBeat) {
        piece.nextBeat = this.time + 2.4;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const id = ++this.serial;
          this.hazards.set(id, {
            id,
            x: slot.x + Math.cos(a) * slot.radius,
            z: slot.z + Math.sin(a) * slot.radius,
            radius: 3.4,
            starts: this.time,
            detonates: this.time + 1.6,
            dimension: 'wilds',
            color: slot.color,
            name: 'The seal',
            owner: piece.id,
            damage: 34,
            resolved: false,
          });
        }
      }
      if (!owned.length) {
        if (piece.wave >= piece.shape.count) return this.clearSetpiece(piece, slot);
        piece.wave++;
        piece.current = piece.wave - 1;
        const pack = this.pickPack(eco);
        for (const entry of pack.kinds)
          for (let i = 0; i < entry.count + 1; i++) {
            const a = this.rng() * Math.PI * 2;
            const x = slot.x + Math.cos(a) * slot.radius * 0.8,
              z = slot.z + Math.sin(a) * slot.radius * 0.8;
            if (!inBounds(x, z, 'wilds')) continue;
            const e = this.spawn(entry.kind, x, z, 'wilds', false, slot.parent);
            e.noRespawn = true;
            e.setpiece = piece.id;
          }
      }
      return;
    }
    if (piece.shape.kind === 'lanterns') {
      // Light them all, under pressure. Standing on an unlit post is the whole job.
      for (const post of piece.posts) {
        if (post.lit >= 1) continue;
        if (inside.some((p) => distance(p, post) < 3)) post.lit = Math.min(1, post.lit + dt / 2.4);
        else post.lit = Math.max(0, post.lit - dt / 6);
      }
      piece.current = piece.posts.filter((p) => p.lit >= 1).length;
      if (this.time >= piece.nextBeat) {
        piece.nextBeat = this.time + 9;
        const pack = this.pickPack(eco);
        for (const entry of pack.kinds)
          for (let i = 0; i < entry.count; i++) {
            const a = this.rng() * Math.PI * 2;
            const x = slot.x + Math.cos(a) * slot.radius,
              z = slot.z + Math.sin(a) * slot.radius;
            if (!inBounds(x, z, 'wilds')) continue;
            const e = this.spawn(entry.kind, x, z, 'wilds', false, slot.parent);
            e.noRespawn = true;
            e.setpiece = piece.id;
          }
      }
      if (piece.current >= piece.shape.count) this.clearSetpiece(piece, slot);
      return;
    }
    if (piece.shape.kind === 'nest') {
      const nest = owned.find((e) => e.nest);
      if (!nest) return this.clearSetpiece(piece, slot);
      piece.current = Math.round((1 - nest.hp / nest.maxHp) * 100);
      if (this.time >= piece.nextBeat) {
        piece.nextBeat = this.time + 7;
        const brood = eco.packs
          .flatMap((p) => p.kinds.map((k) => k.kind))
          .find((k) => ENEMIES[k].splits);
        for (let i = 0; i < 2; i++) {
          const a = this.rng() * Math.PI * 2;
          const x = nest.x + Math.cos(a) * 5,
            z = nest.z + Math.sin(a) * 5;
          if (!inBounds(x, z, 'wilds')) continue;
          const e = this.spawn(
            brood ?? eco.packs[0].kinds[0].kind,
            x,
            z,
            'wilds',
            false,
            slot.parent,
          );
          e.noRespawn = true;
          e.setpiece = piece.id;
        }
      }
      return;
    }
    // Shrine and caravan: one keeper, and the bag it was standing over.
    const keeper = owned[0];
    if (!keeper) return this.clearSetpiece(piece, slot);
    piece.current = Math.round((1 - keeper.hp / keeper.maxHp) * 100);
  }
  clearSetpiece(piece: Setpiece, slot: (typeof SETPIECE_SLOTS)[number]) {
    piece.status = 'cleared';
    piece.readyAt = this.time + SETPIECE_COOLDOWN;
    piece.current = piece.shape.count;
    for (const [id, e] of this.enemies) if (e.setpiece === piece.id) this.enemies.delete(id);
    for (const [id, h] of this.hazards) if (h.owner === piece.id) this.hazards.delete(id);
    for (const id of piece.crew) {
      const p = this.players.get(id);
      if (!p?.profile.character || p.dimension !== 'wilds') continue;
      const bag = piece.shape.bag;
      const items = bag.slots.map((slotName) => {
        const item = makeItem(slotName, bag.tier, bag.rarity, this.rng);
        if (slotName === 'weapon') item.icon = CLASSES[p.profile.character!.classId].icon;
        return item;
      });
      this.dropItems(p.profile.id, { x: slot.x, z: slot.z, dimension: 'wilds' }, items, 240);
      p.profile.embers += 4;
      this.notice(p, `${slot.name} is quiet. A cache is on the ground.`, 'good');
      this.sync(p, true);
    }
    this.chat('The Hearth', `${slot.name} has gone quiet.`, true);
  }
  /** The banner and progress for whatever the traveler is standing in the middle of. */
  setpieceFor(p: Player) {
    if (p.dimension !== 'wilds') return undefined;
    for (const slot of SETPIECE_SLOTS) {
      if (distance(p, slot) >= slot.radius) continue;
      const piece = this.setpieces.get(slot.id);
      if (!piece || piece.status !== 'active') return undefined;
      return {
        id: slot.id,
        name: slot.name,
        title: piece.shape.title,
        detail: piece.shape.detail,
        current: piece.current,
        total: piece.shape.kind === 'lanterns' ? piece.shape.count : 100,
        kind: piece.shape.kind,
      };
    }
    return undefined;
  }
  /** What the atlas draws, and what the objective board offers. */
  setpieceStates(): SetpieceState[] {
    return SETPIECE_SLOTS.map((slot) => {
      const piece = this.setpieces.get(slot.id)!;
      return {
        id: slot.id,
        name: slot.name,
        place: slot.parent!,
        shape: piece.shape.id,
        title: piece.shape.title,
        status: piece.status,
        current: piece.current,
        total: piece.shape.kind === 'lanterns' ? piece.shape.count : 100,
        ready: Math.max(0, Math.ceil(piece.readyAt - this.time)),
        x: slot.x,
        z: slot.z,
        color: slot.color,
      };
    });
  }
  /** Cancel a winding attack, stagger the creature, and clear the shots it had started. */
  breakAttack(e: Enemy) {
    e.windupDamage = 0;
    e.breaking = 0;
    e.telegraph = 0;
    e.aiming = false;
    e.staggerUntil = this.time + 1.3;
    e.nextFire = this.time + 1.3;
    this.effect('ability', e, '#f4e3b4', 'BROKEN');
    for (const [id, b] of this.bullets)
      if (b.owner === e.id && distance(b, e) < 6) this.bullets.delete(id);
  }
  killEnemy(e: Enemy, players: Player[]) {
    if (!this.enemies.delete(e.id)) return;
    for (const [id, h] of this.hazards) if (h.owner === e.id) this.hazards.delete(id);
    this.effect(
      'kill',
      e,
      ENEMIES[e.kind].color,
      e.boss
        ? e.kind === 'sovereign'
          ? 'CROWN BROKEN'
          : e.dimension !== 'wilds'
            ? 'KEEPER FALLEN'
            : 'WARDEN FALLEN'
        : undefined,
    );
    const def = ENEMIES[e.kind];
    if (e.dimension === 'wilds' && e.zone && ECOLOGY_BY_PLACE.has(e.zone)) this.liberate(e.zone);
    if (!e.boss && !e.runId && e.dimension === 'wilds' && !e.noRespawn) this.rollPortal(e);
    if (e.setpiece && (e.nest || e.fixed)) {
      const slot = SETPIECE_SLOTS.find((s) => s.id === e.setpiece);
      const piece = this.setpieces.get(e.setpiece);
      if (slot && piece && piece.status === 'active') {
        for (const p of players)
          if (p.profile.character && distance(p, e) < 40) piece.crew.add(p.profile.id);
        this.clearSetpiece(piece, slot);
      }
    }
    // A splitter is not finished when it falls; it is halved.
    if (def.splits)
      for (let i = 0; i < def.splits.count; i++) {
        const a = (i / def.splits.count) * Math.PI * 2 + this.rng();
        const x = e.x + Math.cos(a) * 1.6,
          z = e.z + Math.sin(a) * 1.6;
        if (!inBounds(x, z, e.dimension) || isSafe({ x, z }, e.dimension)) continue;
        const child = this.spawn(def.splits.kind, x, z, e.dimension, e.event, e.zone);
        child.noRespawn = true;
        child.packId = e.packId;
        child.runId = e.runId;
        child.healthScale = e.healthScale;
        child.damageScale = e.damageScale;
        child.speedScale = e.speedScale;
        child.rateScale = e.rateScale;
        child.hp = child.maxHp = Math.round(ENEMIES[child.kind].hp * child.healthScale);
      }
    if (e.event) this.event.kills++;
    if (['rootwarden', 'glasswarden', 'duskwarden'].includes(e.kind)) {
      this.wardens.add(e.kind);
      this.chat('The Hearth', `${e.name} has fallen. ${this.wardens.size}/3 seals broken.`, true);
      if (this.wardens.size === 3) {
        // The muster: one minute, the sky turns, and the road to the Crown is free to
        // everyone in the realm. Then the Sovereign comes out and it is a raid.
        this.endingAt = this.time + MUSTER_SECONDS;
        this.chat(
          'The Hearth',
          `The third seal is broken. The Crown opens in ${MUSTER_SECONDS} seconds — travel there free, from wherever you are stood.`,
          true,
        );
      }
    } else if (e.kind === 'sovereign') {
      this.resetAt = this.time + 180;
      this.endingAt = Infinity;
      this.closeRealm();
    } else if (!e.event && !e.runId && !e.noRespawn) {
      if (e.zone && !e.fixed) this.zoneKills.set(e.zone, (this.zoneKills.get(e.zone) ?? 0) + 1);
      this.respawns.push({
        at:
          this.time +
          (e.boss
            ? BIOMES[e.zone as BiomeId]?.boss.kind === e.kind
              ? BIOMES[e.zone as BiomeId].boss.respawn
              : 150
            : def.tier === 1
              ? 25
              : 40),
        kind: e.kind,
        x: e.homeX,
        z: e.homeZ,
        dim: e.dimension,
        zone: e.zone,
        fixed: e.fixed,
      });
    }
    const eligible: Player[] = [];
    for (const p of players) {
      const c = p.profile.character;
      const sharing =
        !!p.party &&
        [...players].some((q) => q.party === p.party && e.contributors.has(q.profile.id));
      if (
        !c ||
        isSafe(p, p.dimension) ||
        p.dimension !== e.dimension ||
        (!sharing &&
          (distance(p, e) > 38 || (!e.contributors.has(p.profile.id) && distance(p, e) > 18)))
      )
        continue;
      eligible.push(p);
      c.kills++;
      p.profile.totalKills++;
      c.gold += e.boss ? def.tier * 25 : def.tier * 2 + 2;
      if (!p.profile.discovered.includes(e.kind)) p.profile.discovered.push(e.kind);
      if (e.boss) {
        if (!c.bosses.includes(e.kind)) c.bosses.push(e.kind);
        p.profile.embers += def.tier * 3;
        const legacy = ensureLegacy(p.profile);
        legacy.bossKills[e.kind] = (legacy.bossKills[e.kind] ?? 0) + 1;
        legacy.shards += def.elder ? 3 : 2;
      }
      if (e.kind === 'sovereign') p.profile.victories++;
      p.chainKills = p.chainUntil >= this.time ? p.chainKills + 1 : 1;
      p.chainUntil = this.time + CHAIN_WINDOW;
      const xp = Math.round(def.xp * chainMultiplier(p.chainKills));
      this.effect('reward', e, '#f1d79d', `+${xp} XP`, p.profile.id);
      if (hasTrait(c, 'leech')) c.hp = Math.min(stats(c).maxHp, c.hp + 3);
      let leveled = grantXp(c, xp);
      const contract = huntContract(c);
      const huntTier = contract.tier;
      const huntTarget = contract.target;
      if (def.tier >= huntTier) c.huntKills = (c.huntKills ?? 0) + 1;
      if ((c.huntKills ?? 0) >= huntTarget) {
        c.huntKills = 0;
        c.huntRound = (c.huntRound ?? 0) + 1;
        c.gold += contract.gold;
        leveled = grantXp(c, contract.xp) || leveled;
        c.potions = Math.min(5, c.potions + 1);
        p.profile.embers += huntTier * 2;
        const reward = makeItem(contract.slot, contract.rewardTier, 'rare', this.rng);
        if (reward.slot === 'weapon') reward.icon = CLASSES[c.classId].icon;
        this.dropItems(p.profile.id, e, [reward], 180);
        this.notice(
          p,
          `Hunt ${c.huntRound} complete! T${contract.rewardTier} Astral ${contract.slot} in your bag · +${contract.xp} XP · +${contract.gold} gold · +1 tonic`,
          'good',
        );
      }
      leveled = this.completeJourney(p) || leveled;
      if (leveled) {
        this.effect('level', p, '#f2d396', `LEVEL ${c.level}`, p.profile.id);
        this.notice(p, `Level ${c.level}. Health and light restored.`, 'good');
      }
      const firstUpgrade = !e.boss && c.kills === 3;
      if (firstUpgrade || e.boss || this.rng() < 0.32) {
        const roll = this.rng();
        const rarity = firstUpgrade
          ? 'uncommon'
          : e.boss
            ? roll < 0.16 || (ensureLegacy(p.profile).bossKills[e.kind] ?? 0) % 6 === 0
              ? 'relic'
              : 'rare'
            : roll < 0.025
              ? 'relic'
              : roll < 0.14
                ? 'rare'
                : roll < 0.5
                  ? 'uncommon'
                  : 'common';
        const relic = rarity === 'relic' ? BOSS_RELICS[e.kind] : undefined;
        const item = makeItem(
          relic?.slot ??
            (firstUpgrade
              ? 'weapon'
              : (['weapon', 'armor', 'charm'] as const)[Math.floor(this.rng() * 3)]),
          firstUpgrade ? 2 : Math.min(MAX_TIER, def.tier),
          rarity,
          this.rng,
        );
        if (relic) Object.assign(item, relic, { relicId: e.kind });
        item.icon = item.slot === 'weapon' ? CLASSES[c.classId].icon : item.icon;
        this.dropItems(
          p.profile.id,
          {
            x: e.x + (this.rng() - 0.5) * 2,
            z: e.z + (this.rng() - 0.5) * 2,
            dimension: e.dimension,
          },
          [item],
        );
      }
      // Keepers and biome bosses pour draughts, favouring two kinds each, and generously:
      // they are lost on death, so the ladder has to be climbable again.
      if (e.boss && this.rng() < 0.62) {
        const kind = attunementRoll(e.kind, this.rng());
        this.dropItems(
          p.profile.id,
          {
            x: e.x + (this.rng() - 0.5) * 2.4,
            z: e.z + (this.rng() - 0.5) * 2.4,
            dimension: e.dimension,
          },
          [makeAttunement(kind)],
          240,
        );
      }
      if (this.rng() < 0.12 && c.potions < 5) c.potions++;
      this.sync(p, e.boss || leveled);
    }
    this.dungeons.killed(e, eligible);
  }
  /**
   * Creatures drop doors. Hunting a family therefore means hunting for its door, and the
   * shout in realm chat that one just opened is the thing that makes a realm feel alive.
   */
  rollPortal(e: Enemy) {
    const template = PORTAL_DROPS.get(e.kind);
    if (!template || this.portals.size >= MAX_OPEN_PORTALS) return;
    if (this.rng() >= template.drops!.chance) return;
    const place = zoneAt(e.x, e.z);
    const run = this.dungeons.open(template.id, 1, 'the wilds', PORTAL_SECONDS);
    const portal: Portal = {
      id: run.id,
      instance: run.id,
      template: template.id,
      name: template.name,
      x: e.x,
      z: e.z,
      place: place.id,
      color: template.color,
      depth: 1,
      expiresAt: this.time + PORTAL_SECONDS,
      openedBy: e.name,
    };
    this.portals.set(run.id, portal);
    this.effect('portal', { x: e.x, z: e.z, dimension: 'wilds' }, template.color);
    this.chat(
      'The Hearth',
      `${template.name} has opened in ${place.name}. ${PORTAL_SECONDS} seconds before the door closes.`,
      true,
    );
  }
  /**
   * Taking a place back. Every creature put down in a place counts against its quota, and
   * the thresholds are things you can see: its setpieces stop going quiet, a second keeper
   * comes out to meet you, and finally the fog lifts and the place is yours.
   */
  liberate(place: string) {
    const kills = (this.liberation.get(place) ?? 0) + 1;
    this.liberation.set(place, kills);
    const stage = liberationStage(kills),
      before = this.liberationStages.get(place) ?? 0;
    if (stage === before) return;
    this.liberationStages.set(place, stage);
    const named = PLACE_BY_ID.get(place)?.name ?? place;
    if (stage === 1) {
      // Its setpieces stay awake: the ground it holds stops going quiet behind you.
      for (const slot of SETPIECE_SLOTS)
        if (slot.parent === place) {
          const piece = this.setpieces.get(slot.id);
          if (piece && piece.status === 'cleared')
            piece.readyAt = Math.min(piece.readyAt, this.time + 30);
        }
      this.chat(
        'The Hearth',
        `${named} is giving ground. Its ruins will not go quiet again.`,
        true,
      );
    } else if (stage === 2) {
      const biome = BIOMES[place as BiomeId];
      const eco = ECOLOGY_BY_PLACE.get(place);
      if (biome && eco) {
        const at = eco.anchors[1];
        const second = this.spawn(biome.boss.kind, at.x, at.z, 'wilds', false, place);
        second.fixed = true;
        second.name = `${ENEMIES[biome.boss.kind].name} · roused`;
        this.chat('The Hearth', `${named}: something else has come out to meet you.`, true);
      }
    } else if (stage === 3) {
      this.chat('The Hearth', `${named} is ours. The fog is lifting.`, true);
      for (const p of this.players.values())
        if (p.profile.character && zoneAt(p.x, p.z).id === place) {
          p.profile.embers += 8;
          this.notice(p, `${named} liberated. +8 embers.`, 'good');
          this.sync(p, true);
        }
    }
  }
  liberationStates(): LiberationState[] {
    return [...ECOLOGY_BY_PLACE.keys()].map((place) => {
      const kills = this.liberation.get(place) ?? 0;
      return { place, kills, quota: LIBERATION_QUOTA, stage: liberationStage(kills) };
    });
  }
  /** Doors close on their own. Nobody inside is ever moved. */
  updatePortals() {
    for (const [id, portal] of this.portals)
      if (portal.expiresAt <= this.time) {
        this.portals.delete(id);
        this.chat('The Hearth', `${portal.name} has closed.`, true);
      }
  }
  portalStates(): PortalState[] {
    return [...this.portals.values()].map((portal) => ({
      id: portal.id,
      instance: portal.instance,
      template: portal.template,
      name: portal.name,
      place: portal.place,
      color: portal.color,
      depth: portal.depth,
      x: portal.x,
      z: portal.z,
      remaining: Math.max(0, Math.ceil(portal.expiresAt - this.time)),
      population: this.dungeons.occupants(portal.instance).length,
      openedBy: portal.openedBy,
    }));
  }
  enterDungeon(p: Player, target: Dimension) {
    const run = this.dungeons.enter(p, target);
    if (!run) return false;
    const template = run.template;
    p.epoch++;
    p.dimension = run.id;
    p.x = 0;
    p.z = 22;
    p.input = { ...EMPTY_INPUT };
    p.heldFor = 0;
    p.dashUntil = 0;
    p.lastInput = this.time;
    p.invulnerableUntil = this.time + 3;
    const place = TEMPLATE_BY_ID.get(template);
    this.notice(
      p,
      `You entered ${place?.name ?? template}${run.depth > 1 ? ` · depth ${run.depth}` : ''}. R returns you home.`,
    );
    this.effect('portal', p, place?.color ?? '#edc48e');
    return true;
  }
  collectRelic(p: Player, kind?: string) {
    if (!kind || !BOSS_RELICS[kind]) return;
    const legacy = ensureLegacy(p.profile);
    if (!legacy.relics.includes(kind)) {
      legacy.relics.push(kind);
      this.notice(
        p,
        `Relic collection: ${legacy.relics.length}/${Object.keys(BOSS_RELICS).length}. This discovery survives death.`,
        'good',
      );
    }
  }
  completeJourney(p: Player) {
    const c = p.profile.character!;
    let leveled = false;
    // Credit already-earned milestones when the journey advances.
    for (let q = QUESTS[c.quest]; q; q = QUESTS[c.quest]) {
      const progress =
        q.kind === 'kill'
          ? c.kills
          : q.kind === 'level'
            ? c.level
            : q.kind === 'depth'
              ? legacyOf(p.profile).highestDepth
              : q.kind === 'warden'
                ? c.bosses.filter((k) =>
                    ['rootwarden', 'glasswarden', 'duskwarden', 'sovereign'].includes(k),
                  ).length
                : q.kind === 'nullelder'
                  ? c.clears?.includes('eclipse')
                    ? 1
                    : 0
                  : c.bosses.includes(q.kind)
                    ? 1
                    : 0;
      c.questProgress = Math.min(q.target, progress);
      if (progress < q.target) break;
      c.gold += q.gold;
      p.profile.embers += 5;
      leveled = grantXp(c, q.xp) || leveled;
      const cache = CHAPTER_CACHES[c.quest];
      const items = cache.slots.map((slot) => {
        const item = makeItem(slot, cache.tier, cache.rarity, this.rng);
        if (slot === 'weapon') item.icon = CLASSES[c.classId].icon;
        return item;
      });
      this.dropItems(p.profile.id, p, items, 180);
      const next = CHAPTER_UNLOCKS[c.quest];
      // Embers are introduced by the Cinder Smith and vault, not by the first two chapters.
      const embers = c.quest >= 2 ? ' · +5 embers' : '';
      const label = c.quest === 0 ? 'Armor and a charm' : cache.label;
      c.quest++;
      c.questProgress = 0;
      this.notice(
        p,
        `Chapter complete: ${q.name}. ${label} in your bag · +${q.gold} gold${embers}. Next: ${next}.`,
        'good',
      );
    }
    return leveled;
  }
  summonHazards(e: Enemy, target: Player) {
    const def = ENEMIES[e.kind],
      radius = def.elder ? 3.2 : 2.7;
    const positions =
      e.kind === 'cinderelder' || e.kind === 'forgemother'
        ? [-8, 0, 8].map((x) => ({ x: target.x + x, z: target.z }))
        : e.kind === 'nullelder'
          ? [0, 1, 2, 3].map((i) => ({
              x: target.x + Math.cos((i * Math.PI) / 2) * 6,
              z: target.z + Math.sin((i * Math.PI) / 2) * 6,
            }))
          : [
              { x: target.x, z: target.z },
              { x: -target.x, z: target.z - 7 },
            ];
    for (const pos of positions) {
      if (!inBounds(pos.x, pos.z, e.dimension)) continue;
      const id = ++this.serial;
      this.hazards.set(id, {
        id,
        ...pos,
        radius,
        starts: this.time,
        detonates: this.time + 1.65,
        dimension: e.dimension,
        color: def.color,
        name:
          e.kind === 'nullelder'
            ? 'Silent stars'
            : e.kind === 'cinderelder' || e.kind === 'forgemother'
              ? 'Sunfall'
              : 'Undertow',
        owner: e.id,
        damage: def.damage * e.damageScale * 1.5,
        resolved: false,
      });
    }
  }
  updateHazards(players: Player[]) {
    for (const [id, h] of this.hazards) {
      if (this.time > h.detonates + 0.35) {
        this.hazards.delete(id);
        continue;
      }
      if (this.time < h.detonates || h.resolved) continue;
      h.resolved = true;
      this.effect('ability', h, h.color, h.name);
      for (const p of players) {
        const c = p.profile.character;
        if (
          !c ||
          p.dimension !== h.dimension ||
          isSafe(p, p.dimension) ||
          this.time < p.invulnerableUntil ||
          distance(p, h) > h.radius + 0.4
        )
          continue;
        const damage = Math.round(h.damage * (1 - stats(c).reduction));
        c.hp -= damage;
        p.invulnerableUntil = this.time + 0.18;
        this.effect('hit', p, '#ff978b', `−${damage}`, p.profile.id);
        if (c.hp <= 0) this.die(p, h.name);
      }
    }
  }
  die(p: Player, cause: string) {
    const c = p.profile.character;
    if (!c) return;
    const fame = c.level * 8 + c.kills * 2 + c.bosses.length * 75;
    const grave = {
      name: p.profile.name,
      classId: c.classId,
      level: c.level,
      kills: c.kills,
      fame,
      cause: cause || 'The wilds',
      at: Date.now(),
    };
    p.profile.embers += Math.floor(fame / 10);
    p.profile.graves.unshift(grave);
    // The realm remembers where. A marker stands there until forty more have fallen.
    this.graveMarkers.unshift({
      name: grave.name,
      classId: grave.classId,
      level: grave.level,
      cause: grave.cause,
      at: grave.at,
      x: p.x,
      z: p.z,
      dimension: p.dimension,
    });
    this.graveMarkers = this.graveMarkers.slice(0, 40);
    p.profile.graves = p.profile.graves.slice(0, 20);
    p.profile.character = null;
    this.store.recordDeath(p.profile, grave);
    p.send?.({ type: 'death', grave, profile: p.profile });
    for (const [id, b] of this.bullets) if (b.owner === p.profile.id) this.bullets.delete(id);
    for (const [id, d] of this.loot) if (d.owner === p.profile.id) this.loot.delete(id);
    this.chat(
      'The Hearth',
      `${p.profile.name}’s flame faded at level ${grave.level}. Their memory remains.`,
      true,
    );
    this.players.delete(p.profile.id);
  }
  /**
   * Events are rows now. One is running at a time per realm; when it ends the next is drawn
   * from the table, placed in a biome someone can reach, and announced by name and place.
   */
  /**
   * The end of a realm. Everyone present gets the same recap — what this realm took back,
   * and what it cost — and then the whole thing begins again on a fresh seed.
   */
  closeRealm() {
    const taken = this.liberationStates().filter((l) => l.stage >= 3).length;
    const fallen = this.graveMarkers.length;
    this.chat(
      'The Hearth',
      `The Sovereign has fallen. For a moment, the whole world is quiet.`,
      true,
    );
    this.chat(
      'The Hearth',
      `This realm: ${taken} ${taken === 1 ? 'place' : 'places'} taken back, ${this.wardens.size} seals broken, ${fallen} ${fallen === 1 ? 'traveler' : 'travelers'} lost. A new realm opens in three minutes.`,
      true,
    );
    for (const p of this.players.values()) {
      if (!p.profile.character) continue;
      p.profile.embers += 20;
      this.notice(
        p,
        `The Crown is broken. ${taken} ${taken === 1 ? 'place' : 'places'} liberated · ${fallen} lost · +20 embers.`,
        'good',
      );
      this.sync(p, true);
    }
  }
  /** A fresh realm, on a fresh seed: new setpieces, new packs, and every place to take again. */
  reseed() {
    this.rng = random((Math.random() * 0xffffffff) >>> 0);
    this.wardens.clear();
    this.liberation.clear();
    this.liberationStages.clear();
    this.graveMarkers = [];
    this.packs.clear();
    for (const [id, e] of this.enemies)
      if (e.dimension === 'wilds' && !e.runId) this.enemies.delete(id);
    this.respawns = this.respawns.filter((r) => r.dim !== 'wilds');
    this.setpieces.clear();
    this.populate();
    this.endEvent();
    this.chat(
      'The Hearth',
      'The wardens have returned. The realm begins again, and it is not the realm you knew.',
      true,
    );
  }
  updateEvent(dt: number) {
    if (![...this.players.values()].some((p) => p.profile.character)) return;
    this.event.remaining -= dt;
    if (!this.event.active && this.event.remaining <= 0) {
      this.startEvent();
      return;
    }
    if (!this.event.active) return;
    const def = EVENT_BY_ID.get(this.event.id!)!;
    if (def.shape === 'procession') this.walkProcession(dt, def);
    if (this.event.kills >= this.event.target) {
      this.payEvent(def, true);
      return;
    }
    if (this.event.remaining <= 0) {
      this.chat('The Hearth', `${this.event.name} has faded. Another will come.`, true);
      this.endEvent(def);
      return;
    }
    // Procession escorts are the objective: lose the light and the event is over.
    if (def.escort && !this.enemies.has(this.escortId ?? '')) {
      this.chat('The Hearth', `${this.event.name} went out. Nothing came home.`, true);
      this.endEvent(def);
      return;
    }
    if (![...this.enemies.values()].some((e) => e.event && e.id !== this.escortId))
      this.eventWave(def);
  }
  /** Pick the next event and a place for it, weighted toward where travelers actually are.
   * A specific id may be forced, which is how the checks drive one shape at a time. */
  startEvent(forced?: string) {
    const crowd = [...this.players.values()].filter(
      (p) => p.send && p.profile.character && p.dimension === 'wilds',
    );
    const eligible = WORLD_EVENTS.filter((e) => e.id !== this.event.id);
    const def =
      (forced ? EVENT_BY_ID.get(forced) : undefined) ??
      eligible[Math.floor(this.rng() * eligible.length)] ??
      WORLD_EVENTS[0];
    const places = def.places
      .map((id) => PLACE_BY_ID.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p);
    const near = places.filter((p) => crowd.some((c) => distance(c, p) < p.radius + 70));
    const place = (near.length ? near : places)[
      Math.floor(this.rng() * (near.length ? near.length : places.length))
    ];
    const spot =
      place.id === 'meadow'
        ? WANDERING_STAR
        : (this.pickSpot(ECOLOGY_BY_PLACE.get(place.id)!, place.radius * 0.55) ?? place);
    this.event = {
      active: true,
      remaining: def.duration,
      kills: 0,
      target: def.target,
      id: def.id,
      name: def.name,
      place: place.id,
      beacon: def.beacon,
      lesson: def.lesson,
      x: spot.x,
      z: spot.z,
    };
    this.eventWaveIndex = 0;
    this.escortId = undefined;
    if (def.escort) {
      const light = this.spawn(def.escort.kind, spot.x, spot.z, 'wilds', true);
      light.hp = light.maxHp = def.escort.hp;
      light.name = `${def.name} · the light`;
      light.fixed = true;
      this.escortId = light.id;
    }
    this.chat(
      'The Hearth',
      `${def.name}: ${place.name}. ${def.lesson} Defeat ${def.target} for ${def.reward.embers} embers.`,
      true,
    );
    this.eventWave(def);
  }
  /** A procession walks toward the Hearth, and the event marker walks with it. */
  walkProcession(dt: number, def: WorldEvent) {
    const light = this.escortId ? this.enemies.get(this.escortId) : undefined;
    if (!light) return;
    const dx = HAVEN.x - light.x,
      dz = HAVEN.z - light.z,
      d = Math.hypot(dx, dz);
    if (d > HAVEN.radius + 4) {
      const step = Math.min(d, def.escort!.speed * dt);
      const nx = light.x + (dx / d) * step,
        nz = light.z + (dz / d) * step;
      if (inBounds(nx, nz, 'wilds')) {
        light.x = nx;
        light.z = nz;
        light.homeX = nx;
        light.homeZ = nz;
      }
    } else {
      this.event.kills = this.event.target;
    }
    this.event.x = light.x;
    this.event.z = light.z;
  }
  payEvent(def: WorldEvent, won: boolean) {
    for (const p of this.players.values())
      if (
        p.profile.character &&
        p.dimension === 'wilds' &&
        distance(p, { x: this.event.x ?? 0, z: this.event.z ?? 0 }) < 60 &&
        !isSafe(p, p.dimension)
      ) {
        p.profile.embers += def.reward.embers;
        p.profile.character.gold += def.reward.gold;
        if (def.reward.shards) ensureLegacy(p.profile).shards += def.reward.shards;
        this.notice(
          p,
          `${def.name} secured. +${def.reward.embers} embers · +${def.reward.gold} gold${def.reward.shards ? ` · +${def.reward.shards} shards` : ''}`,
          'good',
        );
        this.sync(p, true);
      }
    if (won) this.chat('The Hearth', `${def.name} is over. The light is yours.`, true);
    this.endEvent(def);
  }
  /** Each wave is a row. A tide lands each wave further out than the last. */
  eventWave(def: WorldEvent) {
    const wave = def.waves[Math.min(this.eventWaveIndex, def.waves.length - 1)];
    const ring = def.shape === 'tide' ? 7 + this.eventWaveIndex * 6 : 7;
    const centre = { x: this.event.x ?? 0, z: this.event.z ?? 0 };
    for (let i = 0; i < wave.count; i++) {
      const a = (i / wave.count) * Math.PI * 2 + this.eventWaveIndex * 0.4;
      const x = centre.x + Math.cos(a) * ring,
        z = centre.z + Math.sin(a) * ring;
      if (!inBounds(x, z, 'wilds') || isSafe({ x, z }, 'wilds')) continue;
      this.spawn(wave.kinds[i % wave.kinds.length], x, z, 'wilds', true);
    }
    if (def.miniBoss && this.eventWaveIndex === def.waves.length - 1)
      this.spawn(def.miniBoss, centre.x, centre.z - ring, 'wilds', true).fixed = true;
    this.eventWaveIndex++;
  }
  endEvent(def?: WorldEvent) {
    for (const [id, e] of this.enemies) if (e.event) this.enemies.delete(id);
    this.escortId = undefined;
    this.eventWaveIndex = 0;
    this.event = {
      active: false,
      remaining: def?.cooldown ?? 180,
      kills: 0,
      target: 12,
      id: def?.id,
    };
  }
  roster(): RosterEntry[] {
    return [...this.players.values()]
      .filter((p) => p.send && p.profile.character)
      .map((p) => ({
        id: p.profile.id,
        name: p.profile.name,
        classId: p.profile.character!.classId,
        level: p.profile.character!.level,
        dimension: p.dimension,
        x: p.x,
        z: p.z,
        ...(hasPerk(p.profile, 'title')
          ? { title: masteryTitle(legacyOf(p.profile).highestDepth) }
          : {}),
        ...(p.party ? { party: p.party } : {}),
      }));
  }
  broadcast() {
    const expeditions = this.dungeons.list();
    const states = [...this.players.values()]
      .filter((p) => p.profile.character)
      .map((p) => this.publicPlayer(p));
    // Realm-wide presence once a second; positions within 48 units stay at 10 Hz.
    const roster = this.time - this.lastRoster >= 1 - 1e-6 ? this.roster() : undefined;
    if (roster) this.lastRoster = this.time;
    const setpieces = roster ? this.setpieceStates() : undefined;
    const portals = roster && this.portals.size ? this.portalStates() : undefined;
    const liberation = roster ? this.liberationStates() : undefined;
    // One realm summary per broadcast, not one per traveler: it walks every creature.
    const realm = this.info();
    this.enemyGrid.fill(this.enemies.values());
    this.bulletGrid.fill(this.bullets.values());
    this.lootGrid.fill(this.loot.values());
    this.playerGrid.fill(states);
    for (const p of this.players.values()) {
      if (!p.send || !p.profile.character) continue;
      const visible = (v: { x: number; z: number; dimension: Dimension }) =>
        v.dimension === p.dimension && distance(p, v) < 48;
      p.send({
        type: 'snapshot',
        expeditions,
        dungeon: p.dimension !== 'wilds' ? this.dungeons.state(p.dimension) : undefined,
        hazards: [...this.hazards.values()]
          .filter((h) => h.dimension === p.dimension && distance(p, h) < 48)
          .map(({ owner, damage, resolved, ...h }) => h),
        motion: { seq: p.lastSeq, heldFor: p.heldFor, epoch: p.epoch },
        chain: {
          kills: p.chainKills,
          remaining: Math.max(0, p.chainUntil - this.time),
          multiplier: chainMultiplier(p.chainKills),
        },
        hunt: (() => {
          const { round, kills, target, tier } = huntContract(p.profile.character);
          return { round, kills, target, tier };
        })(),
        tick: this.tick,
        time: this.time,
        self: this.publicPlayer(p),
        players: this.playerGrid
          .near(p.dimension, p.x, p.z, 48)
          .filter((s) => s.id !== p.profile.id),
        enemies: this.enemyGrid
          .near(p.dimension, p.x, p.z, 48)
          .map(
            ({
              homeX,
              homeZ,
              nextFire,
              born,
              contributors,
              event,
              aiming,
              scaledFor,
              lastActive,
              runId,
              healthScale,
              damageScale,
              speedScale,
              rateScale,
              windupDamage,
              staggerUntil,
              packId,
              summonedBy,
              noRespawn,
              setpiece,
              nest,
              sideRoom,
              rushUntil,
              nextSummon,
              boost,
              boostFrom,
              nextHazard,
              ...e
            }) => e,
          ),
        bullets: this.bulletGrid
          .near(p.dimension, p.x, p.z, 48)
          .map(({ damage, expires, hits, pierce, source, ...b }) => b),
        loot: this.lootGrid
          .near(p.dimension, p.x, p.z, 48)
          .filter((d) => d.owner === p.profile.id)
          .map(({ owner, ...d }) => d),
        effects: this.effects.filter(visible),
        cooldowns: {
          dash: Math.max(0, p.cooldowns.dash - this.time),
          ability: Math.max(0, p.cooldowns.ability - this.time),
          potion: Math.max(0, p.cooldowns.potion - this.time),
          travel: Math.max(0, p.cooldowns.travel - this.time),
        },
        realm,
        event: this.event,
        ...(roster ? { roster } : {}),
        ...(setpieces ? { setpieces } : {}),
        ...(portals ? { portals } : {}),
        ...(liberation ? { liberation } : {}),
        ...(roster && this.graveMarkers.length
          ? { graves: this.graveMarkers.filter((g) => g.dimension === p.dimension).slice(0, 24) }
          : {}),
        ...(this.setpieceFor(p) ? { setpiece: this.setpieceFor(p) } : {}),
      });
    }
    this.effects = [];
  }
  shutdown() {
    for (const p of this.players.values()) {
      this.notice(p, 'The realm is restarting. Your character has been saved.');
      this.store.save(p.profile);
    }
  }
}
