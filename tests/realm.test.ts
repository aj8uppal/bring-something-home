import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/database.js';
import { BUDGET_INTERVAL, Realm } from '../server/realm.js';
import { ECOLOGY } from '../shared/biomes.js';
import { templateOf } from '../shared/instances.js';
import { layoutFor } from '../shared/layout.js';
import { WORLD_EVENTS } from '../shared/events.js';
import { createCharacter, grantXp, makeItem, stats } from '../server/model.js';
import {
  CLASSES,
  DUNGEONS,
  ENEMIES,
  GATE_SPAWNS,
  HAVEN,
  MAX_INVENTORY,
  QUESTS,
  distance,
  isSafe,
  zoneAt,
} from '../shared/content.js';
import { canMove, inBounds, PROPS } from '../shared/world.js';
import type { ClassId, ServerMessage } from '../shared/types.js';
function setup(classId: ClassId = 'arcanist') {
  const store = new Store(':memory:'),
    realm = new Realm('test', 'Test Hearth', store),
    account = store.create('Aster'),
    messages: ServerMessage[] = [];
  const p = realm.add(account.profile, classId, (m) => messages.push(structuredClone(m)));
  realm.enemies.clear();
  return { store, realm, p, account, messages, c: p.profile.character! };
}
function step(realm: Realm, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / 0.05); i++) realm.step();
}
test('all three classes start with valid equipment and distinct combat roles', () => {
  for (const cls of ['arcanist', 'ranger', 'sentinel'] as const) {
    const c = createCharacter(cls);
    assert.equal(c.hp, CLASSES[cls].hp);
    assert.equal(c.equipment.weapon?.slot, 'weapon');
    assert.equal(c.potions, 3);
    assert.ok(stats(c).damage > CLASSES[cls].damage);
  }
  assert.ok(CLASSES.ranger.speed > CLASSES.arcanist.speed);
  assert.ok(CLASSES.sentinel.hp > CLASSES.ranger.hp);
});
test('large XP grants resolve every level, restore vitals, and stop at level 20', () => {
  const c = createCharacter('arcanist');
  c.hp = 5;
  assert.ok(grantXp(c, 100000));
  assert.equal(c.level, 20);
  assert.equal(c.xp, 0);
  assert.equal(c.hp, stats(c).maxHp);
  assert.equal(grantXp(c, 300), false);
});
test('server normalizes diagonal movement and expires stale inputs', () => {
  const { realm, p } = setup();
  const start = { x: p.x, z: p.z };
  realm.input(p.profile.id, { x: 1, z: 1, angle: 0, fire: false, seq: 1 });
  step(realm, 0.2);
  const moved = Math.hypot(p.x - start.x, p.z - start.z);
  assert.ok(moved <= CLASSES.arcanist.speed * 0.2 + 0.001);
  assert.ok(moved > 1);
  step(realm, 0.5);
  const after = { x: p.x, z: p.z };
  step(realm, 0.5);
  assert.equal(p.x, after.x);
  assert.equal(p.z, after.z);
});
test('replayed input sequence cannot change movement or fire state', () => {
  const { realm, p } = setup();
  realm.input(p.profile.id, { x: 1, z: 0, angle: 0, fire: false, seq: 5 });
  realm.input(p.profile.id, { x: -1, z: 0, angle: 0, fire: true, seq: 4 });
  assert.equal(p.input.x, 1);
  assert.equal(p.input.fire, false);
});
test('terrain collisions and island boundaries are enforced', () => {
  assert.equal(inBounds(100, 0), true, 'the outer ring is walkable');
  assert.equal(inBounds(200, 0), false, 'the wilds still end');
  // A generated instance is bounded by its own rooms, not by a fixed square.
  const store = new Store(':memory:'),
    realm = new Realm('bounds', 'Bounds', store);
  const run = realm.dungeons.open('hollow');
  const layout = layoutFor(run.id)!;
  assert.ok(inBounds(0, 22, run.id), 'the entry room is standable');
  assert.equal(inBounds(layout.bounds.maxX + 20, 0, run.id), false, 'and the rooms end');
  for (const room of layout.rooms) assert.ok(inBounds(room.x, room.z, run.id), room.name);
  store.close();
  const rock = PROPS.find((p) => p.radius > 0)!;
  assert.equal(canMove(rock.x, rock.z, 'wilds'), false);
  assert.equal(canMove(0, 20, 'wilds'), true);
});
test('Hearth blocks outgoing attacks and incoming hostile damage', () => {
  const { realm, p, c } = setup();
  p.invulnerableUntil = 0;
  const hp = c.hp;
  realm.input(p.profile.id, { x: 0, z: 0, angle: 0, fire: true, seq: 1 });
  realm.shot(
    { x: -2, z: p.z, dimension: 'wilds' },
    0,
    20,
    100,
    'e',
    false,
    1,
    '#fff',
    0.4,
    0,
    'Test',
  );
  step(realm, 0.2);
  assert.equal(c.hp, hp);
  assert.ok([...realm.bullets.values()].every((b) => !b.friendly));
});
test('real projectiles collide with enemies, grant XP, and create owned loot', () => {
  const { realm, p, c } = setup();
  p.x = 0;
  p.z = -3;
  const enemy = realm.spawn('cinderling', 0, -8, 'wilds');
  enemy.hp = 1;
  realm.input(p.profile.id, { x: 0, z: 0, angle: -Math.PI / 2, fire: true, seq: 1 });
  step(realm, 0.35);
  assert.equal(realm.enemies.has(enemy.id), false);
  assert.equal(c.kills, 1);
  assert.ok(c.xp > 0);
  assert.ok(c.gold > 0);
});
test('fast projectiles use swept collision rather than skipping over players', () => {
  const { realm, p, c } = setup();
  p.x = 0;
  p.z = -10;
  p.invulnerableUntil = 0;
  const hp = c.hp;
  realm.shot(
    { x: -8, z: -10, dimension: 'wilds' },
    0,
    300,
    25,
    'evil',
    false,
    1,
    '#fff',
    0.2,
    0,
    'Fast shot',
  );
  realm.step();
  assert.equal(c.hp, hp - 25);
});
test('dodge gives brief invulnerability and respects its server cooldown', () => {
  const { realm, p, c } = setup();
  p.x = 0;
  p.z = -10;
  p.invulnerableUntil = 0;
  realm.action(p.profile.id, 'dash');
  const cooldown = p.cooldowns.dash;
  realm.action(p.profile.id, 'dash');
  assert.equal(p.cooldowns.dash, cooldown);
  realm.shot(
    { x: -2, z: -10, dimension: 'wilds' },
    0,
    100,
    80,
    'e',
    false,
    1,
    '#fff',
    2,
    0,
    'Shot',
  );
  realm.step();
  assert.equal(c.hp, CLASSES.arcanist.hp);
  assert.ok(p.invulnerableUntil > realm.time);
});
test('class abilities spend mana once, clear bullets, and enforce cooldowns', () => {
  const { realm, p, c } = setup();
  p.x = 0;
  p.z = -10;
  realm.shot(p, 0, 5, 20, 'e', false, 4, '#fff');
  const before = c.mp;
  realm.action(p.profile.id, 'ability');
  assert.equal(c.mp, before - CLASSES.arcanist.abilityCost);
  assert.equal([...realm.bullets.values()].filter((b) => !b.friendly).length, 0);
  assert.equal([...realm.bullets.values()].filter((b) => b.friendly).length, 24);
  realm.action(p.profile.id, 'ability');
  assert.equal(c.mp, before - CLASSES.arcanist.abilityCost);
});
test('Sentinel ward heals nearby allies in the same dimension', () => {
  const { realm, p, store } = setup('sentinel');
  const ally = realm.add(store.create('Birch').profile, 'ranger', () => {});
  p.z = -10;
  ally.z = -12;
  ally.profile.character!.hp = 10;
  realm.action(p.profile.id, 'ability');
  assert.ok(ally.profile.character!.hp > 10);
  assert.ok(p.invulnerableUntil > realm.time + 1);
});
test('potion cannot be spent at full health and respects its carry and cooldown limits', () => {
  const { realm, p, c } = setup();
  realm.action(p.profile.id, 'potion');
  assert.equal(c.potions, 3);
  c.hp = 10;
  realm.action(p.profile.id, 'potion');
  assert.equal(c.potions, 2);
  assert.equal(c.hp, 10 + CLASSES.arcanist.hp * 0.45);
  realm.action(p.profile.id, 'potion');
  assert.equal(c.potions, 2);
});
test('nearby co-op allies share kills; distant travelers do not', () => {
  const { realm, p, store, c } = setup();
  p.x = 0;
  p.z = -10;
  const ally = realm.add(store.create('Birch').profile, 'ranger', () => {});
  ally.x = 3;
  ally.z = -10;
  const far = realm.add(store.create('Cedar').profile, 'sentinel', () => {});
  far.x = 70;
  far.z = 15;
  const e = realm.spawn('rootwarden', 0, -12, 'wilds');
  e.contributors.set(p.profile.id, realm.time);
  realm.killEnemy(e, [p, ally, far]);
  assert.equal(c.kills, 1);
  assert.equal(ally.profile.character!.kills, 1);
  assert.equal(far.profile.character!.kills, 0);
  assert.equal(realm.loot.size, 2);
});
test('snapshots contain only personal loot and no account credentials', () => {
  const { realm, p, store, messages } = setup();
  p.x = 0;
  p.z = -10;
  const otherMessages: ServerMessage[] = [];
  const ally = realm.add(store.create('Birch').profile, 'ranger', (m) => otherMessages.push(m));
  ally.z = -11;
  const e = realm.spawn('rootwarden', 0, -12, 'wilds');
  realm.killEnemy(e, [p, ally]);
  realm.broadcast();
  const a = messages.findLast((m) => m.type === 'snapshot'),
    b = otherMessages.findLast((m) => m.type === 'snapshot');
  assert.equal(a?.type, 'snapshot');
  assert.equal(b?.type, 'snapshot');
  if (a?.type === 'snapshot' && b?.type === 'snapshot') {
    assert.equal(a.loot.length, 1);
    assert.equal(b.loot.length, 1);
    assert.notEqual(a.loot[0].id, b.loot[0].id);
    assert.equal(JSON.stringify(a).includes('token'), false);
  }
});
test('equipment, vault, and forge transactions cannot duplicate items', () => {
  const { realm, p, c } = setup();
  const item = makeItem('armor', 2, 'rare');
  c.inventory.push(item);
  realm.action(p.profile.id, 'store', item.id);
  realm.action(p.profile.id, 'store', item.id);
  assert.equal(p.profile.vault.length, 1);
  assert.equal(c.inventory.length, 0);
  realm.action(p.profile.id, 'withdraw', item.id);
  realm.action(p.profile.id, 'withdraw', item.id);
  assert.equal(c.inventory.length, 1);
  assert.equal(p.profile.vault.length, 0);
  realm.action(p.profile.id, 'equip', item.id);
  assert.equal(c.equipment.armor?.id, item.id);
  assert.equal(c.inventory.length, 0);
});
test('vault and shop reject remote transactions outside the Hearth', () => {
  const { realm, p, c } = setup();
  const item = makeItem('charm', 2, 'rare');
  c.inventory.push(item);
  c.gold = 1000;
  p.z = -10;
  realm.action(p.profile.id, 'store', item.id);
  realm.action(p.profile.id, 'buy', 'weapon');
  realm.action(p.profile.id, 'sell', item.id);
  assert.equal(c.inventory.length, 1);
  assert.equal(c.gold, 1000);
  assert.equal(p.profile.vault.length, 0);
});
test('full inventories do not lose vault items or charge for failed purchases', () => {
  const { realm, p, c } = setup();
  for (let i = 0; i < MAX_INVENTORY; i++) c.inventory.push(makeItem('weapon', 1, 'common'));
  const item = makeItem('charm', 3, 'relic');
  p.profile.vault.push(item);
  c.gold = 200;
  realm.action(p.profile.id, 'withdraw', item.id);
  realm.action(p.profile.id, 'buy', 'armor');
  assert.equal(c.inventory.length, MAX_INVENTORY);
  assert.equal(p.profile.vault.length, 1);
  assert.equal(c.gold, 200);
});
test('tempering consumes exact currencies and is capped at tier 6', () => {
  const { realm, p, c } = setup();
  c.gold = 1000;
  p.profile.embers = 30;
  const item = c.equipment.weapon!;
  const power = item.power;
  realm.action(p.profile.id, 'upgrade', 'weapon');
  assert.equal(item.tier, 2);
  assert.equal(item.power, power + 4);
  assert.equal(c.gold, 950);
  assert.equal(p.profile.embers, 25);
  item.tier = 6;
  realm.action(p.profile.id, 'upgrade', 'weapon');
  assert.equal(item.tier, 6);
  assert.equal(c.gold, 950);
});
test('both portals enter distinct shared dungeons and recall always returns home', () => {
  for (const dim of ['hollow', 'crucible'] as const) {
    const { realm, p, c } = setup();
    p.x = DUNGEONS[dim].x;
    p.z = DUNGEONS[dim].z;
    realm.action(p.profile.id, 'interact');
    assert.equal(templateOf(p.dimension), dim);
    assert.equal(p.z, 22);
    c.potions = 0;
    realm.action(p.profile.id, 'recall');
    assert.equal(p.dimension, 'wilds');
    assert.equal(p.x, 0);
    assert.equal(p.z, 22);
    assert.equal(c.potions, 3);
  }
});
test('three distinct wardens unlock the final boss and a victory restarts the cycle', () => {
  const { realm, p } = setup();
  for (const [i, kind] of ['rootwarden', 'glasswarden', 'duskwarden'].entries()) {
    const e = realm.spawn(kind, 0, -10, 'wilds');
    realm.killEnemy(e, [p]);
    assert.equal(realm.wardens.size, i + 1);
    assert.equal(
      [...realm.enemies.values()].some((e) => e.kind === 'sovereign'),
      i === 2,
    );
  }
  const boss = [...realm.enemies.values()].find((e) => e.kind === 'sovereign')!;
  realm.killEnemy(boss, [p]);
  assert.ok(Number.isFinite(realm.resetAt));
  realm.time = realm.resetAt;
  realm.step();
  assert.equal(realm.wardens.size, 0);
  assert.equal([...realm.enemies.values()].filter((e) => e.kind.endsWith('warden')).length, 3);
});
test('bosses telegraph before firing and escalate their bullet patterns by phase', () => {
  const { realm, p } = setup();
  p.z = -10;
  const e = realm.spawn('archivist', 0, -20, 'wilds');
  e.nextFire = 0.5;
  realm.updateEnemy(e, [p], 0.05);
  assert.ok(e.telegraph > 0);
  e.nextFire = 0;
  realm.updateEnemy(e, [p], 0.05);
  const phase0 = realm.bullets.size;
  assert.ok(phase0 >= 12 && phase0 <= 24);
  realm.bullets.clear();
  e.hp = e.maxHp * 0.2;
  e.nextFire = 0;
  realm.updateEnemy(e, [p], 0.05);
  assert.equal(e.phase, 2);
  assert.equal(
    realm.bullets.size,
    0,
    'phase transitions clear the field and give a breathing window',
  );
  assert.ok(e.nextFire > realm.time + 1);
  e.attack = 2;
  realm.time = e.nextFire;
  realm.updateEnemy(e, [p], 0.05);
  assert.ok(realm.bullets.size > phase0);
});
test('journey objectives award exactly once and advance in order', () => {
  const { realm, p, c } = setup();
  p.z = -10;
  for (let i = 0; i < 6; i++) {
    const e = realm.spawn('cinderling', 0, -11, 'wilds');
    realm.killEnemy(e, [p]);
  }
  assert.equal(c.quest, 1);
  assert.equal(c.questProgress, 0);
  assert.equal(p.profile.embers, 5);
  assert.ok(c.gold >= QUESTS[0].gold);
  const e = realm.spawn('cinderling', 0, -11, 'wilds');
  realm.killEnemy(e, [p]);
  assert.equal(c.quest, 1);
  assert.equal(p.profile.embers, 5);
});
test('a realm event spawns two waves and rewards participating travelers', () => {
  const { realm, p, c } = setup();
  realm.startEvent('wandering-star');
  p.x = realm.event.x!;
  p.z = realm.event.z!;
  assert.equal(realm.event.active, true);
  assert.equal(realm.event.name, 'The Wandering Star');
  for (let wave = 0; wave < 2; wave++) {
    for (const e of [...realm.enemies.values()].filter((e) => e.event)) realm.killEnemy(e, [p]);
    realm.step();
  }
  assert.equal(realm.event.active, false);
  assert.ok(p.profile.embers >= 10);
  assert.ok(c.gold >= 60);
});
test('every event in the table runs, announces a place, and pays out', () => {
  const { realm, p } = setup();
  for (const def of WORLD_EVENTS) {
    realm.event.id = undefined;
    realm.startEvent(def.id);
    assert.equal(realm.event.id, def.id, def.id);
    assert.ok(realm.event.name && realm.event.place && realm.event.beacon, def.id);
    assert.ok(
      [...realm.enemies.values()].some((e) => e.event),
      `${def.id} raised a wave`,
    );
    p.x = realm.event.x!;
    p.z = realm.event.z!;
    const embers = p.profile.embers;
    // Credit the objective directly: the shapes differ, the payout contract does not.
    realm.event.kills = realm.event.target;
    realm.step();
    assert.equal(realm.event.active, false, `${def.id} ended`);
    assert.ok(p.profile.embers > embers, `${def.id} paid`);
    assert.equal(
      [...realm.enemies.values()].some((e) => e.event),
      false,
      `${def.id} cleaned up`,
    );
  }
});
test('permadeath atomically records a grave and preserves only persistent progress', () => {
  const { realm, p, c, store, account } = setup();
  const item = makeItem('charm', 4, 'relic');
  p.profile.vault.push(item);
  c.inventory.push(makeItem('armor', 3, 'rare'));
  c.gold = 999;
  c.kills = 10;
  c.level = 5;
  realm.die(p, 'The Rootbound');
  const saved = store.authenticate(account.token)!;
  assert.equal(saved.character, null);
  assert.equal(saved.vault[0].id, item.id);
  assert.equal(saved.graves.length, 1);
  assert.equal(saved.graves[0].cause, 'The Rootbound');
  assert.equal(store.leaderboard().length, 1);
  assert.ok(saved.embers > 0);
  assert.equal(realm.players.has(p.profile.id), false);
});
test('disconnect leaves a vulnerable body briefly, then saves and removes it', () => {
  const { realm, p, store, account, c } = setup();
  p.z = -10;
  c.gold = 55;
  realm.disconnect(p.profile.id);
  step(realm, 7);
  assert.ok(realm.players.has(p.profile.id));
  step(realm, 1.1);
  assert.equal(realm.players.has(p.profile.id), false);
  assert.equal(store.authenticate(account.token)?.character?.gold, 55);
});
test('reconnect resumes the same body and resets its input sequence', () => {
  const { realm, p, account } = setup();
  p.z = -10;
  realm.input(p.profile.id, { x: 0, z: 1, angle: 1, fire: true, seq: 99 });
  realm.disconnect(p.profile.id);
  const rejoined = realm.add(account.profile, 'ranger', () => {});
  assert.equal(rejoined, p);
  assert.equal(rejoined.z, -10);
  assert.equal(rejoined.profile.character!.classId, 'arcanist');
  assert.equal(rejoined.lastSeq, -1);
  assert.equal(rejoined.input.fire, false);
});
test('an idle boss cannot accumulate an unbounded telegraph outside its firing range', () => {
  const { realm, p } = setup();
  realm.time = 200;
  const boss = realm.spawn('archivist', 0, -20, 'wilds');
  boss.nextFire = 1;
  p.z = 13;
  realm.updateEnemy(boss, [p], 0.05);
  assert.equal(boss.telegraph, 0);
  assert.equal(realm.bullets.size, 0);
  assert.ok(boss.nextFire > realm.time);
  p.z = -10;
  realm.updateEnemy(boss, [p], 0.05);
  assert.ok(boss.telegraph >= 0 && boss.telegraph <= 1);
});

test('first upgrade is guaranteed and repeatable hunts award trait gear without inventory loss', () => {
  const { realm, p, c } = setup();
  p.z = -10;
  realm.rng = () => 0.99;
  for (let i = 0; i < 3; i++) realm.killEnemy(realm.spawn('cinderling', 0, -11, 'wilds'), [p]);
  const first = [...realm.loot.values()].find((d) => d.item.slot === 'weapon');
  assert.equal(first?.item.tier, 2);
  assert.ok(first!.item.power > c.equipment.weapon!.power);
  for (let i = 3; i < 8; i++) realm.killEnemy(realm.spawn('cinderling', 0, -11, 'wilds'), [p]);
  assert.equal(c.huntRound, 1);
  assert.equal(c.huntKills, 0);
  assert.ok([...realm.loot.values()].some((d) => d.item.rarity === 'rare' && d.item.trait));
  assert.equal(c.potions, 4);
  for (let i = 0; i < 10; i++) realm.killEnemy(realm.spawn('cinderling', 0, -11, 'wilds'), [p]);
  assert.equal(c.huntRound, 2);
  realm.killEnemy(realm.spawn('cinderling', 0, -11, 'wilds'), [p]);
  assert.equal(c.huntKills, 0, 'higher hunts require higher tier targets');
});
test('attack telegraphs lock aim and fire at the committed direction', () => {
  const { realm, p } = setup();
  p.z = -10;
  const enemy = realm.spawn('cinderling', 0, -18, 'wilds');
  enemy.nextFire = 0.5;
  realm.updateEnemy(enemy, [p], 0.05);
  const angle = enemy.angle;
  assert.ok(enemy.telegraph > 0);
  p.x = 7;
  realm.time = 0.45;
  realm.updateEnemy(enemy, [p], 0.05);
  assert.equal(enemy.angle, angle);
  realm.time = 0.5;
  realm.updateEnemy(enemy, [p], 0.05);
  const shot = [...realm.bullets.values()][0];
  assert.ok(shot);
  assert.ok(Math.abs(Math.atan2(shot.vz, shot.vx) - angle) < 0.00001);
});
test('weapon traits change authoritative attack patterns and rate', () => {
  const { realm, p, c } = setup();
  p.z = -10;
  c.equipment.weapon!.trait = 'echo';
  realm.input(p.profile.id, { x: 0, z: 0, angle: 0, fire: true, seq: 1 });
  realm.step();
  assert.equal(realm.bullets.size, 2);
  const first = [...realm.bullets.values()][0];
  assert.ok(Math.abs(first.damage - stats(c).damage * 0.65) < 0.001);
  c.equipment.weapon!.trait = 'pierce';
  realm.bullets.clear();
  p.nextFire = 0;
  realm.step();
  assert.equal([...realm.bullets.values()][0].pierce, 3);
  c.equipment.weapon!.trait = 'swift';
  assert.ok(stats(c).rate < CLASSES[c.classId].rate);
});
test('chains reward continued combat, expire naturally, and reset on recall', () => {
  const { realm, p } = setup();
  p.z = -10;
  for (let i = 0; i < 5; i++) realm.killEnemy(realm.spawn('cinderling', 0, -11, 'wilds'), [p]);
  assert.equal(p.chainKills, 5);
  realm.time += 13;
  realm.step();
  assert.equal(p.chainKills, 0);
  realm.killEnemy(realm.spawn('cinderling', 0, -11, 'wilds'), [p]);
  assert.equal(p.chainKills, 1);
  realm.recall(p);
  assert.equal(p.chainKills, 0);
});
test('movement acknowledgements report applied input time and reset across teleports', () => {
  const { realm, p, messages } = setup();
  realm.input(p.profile.id, { x: 1, z: 0, angle: 0, fire: false, seq: 8 });
  realm.step();
  realm.step();
  const frame = messages.filter((m) => m.type === 'snapshot').at(-1)!;
  assert.equal(frame.motion?.seq, 8);
  assert.equal(frame.motion?.heldFor, 0.1);
  const epoch = frame.motion!.epoch;
  realm.recall(p);
  realm.broadcast();
  assert.equal(messages.filter((m) => m.type === 'snapshot').at(-1)!.motion!.epoch, epoch + 1);
});

test('boss health scales at engagement and resets after the group leaves', () => {
  const { realm, p, store } = setup();
  p.z = -12;
  const other = realm.add(store.create('Friend').profile, 'ranger', () => {});
  other.z = -12;
  const boss = realm.spawn('rootwarden', 0, -18, 'wilds');
  realm.shot(
    { x: 0, z: -16, dimension: 'wilds' },
    -Math.PI / 2,
    20,
    1,
    p.profile.id,
    true,
    1,
    '#fff',
  );
  realm.step();
  assert.equal(boss.scaledFor, 2);
  assert.ok(boss.maxHp > ENEMIES.rootwarden.hp);
  const max = boss.maxHp;
  realm.step();
  assert.equal(boss.maxHp, max);
  realm.recall(p);
  realm.recall(other);
  realm.time += 11;
  realm.updateEnemy(boss, [p, other], 0.05);
  assert.equal(boss.maxHp, ENEMIES.rootwarden.hp);
  assert.equal(boss.scaledFor, 0);
});

test('boss relics have a predictable identity and the third kill never downgrades boss loot', () => {
  const { realm, p, c } = setup();
  p.z = -10;
  c.kills = 2;
  realm.rng = () => 0.1;
  realm.killEnemy(realm.spawn('duskwarden', 0, -11, 'wilds'), [p]);
  const drop = [...realm.loot.values()].find((d) => d.item.rarity === 'relic');
  assert.equal(drop?.item.name, 'Two Bells at Dusk');
  assert.equal(drop?.item.trait, 'echo');
  assert.equal(drop?.item.slot, 'weapon');
});

test('travelers inside the sanctuary cannot farm shared combat rewards', () => {
  const { realm, p, c } = setup();
  p.x = 0;
  p.z = 9;
  realm.killEnemy(realm.spawn('cinderling', 0, -6, 'wilds'), [p]);
  assert.equal(c.kills, 0);
  assert.equal(c.xp, 0);
  assert.equal(c.gold, 0);
});

test('Hearth columns block walking and dashing without closing the sanctuary roads', async () => {
  const { move } = await import('../shared/world.js');
  for (const x of [-9, 9])
    for (const z of [15, 25]) {
      assert.equal(canMove(x, z, 'wilds'), false);
      const p = { x: x - 2, z };
      move(p, 4, 0, 'wilds');
      assert.ok(p.x < x - 1);
    }
  for (let x = -12; x <= 12; x++) assert.ok(canMove(x, 20, 'wilds'));
});

function populated() {
  const store = new Store(':memory:'),
    realm = new Realm('gate', 'Gate', store);
  const creatures = () => [...realm.enemies.values()].filter((e) => !e.boss);
  const inZone = (zone: string) => creatures().filter((e) => e.zone === zone).length;
  return { store, realm, creatures, inZone };
}
test('two cinderlings wait at the gate, outside the sanctuary, and never step inside it', () => {
  const { store, realm, creatures } = populated();
  try {
    const gate = creatures().filter((e) => e.zone === 'gate');
    assert.equal(gate.length, GATE_SPAWNS.length);
    for (const e of gate) {
      assert.ok(!isSafe(e, 'wilds'));
      assert.ok(distance(e, HAVEN) > HAVEN.radius && distance(e, HAVEN) < 17);
      assert.ok(distance(e, { x: 0, z: 22 }) < 20, 'visible from spawn');
    }
    const p = realm.add(store.create('Aster').profile, 'arcanist', () => {});
    assert.equal(p.input.angle, -Math.PI / 2, 'new travelers face north');
    // Stand just outside the edge so the gate creatures advance, and watch them stop short.
    p.x = -9;
    p.z = 12;
    p.invulnerableUntil = Infinity;
    for (let i = 0; i < 600; i++) realm.step();
    for (const e of creatures().filter((e) => e.zone === 'gate')) assert.ok(!isSafe(e, 'wilds'));
    // A fallen gate creature always returns to its post, whatever the budget says.
    const [first] = creatures().filter((e) => e.zone === 'gate');
    realm.killEnemy(first, []);
    assert.ok(realm.respawns.some((r) => r.fixed && r.x === first.homeX));
  } finally {
    store.close();
  }
});
test('the spawn budget keeps solo counts and timers, then grows and holds the floor with company', () => {
  const { store, realm, inZone } = populated();
  try {
    for (const eco of ECOLOGY)
      assert.ok(inZone(eco.place) >= eco.baseCount, `${eco.place} ${inZone(eco.place)}`);
    const meadow = ECOLOGY.find((z) => z.place === 'meadow')!;
    // Solo: a kill leaves the meadow one short until its own 25 s respawn fires.
    const solo = realm.add(store.create('Solo').profile, 'arcanist', () => {});
    solo.x = -11;
    solo.z = -10;
    solo.invulnerableUntil = Infinity;
    const victim = [...realm.enemies.values()].find((e) => e.zone === 'meadow')!;
    realm.killEnemy(victim, [solo]);
    for (let i = 0; i < (BUDGET_INTERVAL + 1) * 20; i++) realm.step();
    assert.equal(inZone('meadow'), meadow.baseCount - 1);
    for (let i = 0; i < 20 * 20; i++) realm.step();
    assert.equal(inZone('meadow'), meadow.baseCount);
    // Company: twenty travelers raise the target and the floor never sits below base.
    const crowd = Array.from({ length: 19 }, (_, i) =>
      realm.add(store.create(`Crowd ${i}`).profile, 'ranger', () => {}),
    );
    for (const p of crowd) {
      p.x = -8 + (p.profile.name.length % 3);
      p.z = -12;
      p.invulnerableUntil = Infinity;
    }
    for (let i = 0; i < (BUDGET_INTERVAL + 1) * 20; i++) realm.step();
    const target = Math.min(meadow.cap, meadow.baseCount + Math.floor(meadow.perPlayer * 20));
    assert.equal(inZone('meadow'), target);
    for (const e of [...realm.enemies.values()].filter((e) => e.zone === 'meadow'))
      realm.killEnemy(e, [solo]);
    assert.equal(inZone('meadow'), 0);
    for (let i = 0; i < BUDGET_INTERVAL * 20 + 1; i++) realm.step();
    assert.ok(inZone('meadow') >= meadow.baseCount, 'restored within five seconds');
    // Queued respawns do not later overshoot the target.
    for (let i = 0; i < 45 * 20; i++) realm.step();
    assert.ok(inZone('meadow') <= target, `${inZone('meadow')} <= ${target}`);
    for (const e of [...realm.enemies.values()]) assert.ok(!isSafe(e, e.dimension));
  } finally {
    store.close();
  }
});
test('a 1 Hz roster names every connected traveler, and travel lands beside a friend in the wilds', () => {
  const { realm, p, store, messages } = setup();
  const otherMessages: ServerMessage[] = [];
  const friend = realm.add(store.create('Birch').profile, 'ranger', (m) => otherMessages.push(m));
  friend.x = 30;
  friend.z = -20;
  const ghost = realm.add(store.create('Cedar').profile, 'sentinel', () => {});
  realm.disconnect(ghost.profile.id);
  step(realm, 1.1);
  const withRoster = messages.filter((m) => m.type === 'snapshot' && m.roster);
  assert.ok(withRoster.length >= 1 && withRoster.length <= 2, `${withRoster.length} rosters`);
  const roster = (withRoster.at(-1) as { roster: { id: string; name: string; x: number }[] })
    .roster;
  assert.deepEqual(roster.map((r) => r.name).sort(), ['Aster', 'Birch']);
  assert.equal(roster.find((r) => r.name === 'Birch')?.x, 30);
  const epoch = p.epoch;
  realm.action(p.profile.id, 'travel', friend.profile.id);
  assert.ok(Math.abs(distance(p, friend) - 2) < 0.01);
  assert.equal(p.epoch, epoch + 1);
  assert.ok(p.invulnerableUntil >= realm.time + 2);
  assert.ok(p.cooldowns.travel > realm.time + 19);
  assert.ok(realm.effects.some((e) => e.kind === 'portal' && distance(e, p) < 0.01));
  realm.recall(p);
  realm.action(p.profile.id, 'travel', friend.profile.id);
  assert.equal(p.z, 22, 'a second travel waits for the cooldown');
  assert.equal(zoneAt(friend.x, friend.z).id, 'glass');
});

test('the realm reports living overworld bosses so a distant fight shows on the atlas', () => {
  const { realm, p } = setup();
  const warden = realm.spawn('duskwarden', 0, -35, 'wilds');
  const listed = () => realm.info().bosses ?? [];
  assert.equal(listed().length, 1);
  assert.equal(listed()[0].kind, 'duskwarden');
  assert.equal(listed()[0].hp, 1);
  warden.hp = warden.maxHp * 0.4;
  assert.ok(Math.abs(listed()[0].hp - 0.4) < 0.001);
  // Dungeon bosses belong to their own run, never to the overworld map.
  realm.spawn('archivist', 0, 0, 'hollow');
  assert.equal(listed().length, 1);
  realm.killEnemy(warden, [p]);
  assert.equal(listed().length, 0);
});
