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
import { ensureLegacy, legacyOf, MAX_DEPTH, relicCost } from '../shared/endgame.js';
import { attackPlan } from '../shared/patterns.js';
import {
  combatStats,
  weaponShots,
  hasTrait,
  chainMultiplier,
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
  MAX_INVENTORY,
  MAX_LEVEL,
  MAX_PLAYERS,
  MAX_VAULT,
  QUESTS,
  SHOP,
  distance,
  isSafe,
  zoneAt,
} from '../shared/content.js';
import { canMove, inBounds, move, random } from '../shared/world.js';
import { WANDERING_STAR } from '../shared/places.js';
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
  RosterEntry,
  ServerMessage,
} from '../shared/types.js';
import { createCharacter, grantXp, makeItem, stats } from './model.js';
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
  cooldowns: { dash: number; ability: number; potion: number; travel: number };
  lastChat: number;
  lastNotice: number;
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
}
interface Drop extends LootState {
  owner: string;
}
const EMPTY_INPUT: Input = { x: 0, z: 0, angle: 0, fire: false, seq: 0 };
/** Per-zone creature budget. `baseCount` matches the fixed population before budgets existed,
 * so solo play is unchanged; extra travelers in a zone raise its target up to `cap`. */
export const SPAWN_TABLE: {
  zone: string;
  kinds: { kind: string; weight: number }[];
  baseCount: number;
  perPlayer: number;
  cap: number;
  roamRadius: number;
  anchors: { x: number; z: number }[];
}[] = [
  {
    zone: 'meadow',
    kinds: [
      { kind: 'cinderling', weight: 8 },
      { kind: 'thornling', weight: 3 },
    ],
    baseCount: 11,
    perPlayer: 0.75,
    cap: 29,
    roamRadius: 5,
    anchors: [
      { x: -11, z: -10 },
      { x: 12, z: -15 },
      { x: -9, z: -22 },
      { x: 0, z: -9 },
    ],
  },
  {
    zone: 'grove',
    kinds: [{ kind: 'wisp', weight: 1 }],
    baseCount: 12,
    perPlayer: 0.75,
    cap: 30,
    roamRadius: 22,
    anchors: [{ x: -44, z: -15 }],
  },
  {
    zone: 'glass',
    kinds: [{ kind: 'scarab', weight: 1 }],
    baseCount: 12,
    perPlayer: 0.75,
    cap: 30,
    roamRadius: 24,
    anchors: [{ x: 43, z: -22 }],
  },
  {
    zone: 'crown',
    kinds: [{ kind: 'watcher', weight: 1 }],
    baseCount: 9,
    perPlayer: 0.75,
    cap: 27,
    roamRadius: 19,
    anchors: [{ x: 0, z: -63 }],
  },
];
export const BUDGET_INTERVAL = 5;
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
  event = { active: false, remaining: 150, kills: 0, target: 12 };
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
  zoneTargets = new Map<string, number>();
  zoneKills = new Map<string, number>();
  lastRoster = -Infinity;
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
      renewal: Number.isFinite(this.resetAt) ? Math.max(0, Math.ceil(this.resetAt - this.time)) : 0,
      // At most four, once a second: enough for the atlas to show a fight in progress.
      bosses: [...this.enemies.values()]
        .filter((e) => e.boss && e.dimension === 'wilds')
        .map((e) => ({ kind: e.kind, hp: Math.max(0, Math.min(1, e.hp / e.maxHp)) })),
    };
  }
  populate() {
    for (const zone of SPAWN_TABLE) for (let i = 0; i < zone.baseCount; i++) this.spawnInZone(zone);
    // Trouble at the gate: visible from spawn, outside the sanctuary, always restored.
    for (const g of GATE_SPAWNS) this.spawn(g.kind, g.x, g.z, 'wilds', false, 'gate').fixed = true;
    for (const w of [
      ['rootwarden', -43, -20],
      ['glasswarden', 42, -25],
      ['duskwarden', 0, -35],
    ] as const)
      this.spawn(w[0], w[1], w[2], 'wilds').fixed = true;
    this.lastBudget = this.time;
  }
  spawnInZone(zone: (typeof SPAWN_TABLE)[number]) {
    const pick = this.pickSpawn(zone);
    return pick ? this.spawn(pick.kind, pick.x, pick.z, 'wilds', false, zone.zone) : undefined;
  }
  pickSpawn(zone: (typeof SPAWN_TABLE)[number]) {
    const total = zone.kinds.reduce((n, k) => n + k.weight, 0);
    let roll = this.rng() * total,
      kind = zone.kinds[0].kind;
    for (const k of zone.kinds) {
      roll -= k.weight;
      if (roll <= 0) {
        kind = k.kind;
        break;
      }
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      const anchor = zone.anchors[Math.floor(this.rng() * zone.anchors.length)];
      const a = this.rng() * Math.PI * 2,
        r = (0.3 + this.rng() * 0.7) * zone.roamRadius;
      const x = anchor.x + Math.cos(a) * r,
        z = anchor.z + Math.sin(a) * r;
      if (inBounds(x, z, 'wilds') && !isSafe({ x, z }, 'wilds')) return { kind, x, z };
    }
    return undefined;
  }
  zoneLiving(zone: string) {
    let n = 0;
    for (const e of this.enemies.values())
      if (e.zone === zone && !e.boss && !e.event && !e.runId) n++;
    return n;
  }
  /** Every five seconds: raise each zone toward `base + perPlayer × travelers`. With two or
   * more travelers present the living count is also topped up to `baseCount` at once, and
   * a staggered trickle over the next interval refills toward the target and replaces what
   * the crowd cleared, capped per interval. Solo play keeps the original counts and timers. */
  updateSpawnBudget() {
    const live = [...this.players.values()].filter(
      (p) => p.send && p.profile.character && p.dimension === 'wilds' && !isSafe(p, p.dimension),
    );
    for (const zone of SPAWN_TABLE) {
      const players = live.filter((p) => zoneAt(p.x, p.z).id === zone.zone).length;
      const target = Math.min(zone.cap, zone.baseCount + Math.floor(zone.perPlayer * players));
      this.zoneTargets.set(zone.zone, target);
      const cleared = this.zoneKills.get(zone.zone) ?? 0;
      this.zoneKills.set(zone.zone, 0);
      const living = this.zoneLiving(zone.zone),
        pending = this.respawns.filter((r) => r.zone === zone.zone && !r.fixed).length;
      let wanted = Math.max(0, target - living - pending);
      if (players >= 2) {
        wanted = Math.max(wanted, zone.baseCount - living);
        // Enough to refill to the target and replace the last interval's kills; the crowded
        // rule at respawn time discards whatever a slower crowd does not consume.
        const trickle = Math.min(zone.cap, Math.max(0, target - living) + cleared);
        for (let i = 0; i < trickle; i++) {
          const pick = this.pickSpawn(zone);
          if (pick)
            this.respawns.push({
              at: this.time + ((i + 1) * BUDGET_INTERVAL) / (trickle + 1),
              ...pick,
              dim: 'wilds',
              zone: zone.zone,
            });
        }
      }
      for (let i = 0; i < wanted; i++) this.spawnInZone(zone);
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
    if (!profile.character) profile.character = createCharacter(classId);
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
    if (action === 'rally') {
      if (!safe) {
        this.notice(p, 'Recall to the Hearth before joining an expedition.', 'bad');
        return;
      }
      if (!itemId || !Object.hasOwn(DUNGEONS, itemId)) return;
      const dim = itemId as DungeonId,
        run = this.dungeons.runs.get(dim);
      if (run?.status === 'cleared' && this.dungeons.occupants(dim).length) {
        this.notice(
          p,
          'This expedition is cleared. A new run opens after everyone recalls.',
          'info',
        );
        return;
      }
      this.enterDungeon(p, dim);
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
      p.cooldowns.dash = this.time + 2.2;
      this.effect('dash', p, cls.color, undefined, id);
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
          if (old?.locked && c.inventory.length >= MAX_INVENTORY) {
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
        } else if (c.inventory.length >= MAX_INVENTORY) {
          this.notice(p, 'Satchel full. Shift-click an item to swap gear, or drop a spare.', 'bad');
        } else {
          const collected =
            action === 'loot-all'
              ? items.splice(0, MAX_INVENTORY - c.inventory.length)
              : items.splice(index, 1);
          c.inventory.push(...collected);
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
    if ((action === 'unequip' || action === 'withdraw') && c.inventory.length >= MAX_INVENTORY) {
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
      c.inventory.length < MAX_INVENTORY
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
      const depth = Number(itemId),
        legacy = ensureLegacy(p.profile);
      if (
        !Number.isInteger(depth) ||
        depth < 1 ||
        depth > MAX_DEPTH ||
        depth > legacy.highestDepth + 1 ||
        !p.profile.victories
      ) {
        this.notice(p, 'Clear the previous Elder depth before attuning this one.', 'bad');
        return;
      }
      legacy.selectedDepth = depth;
      this.notice(
        p,
        `Attuned to Elder depth ${depth}. Applies when your group starts a new expedition.`,
        'good',
      );
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
      if (c.inventory.length >= MAX_INVENTORY) {
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
      if (p.profile.vault.length >= MAX_VAULT) {
        this.notice(p, 'Your memory vault is full.', 'bad');
        return;
      }
      p.profile.vault.push(c.inventory.splice(i, 1)[0]);
      this.notice(p, 'Stored. This memory will outlive you.', 'good');
    } else if (action === 'withdraw') {
      const i = p.profile.vault.findIndex((item) => item.id === itemId);
      if (i < 0 || c.inventory.length >= MAX_INVENTORY) return;
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
        if (c.inventory.length >= MAX_INVENTORY) {
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
      if (!item || item.tier >= 6) {
        this.notice(p, 'Equip an item below tier 6 to temper it.', 'bad');
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
        for (const shot of weaponShots(c))
          this.shot(
            p,
            p.input.angle + shot.angle,
            shot.speed,
            s.damage * shot.damage,
            p.profile.id,
            true,
            cls.range / shot.speed,
            cls.color,
            shot.radius,
            shot.pierce,
          );
        // Preserve the fractional cadence across 20 Hz ticks (e.g. Quickening at 6.25 shots/s).
        p.nextFire = (p.nextFire < this.time - dt - 1e-7 ? this.time : p.nextFire) + s.rate;
      }
    }
    for (const enemy of this.enemies.values()) this.updateEnemy(enemy, live, dt);
    for (const [id, b] of this.bullets) {
      if (b.expires < this.time) {
        this.bullets.delete(id);
        continue;
      }
      const ox = b.x,
        oz = b.z;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      if (b.friendly) {
        for (const e of this.enemies.values()) {
          if (
            e.dimension !== b.dimension ||
            b.hits.has(e.id) ||
            segmentDistance(e.x, e.z, ox, oz, b.x, b.z) > e.radius + b.radius
          )
            continue;
          b.hits.add(e.id);
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
          e.hp -= b.damage;
          e.contributors.set(b.owner, this.time);
          this.effect('hit', e, b.color, `${Math.round(b.damage)}`);
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
      this.wardens.clear();
      for (const kind of ['rootwarden', 'glasswarden', 'duskwarden']) {
        const pos =
          kind === 'rootwarden' ? [-43, -20] : kind === 'glasswarden' ? [42, -25] : [0, -35];
        this.spawn(kind, pos[0], pos[1], 'wilds');
      }
      this.resetAt = Infinity;
      this.chat('The Hearth', 'The wardens have returned. The realm begins again.', true);
    }
    this.updateHazards(live);
    this.dungeons.step();
    this.updateEvent(dt);
    if (this.tick % 2 === 0) this.broadcast();
    if (this.time - this.lastSave >= 5) {
      this.store.saveMany([...this.players.values()].map((p) => p.profile));
      for (const p of this.players.values()) this.sync(p);
      this.lastSave = this.time;
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
    if (!e.aiming) e.angle = Math.atan2(target.z - e.z, target.x - e.x);
    e.aiming = telegraph;
    if (
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
        (
          {
            cinderling: 4,
            thornling: 5,
            wisp: 7,
            scarab: 6,
            watcher: 7,
            rootwarden: 5,
            duskwarden: 7,
            glasswarden: 6,
            archivist: 7,
            forgemother: 4,
            sovereign: 8,
            tideelder: 9,
            cinderelder: 8,
            nullelder: 10,
          } as Record<string, number>
        )[e.kind],
      );
    if (e.boss && (e.attack ?? 0) % 3 === 2 && (def.elder || e.phase > 0))
      this.summonHazards(e, target);
    e.attack = (e.attack ?? 0) + 1;
    e.nextFire = this.time + def.rate * e.rateScale * (1 - e.phase * 0.12);
    e.telegraph = 0;
    e.aiming = false;
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
    if (e.event) this.event.kills++;
    if (['rootwarden', 'glasswarden', 'duskwarden'].includes(e.kind)) {
      this.wardens.add(e.kind);
      this.chat('The Hearth', `${e.name} has fallen. ${this.wardens.size}/3 seals broken.`, true);
      if (this.wardens.size === 3) {
        this.spawn('sovereign', 0, -66, 'wilds');
        this.chat('The Hearth', 'The Crown is open. The Ashen Sovereign awaits.', true);
      }
    } else if (e.kind === 'sovereign') {
      this.resetAt = this.time + 180;
      this.chat(
        'The Hearth',
        'The Sovereign has fallen. For a moment, the whole world is quiet.',
        true,
      );
    } else if (!e.event && !e.runId) {
      if (e.zone && !e.fixed) this.zoneKills.set(e.zone, (this.zoneKills.get(e.zone) ?? 0) + 1);
      this.respawns.push({
        at: this.time + (e.boss ? 150 : def.tier === 1 ? 25 : 40),
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
      if (
        !c ||
        isSafe(p, p.dimension) ||
        p.dimension !== e.dimension ||
        distance(p, e) > 38 ||
        (!e.contributors.has(p.profile.id) && distance(p, e) > 18)
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
          firstUpgrade ? 2 : Math.min(6, def.tier),
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
      if (this.rng() < 0.12 && c.potions < 5) c.potions++;
      this.sync(p, e.boss || leveled);
    }
    this.dungeons.killed(e, eligible);
  }
  enterDungeon(p: Player, dimension: DungeonId) {
    if (!this.dungeons.enter(p, dimension)) return false;
    p.epoch++;
    p.dimension = dimension;
    p.x = 0;
    p.z = 22;
    p.input = { ...EMPTY_INPUT };
    p.heldFor = 0;
    p.dashUntil = 0;
    p.lastInput = this.time;
    p.invulnerableUntil = this.time + 3;
    this.notice(p, `You entered ${DUNGEONS[dimension].name}. R returns you home.`);
    this.effect('portal', p, DUNGEONS[dimension].color);
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
  updateEvent(dt: number) {
    if (![...this.players.values()].some((p) => p.profile.character)) return;
    this.event.remaining -= dt;
    if (!this.event.active && this.event.remaining <= 0) {
      this.event = { active: true, remaining: 90, kills: 0, target: 12 };
      this.chat(
        'The Hearth',
        `A wandering star has fallen ${WANDERING_STAR.direction!.toLowerCase()}. Defeat its ${this.event.target} guardians for 10 embers.`,
        true,
      );
      this.eventWave();
    }
    if (!this.event.active) return;
    if (this.event.kills >= this.event.target) {
      for (const p of this.players.values())
        if (
          p.profile.character &&
          p.dimension === 'wilds' &&
          distance(p, WANDERING_STAR) < 40 &&
          !isSafe(p, p.dimension)
        ) {
          p.profile.embers += 10;
          p.profile.character.gold += 60;
          this.notice(p, 'Wandering star secured. +10 embers · +60 gold', 'good');
          this.sync(p, true);
        }
      this.chat('The Hearth', 'The wandering star is safe. Its light belongs to you.', true);
      this.endEvent();
    } else if (this.event.remaining <= 0) {
      this.chat('The Hearth', 'The wandering star faded. Another will fall.', true);
      this.endEvent();
    } else if (![...this.enemies.values()].some((e) => e.event)) this.eventWave();
  }
  eventWave() {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.spawn(
        i % 2 ? 'thornling' : 'wisp',
        WANDERING_STAR.x + Math.cos(a) * 7,
        WANDERING_STAR.z + Math.sin(a) * 7,
        'wilds',
        true,
      );
    }
  }
  endEvent() {
    for (const [id, e] of this.enemies) if (e.event) this.enemies.delete(id);
    this.event = { active: false, remaining: 180, kills: 0, target: 12 };
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
        players: states.filter((s) => s.id !== p.profile.id && visible(s)),
        enemies: [...this.enemies.values()]
          .filter(visible)
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
              ...e
            }) => e,
          ),
        bullets: [...this.bullets.values()]
          .filter(visible)
          .map(({ damage, expires, hits, pierce, source, ...b }) => b),
        loot: [...this.loot.values()]
          .filter((d) => d.owner === p.profile.id && visible(d))
          .map(({ owner, ...d }) => d),
        effects: this.effects.filter(visible),
        cooldowns: {
          dash: Math.max(0, p.cooldowns.dash - this.time),
          ability: Math.max(0, p.cooldowns.ability - this.time),
          potion: Math.max(0, p.cooldowns.potion - this.time),
          travel: Math.max(0, p.cooldowns.travel - this.time),
        },
        realm: this.info(),
        event: this.event,
        ...(roster ? { roster } : {}),
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
