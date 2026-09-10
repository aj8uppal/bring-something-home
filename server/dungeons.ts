import { randomUUID } from 'node:crypto';
import { DUNGEONS, ENEMIES, distance } from '../shared/content.js';
import {
  EXPEDITIONS,
  MAX_DEPTH,
  MODIFIERS,
  depthScaling,
  ensureLegacy,
  type Modifier,
} from '../shared/endgame.js';
import type {
  ClassId,
  DungeonId,
  DungeonState,
  ExpeditionListing,
  ExpeditionResult,
} from '../shared/types.js';
import type { Player, Realm } from './realm.js';
import { makeItem, stats } from './model.js';

interface Run {
  id: string;
  depth: number;
  modifier: Modifier;
  stage: number;
  status: DungeonState['status'];
  started: number;
  finished: number;
  emptySince: number;
  credit: Map<string, Set<number>>;
  crew: Map<string, { name: string; classId: ClassId }>;
}
/** A shared expedition per realm and dimension. Encounter changes are explicit altar actions.
 * Empty expeditions expire; occupied ones can never be reset by another player. */
export class Dungeons {
  runs = new Map<DungeonId, Run>();
  cycle = 0;
  constructor(private realm: Realm) {}
  occupants(dim: DungeonId) {
    return [...this.realm.players.values()].filter(
      (p) => p.profile.character && p.dimension === dim,
    );
  }
  reset(dim: DungeonId, depth = 1) {
    this.clearCombat(dim, true);
    const modifier: Modifier =
      dim === 'eclipse' ? (['iron', 'swift', 'fervor'] as const)[this.cycle++ % 3] : 'still';
    this.runs.set(dim, {
      id: randomUUID(),
      depth,
      modifier,
      stage: 0,
      status: 'ready',
      started: -1,
      finished: 0,
      emptySince: this.realm.time,
      credit: new Map(),
      crew: new Map(),
    });
  }
  enter(p: Player, dim: DungeonId) {
    const legacy = ensureLegacy(p.profile);
    if (dim === 'eclipse' && (!p.profile.victories || p.profile.character!.level < 20)) {
      this.realm.notice(
        p,
        'The Elder Convergence requires a Sovereign victory on this account and a level 20 traveler.',
        'bad',
      );
      return false;
    }
    const run = this.runs.get(dim);
    if (!run || (run.status === 'cleared' && !this.occupants(dim).length))
      this.reset(
        dim,
        dim === 'eclipse'
          ? Math.min(MAX_DEPTH, legacy.highestDepth + 1, Math.max(1, legacy.selectedDepth))
          : 1,
      );
    const active = this.runs.get(dim)!;
    if (dim === 'eclipse' && active.depth > legacy.highestDepth + 1) {
      this.realm.notice(
        p,
        `This realm is running depth ${active.depth}. Clear depth ${active.depth - 1} first, or choose another realm.`,
        'bad',
      );
      return false;
    }
    active.emptySince = this.realm.time;
    return true;
  }
  list(): ExpeditionListing[] {
    return (Object.keys(DUNGEONS) as DungeonId[]).map((dimension) => {
      const run = this.runs.get(dimension),
        occupants = this.occupants(dimension);
      const fresh = !run || (run.status === 'cleared' && !occupants.length);
      return {
        dimension,
        status: fresh ? 'empty' : run.status,
        depth: fresh ? 1 : run.depth,
        stage: fresh ? 1 : run.stage + 1,
        started: !fresh && run.started >= 0,
        population: occupants.filter((p) => p.send).length,
        travelers: occupants
          .filter((p) => p.send)
          .slice(0, 8)
          .map((p) => ({
            name: p.profile.name,
            classId: p.profile.character!.classId,
            level: p.profile.character!.level,
          })),
      };
    });
  }
  interact(p: Player) {
    if (p.dimension === 'wilds') return false;
    const dim = p.dimension,
      run = this.runs.get(dim);
    if (!run) return false;
    const stage = EXPEDITIONS[dim][run.stage];
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
          dim,
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
    for (const ally of this.occupants(dim))
      this.realm.notice(
        ally,
        `${run.stage + 1}/${EXPEDITIONS[dim].length} · ${stage.name}`,
        'info',
      );
    return true;
  }
  killed(enemy: { id: string; dimension: string; runId?: string }, eligible: Player[]) {
    if (!enemy.runId) return;
    const dim = enemy.dimension as DungeonId,
      run = this.runs.get(dim);
    if (!run || run.id !== enemy.runId || run.status !== 'active') return;
    for (const p of eligible) {
      if (!run.credit.has(p.profile.id)) run.credit.set(p.profile.id, new Set());
      run.credit.get(p.profile.id)!.add(run.stage);
      run.crew.set(p.profile.id, { name: p.profile.name, classId: p.profile.character!.classId });
    }
    if ([...this.realm.enemies.values()].some((e) => e.runId === run.id)) return;
    this.clearCombat(dim);
    const finished = run.stage === EXPEDITIONS[dim].length - 1;
    for (const p of this.occupants(dim)) {
      const c = p.profile.character!;
      if (!run.credit.get(p.profile.id)?.has(run.stage)) continue;
      c.hp = Math.min(stats(c).maxHp, c.hp + stats(c).maxHp * 0.2);
      c.mp = Math.min(stats(c).maxMp, c.mp + stats(c).maxMp * 0.3);
      c.potions = Math.min(5, c.potions + 1);
      this.realm.effect('heal', p, '#aee4c6', 'ROOM SECURED');
      const result: ExpeditionResult | undefined = finished
        ? {
            id: run.id,
            dimension: dim,
            depth: run.depth,
            modifier: run.modifier,
            elapsed: Math.max(0, this.realm.time - run.started),
            at: Date.now(),
            chambers: run.credit.get(p.profile.id)!.size,
            totalChambers: EXPEDITIONS[dim].length,
            shards: 0,
            gold: 0,
            personalBest: false,
            crew: [...run.crew.values()],
          }
        : undefined;
      if (finished && run.credit.get(p.profile.id)!.size === EXPEDITIONS[dim].length) {
        c.clears ??= [];
        if (!c.clears.includes(dim)) c.clears.push(dim);
        const legacy = ensureLegacy(p.profile);
        const shards = dim === 'eclipse' ? 8 + run.depth * 2 : dim === 'hollow' ? 3 : 5;
        legacy.shards += shards;
        c.gold += dim === 'eclipse' ? run.depth * 50 + 200 : 80;
        result!.shards = shards;
        result!.gold = dim === 'eclipse' ? run.depth * 50 + 200 : 80;
        if (dim === 'eclipse') {
          legacy.clears++;
          legacy.highestDepth = Math.max(legacy.highestDepth, run.depth);
          const key = String(run.depth),
            elapsed = this.realm.time - run.started;
          result!.personalBest = elapsed < (legacy.bestTimes[key] ?? Infinity);
          legacy.bestTimes[key] = Math.min(legacy.bestTimes[key] ?? Infinity, elapsed);
          legacy.selectedDepth = Math.min(MAX_DEPTH, legacy.highestDepth + 1);
          const item = makeItem(
            (['weapon', 'armor', 'charm'] as const)[legacy.clears % 3],
            6,
            'rare',
            this.realm.rng,
          );
          this.realm.dropItems(p.profile.id, { ...p, dimension: dim }, [item], 180);
          this.realm.completeJourney(p);
        }
        this.realm.notice(
          p,
          `${DUNGEONS[dim].name} cleared! +${shards} permanent star shards${dim === 'eclipse' ? ' · Tier 6 Astral cache' : ''}.`,
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
  clearCombat(dim: DungeonId, enemies = false) {
    for (const [id, b] of this.realm.bullets)
      if (b.dimension === dim) this.realm.bullets.delete(id);
    for (const [id, h] of this.realm.hazards)
      if (h.dimension === dim) this.realm.hazards.delete(id);
    if (enemies)
      for (const [id, e] of this.realm.enemies)
        if (e.dimension === dim) this.realm.enemies.delete(id);
  }
  step() {
    for (const [dim, run] of this.runs) {
      if (this.occupants(dim).length) run.emptySince = this.realm.time;
      else if (this.realm.time - run.emptySince > 60) {
        this.clearCombat(dim, true);
        this.runs.delete(dim);
      }
    }
  }
  state(dim: DungeonId): DungeonState | undefined {
    const run = this.runs.get(dim);
    if (!run) return;
    const stage = EXPEDITIONS[dim][run.stage];
    return {
      dimension: dim,
      depth: run.depth,
      modifier: run.modifier,
      stage: run.stage + 1,
      stages: EXPEDITIONS[dim].length,
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
