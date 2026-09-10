import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateOf } from '../shared/instances.js';
import { Store } from '../server/database.js';
import { Realm, type Player } from '../server/realm.js';
import { makeItem, stats } from '../server/model.js';
import { DUNGEONS, ENEMIES } from '../shared/content.js';
import { ensureLegacy, EXPEDITIONS, MAX_DEPTH } from '../shared/endgame.js';
import { BOSS_RELICS } from '../shared/combat.js';
import { attackPlan } from '../shared/patterns.js';
import { Encoder, Decoder } from '../shared/protocol.js';
import type { DungeonId, ServerMessage, Snapshot } from '../shared/types.js';

function setup() {
  const store = new Store(':memory:'),
    realm = new Realm('test', 'Test', store);
  const account = store.create('Lumen'),
    messages: ServerMessage[] = [];
  const p = realm.add(account.profile, 'arcanist', (m) => messages.push(structuredClone(m)));
  realm.enemies.clear();
  realm.event.remaining = Infinity;
  return { store, realm, p, c: p.profile.character!, account, messages };
}
function enter(realm: Realm, p: Player, dim: DungeonId) {
  p.x = DUNGEONS[dim].x;
  p.z = DUNGEONS[dim].z;
  realm.action(p.profile.id, 'interact');
  assert.equal(templateOf(p.dimension), dim);
}
function clearStage(realm: Realm, p: Player) {
  const dim = p.dimension as DungeonId;
  const state = realm.dungeons.state(dim)!;
  Object.assign(p, state.altar);
  realm.dungeons.interact(p);
  assert.equal(realm.dungeons.state(dim)!.status, 'active');
  for (const e of [...realm.enemies.values()].filter((e) => e.dimension === dim)) {
    Object.assign(p, { x: e.x, z: e.z });
    e.contributors.set(p.profile.id, realm.time);
    realm.killEnemy(e, [...realm.players.values()]);
  }
}
test('dungeon chambers require nearby altar activation and never respawn behind a cleared room', () => {
  const { realm, p, store } = setup();
  enter(realm, p, 'hollow');
  assert.equal(realm.dungeons.state('hollow')!.status, 'ready');
  assert.equal(realm.enemies.size, 0);
  realm.dungeons.interact(p);
  assert.equal(realm.enemies.size, 0, 'entry is outside altar activation range');
  for (let i = 0; i < 3; i++) clearStage(realm, p);
  assert.equal(realm.dungeons.state('hollow')!.status, 'cleared');
  assert.equal(realm.respawns.length, 0);
  assert.equal(ensureLegacy(p.profile).shards, 5, 'two keeper shards plus three clear shards');
  const shards = ensureLegacy(p.profile).shards;
  realm.dungeons.interact(p);
  realm.step();
  assert.equal(ensureLegacy(p.profile).shards, shards);
  store.close();
});
test('Elder entry requires both account victory and level 20, and depth cannot skip a clear', () => {
  const { realm, p, c, store } = setup();
  p.x = 0;
  p.z = DUNGEONS.eclipse.z;
  realm.action(p.profile.id, 'interact');
  assert.equal(p.dimension, 'wilds');
  p.profile.victories = 1;
  realm.action(p.profile.id, 'interact');
  assert.equal(p.dimension, 'wilds');
  c.level = 20;
  realm.action(p.profile.id, 'interact');
  assert.equal(templateOf(p.dimension), 'eclipse');
  realm.recall(p);
  realm.action(p.profile.id, 'attune', '12');
  assert.equal(ensureLegacy(p.profile).selectedDepth, 1);
  realm.action(p.profile.id, 'attune', 'NaN');
  assert.equal(ensureLegacy(p.profile).selectedDepth, 1);
  store.close();
});
test('three elder victories unlock the next depth, bank shards, record a best time, and survive rebirth', () => {
  const { realm, p, c, store, account } = setup();
  p.profile.victories = 1;
  c.level = 20;
  enter(realm, p, 'eclipse');
  realm.time = 10;
  for (let i = 0; i < EXPEDITIONS.eclipse.length; i++) {
    clearStage(realm, p);
    realm.time += 20;
  }
  const legacy = ensureLegacy(p.profile);
  assert.equal(legacy.highestDepth, 1);
  assert.equal(legacy.selectedDepth, 2);
  assert.equal(legacy.clears, 1);
  assert.equal(legacy.shards, 19);
  assert.equal(legacy.bestTimes['1'], 80);
  for (const kind of ['tideelder', 'cinderelder', 'nullelder'])
    assert.equal(legacy.bossKills[kind], 1);
  assert.ok([...realm.loot.values()].some((d) => d.item.tier === 6 && d.item.rarity === 'rare'));
  realm.recall(p);
  enter(realm, p, 'eclipse');
  assert.equal(realm.dungeons.state('eclipse')!.depth, 2);
  assert.equal(realm.dungeons.state('eclipse')!.modifier, 'swift');
  realm.die(p, 'Test');
  const saved = store.authenticate(account.token)!;
  assert.equal(saved.character, null);
  assert.equal(saved.legacy!.shards, 19);
  const reborn = realm.add(saved, 'ranger', () => {});
  assert.equal(reborn.profile.legacy!.highestDepth, 1);
  assert.equal(reborn.profile.character!.level, 1);
  store.close();
});
test('shared expeditions cannot be reset by a late arrival or award a clear for just the final boss', () => {
  const { realm, p, c, store } = setup();
  p.profile.victories = 1;
  c.level = 20;
  enter(realm, p, 'eclipse');
  for (let i = 0; i < 4; i++) clearStage(realm, p);
  const late = realm.add(store.create('Latecomer').profile, 'ranger', () => {});
  late.profile.victories = 1;
  late.profile.character!.level = 20;
  enter(realm, late, 'eclipse');
  assert.equal(realm.dungeons.state('eclipse')!.stage, 5);
  late.x = 0;
  late.z = -12;
  clearStage(realm, p);
  assert.equal(ensureLegacy(p.profile).clears, 1);
  assert.equal(ensureLegacy(late.profile).clears, 0);
  assert.equal(
    ensureLegacy(late.profile).bossKills.nullelder,
    1,
    'late allies still earn their own boss loot',
  );
  realm.recall(p);
  enter(realm, p, 'eclipse');
  assert.equal(
    realm.dungeons.state('eclipse')!.status,
    'cleared',
    'an occupied cleared expedition is preserved',
  );
  store.close();
});
test('empty expeditions clean up enemies and hazards after the reconnect grace period', () => {
  const { realm, p, store } = setup();
  enter(realm, p, 'crucible');
  Object.assign(p, realm.dungeons.state('crucible')!.altar);
  realm.dungeons.interact(p);
  assert.ok(realm.enemies.size > 0);
  realm.recall(p);
  realm.time += 61;
  realm.dungeons.step();
  assert.equal(realm.dungeons.state('crucible'), undefined);
  assert.equal(
    [...realm.enemies.values()].filter((e) => templateOf(e.dimension) === 'crucible').length,
    0,
  );
  enter(realm, p, 'crucible');
  assert.equal(realm.dungeons.state('crucible')!.stage, 1);
  store.close();
});
test('crafting requires a learned recipe, exact persistent currency, space, and sanctuary', () => {
  const { realm, p, c, store } = setup(),
    legacy = ensureLegacy(p.profile);
  legacy.shards = 60;
  realm.action(p.profile.id, 'craft', 'nullelder');
  assert.equal(c.inventory.length, 0);
  p.profile.discovered.push('nullelder');
  p.z = -10;
  realm.action(p.profile.id, 'craft', 'nullelder');
  assert.equal(legacy.shards, 60);
  realm.recall(p);
  c.inventory = Array.from({ length: 18 }, () => makeItem('armor', 1, 'common'));
  realm.action(p.profile.id, 'craft', 'nullelder');
  assert.equal(legacy.shards, 60);
  c.inventory = [];
  realm.action(p.profile.id, 'craft', 'nullelder');
  assert.equal(legacy.shards, 30);
  assert.equal(c.inventory[0].name, BOSS_RELICS.nullelder.name);
  assert.equal(c.inventory[0].tier, 6);
  assert.equal(c.inventory[0].trait, 'echo');
  assert.deepEqual(legacy.relics, ['nullelder']);
  realm.action(p.profile.id, 'craft', 'nullelder');
  assert.equal(legacy.shards, 0);
  realm.action(p.profile.id, 'craft', 'nullelder');
  assert.equal(c.inventory.length, 2);
  assert.equal(legacy.relics.length, 1);
  store.close();
});
test('every sixth boss kill guarantees its signature relic without depending on random luck', () => {
  const { realm, p, store } = setup();
  p.z = -15;
  realm.rng = () => 0.9;
  for (let i = 0; i < 6; i++) {
    const e = realm.spawn('archivist', 0, -15, 'wilds');
    realm.killEnemy(e, [p]);
  }
  const relic = [...realm.loot.values()].find((d) => d.item.relicId === 'archivist')!;
  assert.equal(relic.item.rarity, 'relic');
  assert.equal(relic.item.name, BOSS_RELICS.archivist.name);
  realm.action(p.profile.id, 'loot', relic.id);
  assert.ok(ensureLegacy(p.profile).relics.includes('archivist'));
  store.close();
});
test('stacked loot picks the displayed id, respects ownership, and defaults to the nearest bag', () => {
  const { realm, p, c, store } = setup();
  for (const [id, x, owner] of [
    ['far', 3, p.profile.id],
    ['near', 1, p.profile.id],
    ['foreign', 0, 'another'],
  ] as const)
    realm.loot.set(id, {
      id,
      x,
      z: p.z,
      item: makeItem('weapon', 2, 'rare'),
      owner,
      dimension: 'wilds',
      expires: 100,
    });
  realm.action(p.profile.id, 'loot', 'foreign');
  assert.equal(c.inventory.length, 0);
  realm.action(p.profile.id, 'interact');
  assert.equal(realm.loot.has('near'), false);
  realm.action(p.profile.id, 'loot', 'far');
  assert.equal(realm.loot.has('far'), false);
  assert.equal(c.inventory.length, 2);
  assert.ok(realm.loot.has('foreign'));
  store.close();
});
test('floor attacks are locked, telegraphed, hit once, respect dodges, and vanish when their owner dies', () => {
  const { realm, p, c, store } = setup();
  p.dimension = realm.dungeons.enter(p, 'eclipse')!.id;
  p.z = 0;
  p.invulnerableUntil = 0;
  const boss = realm.spawn('tideelder', 0, -12, p.dimension);
  realm.summonHazards(boss, p);
  const hazard = [...realm.hazards.values()][0];
  const hp = c.hp;
  realm.time = 1;
  realm.updateHazards([p]);
  assert.equal(c.hp, hp);
  realm.time = 1.7;
  realm.updateHazards([p]);
  assert.ok(c.hp < hp);
  const hit = c.hp;
  realm.updateHazards([p]);
  assert.equal(c.hp, hit);
  realm.summonHazards(boss, p);
  p.invulnerableUntil = 4;
  realm.time = 3.4;
  realm.updateHazards([p]);
  assert.equal(c.hp, hit);
  realm.killEnemy(boss, []);
  assert.equal(realm.hazards.size, 0);
  assert.equal(hazard.x, 0);
  assert.equal(hazard.z, 0);
  store.close();
});
test('elder patterns differ across bosses and phases and preserve angular dodge openings', () => {
  const signatures = new Set<string>();
  for (const kind of ['tideelder', 'cinderelder', 'nullelder'])
    for (const phase of [0, 1, 2]) {
      const plan = attackPlan({ kind, phase, angle: 0, attack: 0 });
      assert.ok(plan.shots.length >= 12 && plan.shots.length <= 60);
      const angles = plan.shots
        .map((s) => (s.angle + Math.PI * 8) % (Math.PI * 2))
        .sort((a, b) => a - b);
      const largest = Math.max(
        ...angles.map(
          (a, i) => (angles[(i + 1) % angles.length] - a + Math.PI * 2) % (Math.PI * 2),
        ),
      );
      assert.ok(largest > 0.4, `${kind} phase ${phase} leaves a navigable opening`);
      signatures.add(plan.name + ':' + plan.shots.length);
    }
  assert.ok(signatures.size >= 8);
});
test('protocol preserves the fourth dimension, expedition progress, and timed hazards', () => {
  const { realm, p, c, store, messages } = setup();
  p.profile.victories = 1;
  c.level = 20;
  enter(realm, p, 'eclipse');
  const boss = realm.spawn('nullelder', 0, 0, p.dimension);
  realm.summonHazards(boss, p);
  realm.broadcast();
  const state = messages.filter((m) => m.type === 'snapshot').at(-1) as Snapshot;
  const decoded = new Decoder().decode(new Encoder().encode(state));
  assert.equal(templateOf(decoded.self.dimension), 'eclipse');
  assert.deepEqual(decoded.dungeon, state.dungeon);
  assert.deepEqual(decoded.hazards, state.hazards);
  assert.equal(decoded.enemies[0].kind, 'nullelder');
  store.close();
});
test('depth and group health scaling compose without dropping the expedition multiplier', () => {
  const { realm, p, c, store } = setup();
  p.profile.victories = 1;
  c.level = 20;
  ensureLegacy(p.profile).highestDepth = MAX_DEPTH;
  ensureLegacy(p.profile).selectedDepth = 12;
  enter(realm, p, 'eclipse');
  clearStage(realm, p);
  Object.assign(p, realm.dungeons.state('eclipse')!.altar);
  realm.dungeons.interact(p);
  const boss = [...realm.enemies.values()].find((e) => e.kind === 'tideelder')!;
  const base = boss.maxHp;
  assert.ok(base > ENEMIES.tideelder.hp * 2);
  const ally = realm.add(store.create('Ally').profile, 'sentinel', () => {});
  ally.dimension = p.dimension;
  ally.x = 0;
  ally.z = 0;
  p.x = boss.x;
  p.z = boss.z + 2;
  realm.input(p.profile.id, { x: 0, z: 0, angle: -Math.PI / 2, fire: true, seq: 1 });
  realm.step();
  assert.ok(Math.abs(boss.maxHp - Math.round(base * 1.65)) <= 1);
  store.close();
});

test('Quickening delivers its faster primary cadence on the fixed server tick', () => {
  const count = (swift: boolean) => {
    const { realm, p, c, store } = setup();
    p.z = -8;
    c.equipment.weapon!.trait = swift ? 'swift' : undefined;
    let shots = 0;
    const shot = realm.shot.bind(realm);
    realm.shot = (...args: Parameters<Realm['shot']>) => {
      shots++;
      return shot(...args);
    };
    for (let i = 0; i < 80; i++) {
      realm.input(p.profile.id, { x: 0, z: 0, angle: 0, fire: true, seq: i + 1 });
      realm.step();
    }
    store.close();
    return shots;
  };
  assert.equal(count(false), 21);
  assert.equal(count(true), 26);
});

test('saved named relics from the previous release gain collection identity on login', () => {
  const { realm, p, store } = setup();
  const oldRelic = makeItem('weapon', 5, 'relic');
  oldRelic.name = BOSS_RELICS.sovereign.name;
  p.profile.vault.push(oldRelic);
  delete p.profile.legacy;
  realm.players.delete(p.profile.id);
  realm.add(p.profile, 'arcanist', () => {});
  assert.equal(oldRelic.relicId, 'sovereign');
  assert.deepEqual(ensureLegacy(p.profile).relics, ['sovereign']);
  store.close();
});

test('altar activation bypasses nearby loot with a full bag without collecting or dropping anything', () => {
  const { realm, p, c, store } = setup();
  enter(realm, p, 'hollow');
  Object.assign(p, realm.dungeons.state('hollow')!.altar);
  c.inventory = Array.from({ length: 18 }, () => makeItem('armor', 1, 'common'));
  realm.loot.set('at-altar', {
    id: 'at-altar',
    item: makeItem('weapon', 3, 'rare'),
    x: p.x,
    z: p.z,
    dimension: 'hollow',
    owner: p.profile.id,
    expires: 100,
  });
  realm.action(p.profile.id, 'delve');
  assert.equal(realm.dungeons.state('hollow')!.status, 'active');
  assert.equal(c.inventory.length, 18);
  assert.equal(realm.loot.size, 1);
  store.close();
});

test('rally travel requires sanctuary and respects Elder progression and occupied cleared runs', () => {
  const { realm, p, c, store, messages } = setup();
  try {
    p.x = 0;
    p.z = -20;
    realm.action(p.profile.id, 'rally', 'hollow');
    assert.equal(p.dimension, 'wilds');
    assert.ok(messages.some((m) => m.type === 'notice' && m.text.includes('Recall to the Hearth')));
    realm.recall(p);
    realm.action(p.profile.id, 'rally', '__proto__');
    assert.equal(p.dimension, 'wilds');
    realm.action(p.profile.id, 'rally', 'eclipse');
    assert.equal(p.dimension, 'wilds');
    c.level = 20;
    p.profile.victories = 1;
    realm.dungeons.reset('eclipse', 3);
    realm.action(p.profile.id, 'rally', 'eclipse');
    assert.equal(p.dimension, 'wilds');
    realm.action(p.profile.id, 'rally', 'hollow');
    assert.equal(templateOf(p.dimension), 'hollow');
    assert.equal(p.z, 22);
    for (let i = 0; i < 3; i++) clearStage(realm, p);
    const previous = realm.dungeons.run('hollow')!.id;
    const friend = realm.add(store.create('Friend').profile, 'ranger', () => {});
    realm.action(friend.profile.id, 'rally', 'hollow');
    assert.equal(
      friend.dimension,
      'wilds',
      'rally cannot strand a new group inside a finished run',
    );
    assert.equal(realm.dungeons.run('hollow')!.id, previous);
    realm.recall(p);
    realm.action(friend.profile.id, 'rally', 'hollow');
    assert.equal(templateOf(friend.dimension), 'hollow');
    assert.notEqual(realm.dungeons.run('hollow')!.id, previous);
    assert.equal(realm.dungeons.state('hollow')!.stage, 1);
  } finally {
    store.close();
  }
});

test('friends see a common rally roster from different dimensions and share the same run', () => {
  const { realm, p, store, messages } = setup();
  try {
    const friend = realm.add(store.create('Moss').profile, 'sentinel', () => {});
    realm.action(friend.profile.id, 'rally', 'crucible');
    realm.broadcast();
    let state = messages.filter((m) => m.type === 'snapshot').at(-1) as Snapshot;
    const listing = state.expeditions!.find((e) => e.dimension === 'crucible')!;
    assert.equal(listing.population, 1);
    assert.equal(listing.travelers[0].name, 'Moss');
    assert.equal(listing.started, false);
    const runId = realm.dungeons.run('crucible')!.id;
    realm.action(p.profile.id, 'rally', 'crucible');
    assert.equal(realm.dungeons.run('crucible')!.id, runId);
    assert.equal(realm.dungeons.list().find((e) => e.dimension === 'crucible')!.population, 2);
    Object.assign(p, realm.dungeons.state('crucible')!.altar);
    realm.action(p.profile.id, 'delve');
    realm.recall(friend);
    realm.broadcast();
    state = messages.filter((m) => m.type === 'snapshot').at(-1) as Snapshot;
    const wire = new Decoder().decode(new Encoder().encode(state));
    assert.equal(wire.expeditions!.find((e) => e.dimension === 'crucible')!.status, 'active');
    assert.equal(wire.expeditions!.find((e) => e.dimension === 'crucible')!.population, 1);
  } finally {
    store.close();
  }
});

test('a persisted clear recap distinguishes full clears from late assists and survives death', () => {
  const { realm, p, store, account } = setup();
  try {
    realm.action(p.profile.id, 'rally', 'hollow');
    realm.time = 10;
    clearStage(realm, p);
    realm.time += 20;
    clearStage(realm, p);
    realm.time += 30;
    const friend = realm.add(store.create('Late Light').profile, 'ranger', () => {});
    realm.action(friend.profile.id, 'rally', 'hollow');
    Object.assign(friend, { x: 0, z: -20 });
    clearStage(realm, p);
    const result = p.profile.lastExpedition!;
    assert.equal(result.chambers, 3);
    assert.equal(result.elapsed, 50);
    assert.equal(result.shards, 3, 'only the clear bonus is attributed to the recap');
    assert.equal(result.gold, 80);
    assert.deepEqual(new Set(result.crew.map((c) => c.name)), new Set(['Lumen', 'Late Light']));
    assert.equal(friend.profile.lastExpedition!.chambers, 1);
    assert.equal(friend.profile.lastExpedition!.shards, 0);
    assert.equal(friend.profile.lastExpedition!.gold, 0);
    assert.equal(friend.profile.lastExpedition!.id, result.id);
    assert.equal(store.authenticate(account.token)!.lastExpedition!.id, result.id);
    realm.die(p, 'Test storm');
    assert.equal(store.authenticate(account.token)!.lastExpedition!.id, result.id);
  } finally {
    store.close();
  }
});

test('relic tracking persists a validated goal and accurately exposes the next guaranteed drop', async () => {
  const { relicChase } = await import('../shared/chase.js');
  const { realm, p, store, account } = setup();
  try {
    realm.action(p.profile.id, 'track', 'archivist');
    assert.equal(store.authenticate(account.token)!.trackedRelic, 'archivist');
    realm.action(p.profile.id, 'track', 'constructor');
    assert.equal(p.profile.trackedRelic, 'archivist');
    const legacy = ensureLegacy(p.profile);
    legacy.bossKills.archivist = 5;
    assert.equal(relicChase(p.profile, 'archivist')!.untilGuaranteed, 1);
    legacy.bossKills.archivist++;
    assert.equal(relicChase(p.profile, 'archivist')!.untilGuaranteed, 6);
    assert.equal(relicChase(p.profile, 'constructor'), undefined);
    realm.action(p.profile.id, 'track', '');
    assert.equal(store.authenticate(account.token)!.trackedRelic, undefined);
  } finally {
    store.close();
  }
});
