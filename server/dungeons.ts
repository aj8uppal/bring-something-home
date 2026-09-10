import { CLASSES, DUNGEONS, ENEMIES, distance } from '../shared/content.js';
import { instanceId, templateOf } from '../shared/instances.js';
import {
  instanceEncounters,
  layoutFor,
  roomAt,
  sideEncounter,
  type Room,
} from '../shared/layout.js';
import { TEMPLATE_BY_ID } from '../shared/templates.js';
import {
  type Encounter,
  EXPEDITIONS,
  MAX_DEPTH,
  depthCap,
  MODIFIERS,
  depthScaling,
  ensureLegacy,
  type Modifier,
} from '../shared/endgame.js';
import type {
  ClassId,
  Dimension,
  DungeonId,
  DungeonState,
  ExpeditionListing,
  ExpeditionResult,
  Instance,
} from '../shared/types.js';
import type { Player, Realm } from './realm.js';
import { makeItem, stats } from './model.js';

/** The three story dungeons always exist at the Hearth and are never capped away. */
export const STORY_TEMPLATES = Object.keys(DUNGEONS);
/**
 * Scale boundaries. A realm holds at most this many live instances at once, and at most
 * this many of any one template, so a busy realm cannot be turned into unbounded state by
 * a crowd farming doors. The three story instances are always kept.
 */
export const MAX_INSTANCES = 24;
export const MAX_PER_TEMPLATE = 6;

interface Run {
  id: string;
  instance: Instance;
  template: string;
  depth: number;
  modifier: Modifier;
  stage: number;
  status: DungeonState['status'];
  started: number;
  finished: number;
  emptySince: number;
  credit: Map<string, Set<number>>;
  crew: Map<string, { name: string; classId: ClassId }>;
  /** Generated once, from the instance id, and identical for everyone inside it. */
  encounters?: Encounter[];
  /** Side rooms already woken, and whether the secret has been claimed. */
  sides: Set<number>;
  secretTaken: boolean;
}
/**
 * Every live dungeon in the realm. A run is one instance: a template plus a seed, opened
 * either from a permanent Hearth portal or by a door something dropped in the world.
 *
 * The instance outlives the portal that opened it. Empty instances expire; occupied ones
 * are never reset, never evicted, and never taken over by another crew.
 */
export class Dungeons {
  runs = new Map<string, Run>();
  /** The realm's current instance of each template, which its template name is shorthand for. */
  current = new Map<string, string>();
  cycle = 0;
  seeds = 0;
  constructor(private realm: Realm) {}
  /** Everyone standing in one instance. */
  occupants(dimension: Dimension) {
    const id = this.resolve(dimension);
    return id
      ? [...this.realm.players.values()].filter((p) => p.profile.character && p.dimension === id)
      : [];
  }
  /** A live instance id for a dimension, whether it was named by id or by template. */
  resolve(dimension: Dimension): string | undefined {
    if (dimension === 'wilds') return undefined;
    if (this.runs.has(dimension)) return dimension;
    return this.current.get(templateOf(dimension));
  }
  run(dimension: Dimension) {
    const id = this.resolve(dimension);
    return id ? this.runs.get(id) : undefined;
  }
  /** One instance's encounters, generated from its id and cached with the run. */
  encounters(dimension: Dimension): Encounter[] {
    const run = this.runs.get(dimension) ?? this.run(dimension);
    if (!run) {
      const template = TEMPLATE_BY_ID.get(templateOf(dimension));
      return template ? (EXPEDITIONS[template.id] ?? []) : [];
    }
    return (run.encounters ??= instanceEncounters(run.id, EXPEDITIONS[run.template]));
  }
  /** How many chambers a template runs to, before an instance of it exists. */
  chambers(template: string) {
    const rows = TEMPLATE_BY_ID.get(template);
    return rows ? rows.graph.min : (EXPEDITIONS[template]?.length ?? 3);
  }
  /** Open a fresh instance of a template. Story templates replace the realm's current one. */
  open(template: string, depth = 1, openedBy = 'the Hearth', portalSeconds = 0) {
    this.evictIdle(template);
    const seed = (this.realm.rng() * 0xffffffff) >>> 0;
    const id = instanceId(template, seed ^ ++this.seeds);
    const modifier: Modifier =
      template === 'eclipse'
        ? (['iron', 'swift', 'fervor'] as const)[this.cycle++ % 3]
        : depth > 1
          ? (['iron', 'swift', 'fervor'] as const)[(this.cycle++ + depth) % 3]
          : 'still';
    const instance: Instance = {
      id,
      template,
      seed,
      depth,
      modifier,
      openedBy,
      expiresAt: portalSeconds ? this.realm.time + portalSeconds : Infinity,
    };
    this.runs.set(id, {
      id,
      instance,
      template,
      depth,
      modifier,
      stage: 0,
      status: 'ready',
      started: -1,
      finished: 0,
      emptySince: this.realm.time,
      credit: new Map(),
      crew: new Map(),
      sides: new Set(),
      secretTaken: false,
    });
    if (STORY_TEMPLATES.includes(template)) this.current.set(template, id);
    return this.runs.get(id)!;
  }
  /**
   * Make room before opening. Only empty instances are ever removed, and the realm's
   * current story instances are kept even when idle so their Hearth portals always work.
   */
  evictIdle(template: string) {
    const removable = () =>
      [...this.runs.values()]
        .filter((r) => !this.occupants(r.id).length && !this.isCurrentStory(r))
        .sort((a, b) => a.emptySince - b.emptySince);
    const ofTemplate = () => [...this.runs.values()].filter((r) => r.template === template);
    while (ofTemplate().length >= MAX_PER_TEMPLATE) {
      const victim = removable().find((r) => r.template === template);
      if (!victim) break;
      this.close(victim);
    }
    while (this.runs.size >= MAX_INSTANCES) {
      const victim = removable()[0];
      if (!victim) break;
      this.close(victim);
    }
  }
  isCurrentStory(run: Run) {
    return this.current.get(run.template) === run.id && STORY_TEMPLATES.includes(run.template);
  }
  close(run: Run) {
    this.clearCombat(run.id, true);
    this.runs.delete(run.id);
    if (this.current.get(run.template) === run.id) this.current.delete(run.template);
  }
  /** Kept under its original name: reset the realm's current instance of a story template. */
  reset(template: string, depth = 1) {
    const existing = this.current.get(template);
    if (existing) {
      const run = this.runs.get(existing);
      if (run) this.close(run);
    }
    return this.open(template, depth);
  }
  enter(p: Player, target: Dimension) {
    const template = templateOf(target);
    const legacy = ensureLegacy(p.profile);
    if (template === 'eclipse' && (!p.profile.victories || p.profile.character!.level < 20)) {
      this.realm.notice(
        p,
        'The Elder Convergence requires a Sovereign victory on this account and a level 20 traveler.',
        'bad',
      );
      return false;
    }
    let run = this.runs.get(target) ?? this.run(target);
    if (!run || (run.status === 'cleared' && !this.occupants(run.id).length))
      run = this.open(template, this.openDepth(p, template));
    if (!this.qualified(p, run)) return false;
    run.emptySince = this.realm.time;
    return run;
  }
  /**
   * The depth a traveler opens a template at: their choice, never deeper than one above
   * their own best clear of it. This is the rule Elder depths already used, generalised.
   */
  openDepth(p: Player, template: string) {
    const legacy = ensureLegacy(p.profile);
    const chosen =
      template === 'eclipse'
        ? Math.max(1, legacy.selectedDepth)
        : Math.max(1, legacy.selectedDepths?.[template] ?? 1);
    const best =
      template === 'eclipse'
        ? Math.max(legacy.highestDepth, legacy.bestDepths?.eclipse ?? 0)
        : (legacy.bestDepths?.[template] ?? 0);
    return Math.min(depthCap(template), best + 1, chosen);
  }
  /** Late arrivals qualify independently, exactly as Elder depths have always required. */
  qualified(p: Player, run: Run) {
    if (run.depth <= 1) return true;
    const legacy = ensureLegacy(p.profile);
    const best =
      run.template === 'eclipse'
        ? Math.max(legacy.highestDepth, legacy.bestDepths?.eclipse ?? 0)
        : (legacy.bestDepths?.[run.template] ?? 0);
    if (run.depth > best + 1) {
      this.realm.notice(
        p,
        `This door is open at depth ${run.depth}. Clear depth ${run.depth - 1} of ${DUNGEONS[run.template]?.name ?? run.template} first.`,
        'bad',
      );
      return false;
    }
    return true;
  }
  /** Every live instance, plus the three story dungeons, which are always available. */
  list(): ExpeditionListing[] {
    const listings: ExpeditionListing[] = [];
    const seen = new Set<string>();
    for (const run of this.runs.values()) {
      const occupants = this.occupants(run.id).filter((p) => p.send);
      const fresh = run.status === 'cleared' && !occupants.length;
      if (this.isCurrentStory(run)) seen.add(run.template);
      const portal = this.realm.portals.get(run.id);
      listings.push({
        dimension: run.template,
        instance: run.id,
        template: run.template,
        name: DUNGEONS[run.template]?.name ?? run.template,
        modifier: run.modifier,
        status: fresh ? 'empty' : run.status,
        depth: fresh ? 1 : run.depth,
        stage: fresh ? 1 : run.stage + 1,
        stages: this.encounters(run.id).length,
        started: !fresh && run.started >= 0,
        population: occupants.length,
        travelers: occupants.slice(0, 8).map((p) => ({
          name: p.profile.name,
          classId: p.profile.character!.classId,
          level: p.profile.character!.level,
        })),
        ...(portal
          ? {
              portal: Math.max(0, Math.ceil(portal.expiresAt - this.realm.time)),
              x: portal.x,
              z: portal.z,
              place: portal.place,
            }
          : {}),
        permanent: STORY_TEMPLATES.includes(run.template) && this.isCurrentStory(run),
      });
    }
    for (const template of STORY_TEMPLATES)
      if (!seen.has(template))
        listings.push({
          dimension: template,
          template,
          name: DUNGEONS[template]?.name ?? template,
          status: 'empty',
          depth: 1,
          stage: 1,
          stages: this.chambers(template),
          started: false,
          population: 0,
          travelers: [],
          permanent: true,
        });
    // Joinable now first: somebody inside, then open and waiting, then empty.
    return listings.sort(
      (a, b) =>
        b.population - a.population ||
        Number(b.status !== 'empty') - Number(a.status !== 'empty') ||
        (a.name ?? '').localeCompare(b.name ?? ''),
    );
  }
  interact(p: Player) {
    if (p.dimension === 'wilds') return false;
    const run = this.run(p.dimension);
    if (!run) return false;
    const stage = this.encounters(run.id)[run.stage];
    if (run.status !== 'ready' || distance(p, stage.altar) >= 4) return false;
    if (run.started < 0) run.started = this.realm.time;
    run.status = 'active';
    const scale = depthScaling(run.depth),
      modifier = MODIFIERS[run.modifier];
    for (const pack of stage.enemies) {
      for (let i = 0; i < pack.count; i++) {
        const angle = (i / pack.count) * Math.PI * 2 + (run.depth % 2) * 0.25;
        const enemy = this.realm.spawn(
          pack.kind,
          pack.x + Math.cos(angle) * pack.spread,
          pack.z + Math.sin(angle) * pack.spread,
          run.id,
        );
        enemy.runId = run.id;
        enemy.healthScale = scale.hp * modifier.hp;
        enemy.damageScale = scale.damage * modifier.damage;
        enemy.speedScale = scale.speed * modifier.speed;
        enemy.rateScale = modifier.rate;
        enemy.hp = enemy.maxHp = Math.round(ENEMIES[enemy.kind].hp * enemy.healthScale);
        enemy.nextFire = this.realm.time + 2.5;
      }
    }
    for (const ally of this.occupants(run.id))
      this.realm.notice(
        ally,
        `${run.stage + 1}/${this.encounters(run.id).length} · ${stage.name}`,
        'info',
      );
    return true;
  }
  killed(
    enemy: { id: string; dimension: string; runId?: string; sideRoom?: number },
    eligible: Player[],
  ) {
    if (!enemy.runId) return;
    const run = this.runs.get(enemy.runId);
    if (!run) return;
    // A side room is its own small fight. It never gates the altars, and it pays better.
    if (enemy.sideRoom !== undefined) {
      if (
        [...this.realm.enemies.values()].some(
          (e) => e.runId === run.id && e.sideRoom === enemy.sideRoom,
        )
      )
        return;
      const layout = layoutFor(run.id);
      const room = layout?.rooms.find((r) => r.id === enemy.sideRoom);
      for (const p of eligible) {
        if (!p.profile.character) continue;
        this.realm.dropItems(
          p.profile.id,
          { x: room?.x ?? 0, z: room?.z ?? 0, dimension: run.id },
          this.bag(p, this.tierFor(run) + 1, 2),
          240,
        );
        this.realm.notice(
          p,
          `${room?.name ?? 'The unmarked room'} is quiet. A better cache is on the ground.`,
          'good',
        );
        this.realm.sync(p, true);
      }
      return;
    }
    if (run.status !== 'active') return;
    for (const p of eligible) {
      if (!run.credit.has(p.profile.id)) run.credit.set(p.profile.id, new Set());
      run.credit.get(p.profile.id)!.add(run.stage);
      run.crew.set(p.profile.id, { name: p.profile.name, classId: p.profile.character!.classId });
    }
    if (
      [...this.realm.enemies.values()].some((e) => e.runId === run.id && e.sideRoom === undefined)
    )
      return;
    this.clearCombat(run.id);
    const encounters = this.encounters(run.id);
    const finished = run.stage === encounters.length - 1;
    const template = run.template;
    for (const p of this.occupants(run.id)) {
      const c = p.profile.character!;
      if (!run.credit.get(p.profile.id)?.has(run.stage)) continue;
      c.hp = Math.min(stats(c).maxHp, c.hp + stats(c).maxHp * 0.2);
      c.mp = Math.min(stats(c).maxMp, c.mp + stats(c).maxMp * 0.3);
      c.potions = Math.min(5, c.potions + 1);
      this.realm.effect('heal', p, '#aee4c6', 'ROOM SECURED');
      const result: ExpeditionResult | undefined = finished
        ? {
            id: run.id,
            dimension: template,
            template,
            instance: run.id,
            depth: run.depth,
            modifier: run.modifier,
            elapsed: Math.max(0, this.realm.time - run.started),
            at: Date.now(),
            chambers: run.credit.get(p.profile.id)!.size,
            totalChambers: encounters.length,
            shards: 0,
            gold: 0,
            personalBest: false,
            crew: [...run.crew.values()],
          }
        : undefined;
      if (finished && run.credit.get(p.profile.id)!.size === encounters.length) {
        c.clears ??= [];
        if (!c.clears.includes(template)) c.clears.push(template);
        const legacy = ensureLegacy(p.profile);
        const base = template === 'eclipse' ? 8 + run.depth * 2 : template === 'hollow' ? 3 : 5;
        const shards = template === 'eclipse' ? base : base + (run.depth - 1) * 2;
        legacy.shards += shards;
        const gold = template === 'eclipse' ? run.depth * 50 + 200 : 80 + (run.depth - 1) * 45;
        c.gold += gold;
        result!.shards = shards;
        result!.gold = gold;
        // Depth credit, and a best time, are kept per template now.
        legacy.bestDepths ??= {};
        legacy.bestDepths[template] = Math.max(legacy.bestDepths[template] ?? 0, run.depth);
        const key = `${template}:${run.depth}`,
          elapsed = this.realm.time - run.started;
        result!.personalBest = elapsed < (legacy.bestTimes[key] ?? Infinity);
        legacy.bestTimes[key] = Math.min(legacy.bestTimes[key] ?? Infinity, elapsed);
        if (template === 'eclipse') {
          legacy.clears++;
          legacy.highestDepth = Math.max(legacy.highestDepth, run.depth);
          legacy.bestTimes[String(run.depth)] = legacy.bestTimes[key];
          legacy.selectedDepth = Math.min(MAX_DEPTH, legacy.highestDepth + 1);
          const item = makeItem(
            (['weapon', 'armor', 'charm'] as const)[legacy.clears % 3],
            6,
            'rare',
            this.realm.rng,
          );
          this.realm.dropItems(p.profile.id, { ...p, dimension: run.id }, [item], 180);
          this.realm.completeJourney(p);
        }
        this.realm.notice(
          p,
          `${DUNGEONS[template]?.name ?? template} cleared${run.depth > 1 ? ` at depth ${run.depth}` : ''}! +${shards} permanent star shards${template === 'eclipse' ? ' · Tier 6 Astral cache' : ''}.`,
          'good',
        );
      } else if (!finished)
        this.realm.notice(
          p,
          'Chamber secured. +1 tonic · health and light restored. Activate the next altar when ready.',
          'good',
        );
      else
        this.realm.notice(
          p,
          'Keeper defeated. Complete every chamber in one expedition to earn the clear bonus.',
          'good',
        );
      if (result) p.profile.lastExpedition = result;
      this.realm.sync(p, true);
    }
    if (finished) {
      run.status = 'cleared';
      run.finished = this.realm.time;
    } else {
      run.stage++;
      run.status = 'ready';
    }
  }
  /** The loot tier a run pays at, which is the template's level band plus its depth. */
  tierFor(run: Run) {
    const level = TEMPLATE_BY_ID.get(run.template)?.level ?? 5;
    return Math.max(2, Math.min(8, Math.round(level / 4) + run.depth));
  }
  bag(p: Player, tier: number, count: number) {
    const slots = (['weapon', 'armor', 'charm'] as const).slice(0, count);
    return slots.map((slot) => {
      const item = makeItem(slot, Math.min(8, tier), 'rare', this.realm.rng);
      if (slot === 'weapon') item.icon = CLASSES[p.profile.character!.classId].icon;
      return item;
    });
  }
  /**
   * Optional rooms and the one secret. Walking into a side room wakes it; walking into the
   * alcove behind a wall that was not a wall pays once, and people tell each other where.
   */
  updateRooms() {
    for (const run of this.runs.values()) {
      const layout = layoutFor(run.id);
      if (!layout) continue;
      for (const p of this.occupants(run.id)) {
        const room = roomAt(layout, p.x, p.z);
        if (!room) continue;
        if (room.kind === 'side' && !run.sides.has(room.id)) {
          run.sides.add(room.id);
          this.wakeSide(run, room);
          for (const ally of this.occupants(run.id))
            this.realm.notice(ally, `${room.name}. Not on the way, and not empty.`, 'info');
        }
        if (room.kind === 'secret' && !run.secretTaken) {
          run.secretTaken = true;
          const reward = TEMPLATE_BY_ID.get(run.template)?.secret.reward ?? 4;
          for (const ally of this.occupants(run.id)) {
            this.realm.dropItems(
              ally.profile.id,
              { x: room.x, z: room.z, dimension: run.id },
              this.bag(ally, reward + run.depth, 2),
              240,
            );
            this.realm.notice(ally, `${room.name}. Somebody left this here on purpose.`, 'good');
            this.realm.sync(ally, true);
          }
          this.realm.chat(
            'The Hearth',
            `${this.realm.players.get([...run.crew.keys()][0] ?? '')?.profile.name ?? 'Someone'} found the secret in ${DUNGEONS[run.template]?.name ?? run.template}.`,
            true,
          );
        }
      }
    }
  }
  wakeSide(run: Run, room: Room) {
    const encounter = sideEncounter(run.id, room);
    if (!encounter) return;
    const scale = depthScaling(run.depth),
      modifier = MODIFIERS[run.modifier];
    for (const pack of encounter.enemies)
      for (let i = 0; i < pack.count; i++) {
        const angle = (i / pack.count) * Math.PI * 2;
        const enemy = this.realm.spawn(
          pack.kind,
          pack.x + Math.cos(angle) * pack.spread,
          pack.z + Math.sin(angle) * pack.spread,
          run.id,
        );
        enemy.runId = run.id;
        enemy.sideRoom = room.id;
        enemy.healthScale = scale.hp * modifier.hp * 1.15;
        enemy.damageScale = scale.damage * modifier.damage;
        enemy.speedScale = scale.speed * modifier.speed;
        enemy.rateScale = modifier.rate;
        enemy.hp = enemy.maxHp = Math.round(ENEMIES[enemy.kind].hp * enemy.healthScale);
        enemy.nextFire = this.realm.time + 2;
      }
  }
  clearCombat(dimension: Dimension, enemies = false) {
    for (const [id, b] of this.realm.bullets)
      if (b.dimension === dimension) this.realm.bullets.delete(id);
    for (const [id, h] of this.realm.hazards)
      if (h.dimension === dimension) this.realm.hazards.delete(id);
    if (enemies)
      for (const [id, e] of this.realm.enemies)
        if (e.dimension === dimension) this.realm.enemies.delete(id);
  }
  step() {
    this.updateRooms();
    for (const [id, run] of this.runs) {
      if (this.occupants(id).length) {
        run.emptySince = this.realm.time;
        continue;
      }
      // Only empty instances ever expire. Nobody is ever moved out of a live one, and a
      // story template simply opens a fresh instance the next time someone walks in.
      if (this.realm.time - run.emptySince > 60) this.close(run);
    }
  }
  state(dimension: Dimension): DungeonState | undefined {
    const run = this.run(dimension);
    if (!run) return;
    const encounters = this.encounters(run.id);
    const stage = encounters[run.stage];
    return {
      dimension: run.id,
      template: run.template,
      depth: run.depth,
      modifier: run.modifier,
      stage: run.stage + 1,
      stages: encounters.length,
      name: stage.name,
      status: run.status,
      remaining: [...this.realm.enemies.values()].filter((e) => e.runId === run.id).length,
      elapsed: run.started >= 0 ? (run.finished || this.realm.time) - run.started : 0,
      altar: stage.altar,
      next:
        run.status === 'cleared'
          ? 'Collect your rewards · R to return'
          : run.status === 'ready'
            ? 'X at the lit altar to begin'
            : 'Defeat every guardian to awaken the next altar',
    };
  }
}
