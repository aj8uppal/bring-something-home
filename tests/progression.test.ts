import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/database.js';
import { Realm } from '../server/realm.js';
import { makeItem } from '../server/model.js';
import { bagItems } from '../shared/loot.js';
import {
  CHAPTER_CACHES,
  REGIONS,
  chapterGoal,
  huntContract,
  journeyGoal,
  journeyGoals,
  journeyTarget,
  primaryGoal,
} from '../shared/progression.js';
import { BIOME_PLACES, PLACES, placeAt, threatOf, threatOfTier, WILDS } from '../shared/places.js';
import { ensureLegacy } from '../shared/endgame.js';
import { DUNGEONS, ENEMIES, GATE_SPAWNS, ZONES, distance, xpForLevel } from '../shared/content.js';
import { COMBAT_CLEARINGS, PROPS } from '../shared/world.js';
import type { Snapshot } from '../shared/types.js';

function setup() {
  const store = new Store(':memory:'),
    realm = new Realm('path', 'Path', store);
  const account = store.create('Lark');
  const p = realm.add(account.profile, 'arcanist', () => {});
  const c = p.profile.character!;
  const snapshot = () =>
    ({
      self: realm.publicPlayer(p),
      realm: realm.info(),
      enemies: [...realm.enemies.values()],
      loot: [...realm.loot.values()].filter((b) => b.owner === p.profile.id),
      players: [],
    }) as unknown as Snapshot;
  return { store, realm, p, c, snapshot, account };
}

test('a fresh traveler has a concrete route and prepares before being sent to a warden', () => {
  const { store, realm, p, c, snapshot } = setup();
  try {
    const first = journeyGoal(p.profile, snapshot());
    assert.equal(first.id, 'first-gate');
    assert.doesNotMatch(first.reward, /T2|charm|ember/);
    // From spawn the compass points at a real gate creature, not at a portal.
    const aim = journeyTarget(first, snapshot());
    assert.ok(
      GATE_SPAWNS.some((g) => distance(g, aim) < 0.01),
      JSON.stringify(aim),
    );
    p.z = -10;
    realm.rng = () => 0.99;
    for (let i = 0; i < 6; i++) realm.killEnemy(realm.spawn('cinderling', 0, -11, 'wilds'), [p]);
    assert.equal(c.quest, 1);
    assert.equal(journeyGoal(p.profile, snapshot()).id, 'train-5');
    const items = [...realm.loot.values()].flatMap(bagItems);
    for (const slot of ['weapon', 'armor', 'charm'])
      assert.ok(
        items.some((i) => i.slot === slot && i.tier === 2),
        `guaranteed starter ${slot}`,
      );
    c.level = 5;
    assert.equal(journeyGoal(p.profile, snapshot()).id, 'first-grove');
    c.visited = ['meadow', 'grove'];
    assert.equal(journeyGoal(p.profile, snapshot()).enemy, 'rootwarden');
    realm.wardens.add('rootwarden');
    assert.equal(journeyGoal(p.profile, snapshot()).enemy, 'duskwarden');
    realm.wardens.add('duskwarden');
    realm.wardens.add('glasswarden');
    assert.equal(
      journeyGoal(p.profile, snapshot()).dungeon,
      'hollow',
      'an underleveled traveler gets a useful task while all seals are already broken',
    );
  } finally {
    store.close();
  }
});

test('the first arc advances on what the traveler just saw: gate, bag, wear, clear, grove, warden', () => {
  const { store, realm, p, c, snapshot } = setup();
  try {
    p.z = -10;
    realm.rng = () => 0.99;
    const goal = () => journeyGoal(p.profile, snapshot());
    // a. three kills at the gate, progress out of three
    assert.equal(goal().id, 'first-gate');
    assert.equal(goal().total, 3);
    realm.killEnemy(realm.spawn('cinderling', 0, -11, 'wilds'), [p]);
    realm.killEnemy(realm.spawn('cinderling', 0, -11, 'wilds'), [p]);
    assert.equal(goal().current, 2);
    assert.equal(goal().id, 'first-gate');
    // b. the third kill drops a weapon; the objective targets that bag
    realm.killEnemy(realm.spawn('cinderling', 0, -11, 'wilds'), [p]);
    const bag = [...realm.loot.values()].find((b) => bagItems(b).some((i) => i.slot === 'weapon'))!;
    assert.ok(bag);
    assert.equal(goal().id, 'first-bag');
    assert.match(goal().title, /Take it \(X\)/);
    assert.equal(journeyTarget(goal(), snapshot()).x, bag.x);
    assert.equal(journeyTarget(goal(), snapshot()).z, bag.z);
    // c. once carried and not worn, the step is to wear it
    p.x = bag.x;
    p.z = bag.z;
    realm.action(p.profile.id, 'loot-all', bag.id);
    const weapon = c.inventory.find((i) => i.slot === 'weapon')!;
    assert.ok(weapon);
    assert.equal(goal().id, 'first-wear');
    assert.match(goal().title, /or G/);
    // (a) again: worn, three more to the six-kill cache
    realm.action(p.profile.id, 'equip', weapon.id);
    assert.equal(c.equipment.weapon?.id, weapon.id);
    assert.equal(goal().id, 'first-clear');
    assert.equal(goal().total, 6);
    assert.equal(goal().current, 3);
    assert.doesNotMatch(goal().reward, /ember|shard|T2/);
    p.z = -10;
    for (let i = 0; i < 3; i++) realm.killEnemy(realm.spawn('cinderling', 0, -11, 'wilds'), [p]);
    assert.equal(c.quest, 1);
    assert.equal(goal().id, 'train-5');
    assert.doesNotMatch(goal().reward, /ember/);
    // d. at level 5 the first warden is introduced by its place
    c.level = 5;
    assert.equal(goal().id, 'first-grove');
    assert.equal(goal().title, 'Reach the Hollow Grove');
    assert.equal(goal().enemy, undefined);
    assert.equal(goal().target.x, REGIONS[1].x);
    assert.equal(goal().target.z, REGIONS[1].z);
    // e. entering the grove is observed by the server and wakes the warden step
    p.x = REGIONS[1].x;
    p.z = REGIONS[1].z;
    realm.step();
    assert.ok(c.visited?.includes('grove'));
    assert.equal(goal().title, 'Wake the Rootbound');
    assert.equal(goal().enemy, 'rootwarden');
    // an already-broken grove seal skips the grove introduction
    realm.wardens.add('rootwarden');
    assert.equal(goal().enemy, 'duskwarden');
    assert.equal(goal().title, 'Defeat your first warden');
  } finally {
    store.close();
  }
});

test('chapter caches are awarded once, stay collectable with a full satchel, and old saves retain chapter credit', () => {
  const { store, realm, p, c } = setup();
  try {
    c.inventory = Array.from({ length: 18 }, () => makeItem('weapon', 1, 'common'));
    c.kills = 6;
    realm.completeJourney(p);
    assert.equal(c.inventory.length, 18);
    assert.equal([...realm.loot.values()].flatMap(bagItems).length, CHAPTER_CACHES[0].slots.length);
    const gold = c.gold,
      embers = p.profile.embers;
    realm.completeJourney(p);
    realm.completeJourney(p);
    assert.equal(c.gold, gold);
    assert.equal(p.profile.embers, embers);
    assert.equal([...realm.loot.values()].flatMap(bagItems).length, 2);
    c.bosses = ['archivist', 'forgemother'];
    realm.completeJourney(p);
    assert.equal(c.quest, 1, 'unearned warden milestone is not fabricated');
    c.bosses.push('sovereign');
    realm.completeJourney(p);
    assert.equal(
      c.quest,
      5,
      'Sovereign also credits a seal, and previously defeated keepers are remembered',
    );
  } finally {
    store.close();
  }
});

test('contracts award the displayed XP and rotate all three equipment slots', () => {
  const { store, realm, p, c } = setup();
  try {
    p.z = -10;
    realm.rng = () => 0.99;
    c.quest = 8;
    assert.deepEqual(
      [0, 1, 2].map((round) => huntContract({ ...c, huntRound: round }).slot),
      ['weapon', 'armor', 'charm'],
    );
    c.huntKills = 7;
    const contract = huntContract(c);
    realm.killEnemy(realm.spawn('cinderling', 0, -11, 'wilds'), [p]);
    assert.equal(c.level, 2);
    assert.equal(c.xp, ENEMIES.cinderling.xp + contract.xp - xpForLevel(1));
    assert.equal(c.huntRound, 1);
    assert.ok(
      [...realm.loot.values()]
        .flatMap(bagItems)
        .some(
          (i) => i.slot === contract.slot && i.tier === contract.rewardTier && i.rarity === 'rare',
        ),
    );
  } finally {
    store.close();
  }
});

test('Crown guidance follows global seals and offers repeatable content during realm renewal', () => {
  const { store, realm, p, c, snapshot } = setup();
  try {
    c.quest = 4;
    c.level = 15;
    assert.equal(journeyGoal(p.profile, snapshot()).enemy, 'rootwarden');
    for (const kind of ['rootwarden', 'duskwarden', 'glasswarden']) realm.wardens.add(kind);
    assert.equal(realm.info().crown, 'open');
    assert.equal(journeyGoal(p.profile, snapshot()).enemy, 'sovereign');
    realm.resetAt = realm.time + 180;
    assert.equal(realm.info().renewal, 180);
    assert.equal(journeyGoal(p.profile, snapshot()).dungeon, 'crucible');
  } finally {
    store.close();
  }
});

test('Elder guidance respects prerequisites, recommends the next unlocked depth, and retains finite endgame goals', () => {
  const { store, p, c, snapshot } = setup();
  try {
    c.quest = 6;
    c.level = 19;
    p.profile.victories = 1;
    assert.equal(journeyGoal(p.profile, snapshot()).dungeon, undefined);
    c.level = 20;
    const legacy = ensureLegacy(p.profile);
    legacy.highestDepth = 2;
    assert.equal(journeyGoal(p.profile, snapshot()).depth, 3);
    c.quest = 8;
    legacy.highestDepth = 12;
    assert.equal(journeyGoal(p.profile, snapshot()).depth, 12);
    assert.match(journeyGoal(p.profile, snapshot()).unlock, /nine relics/);
    p.profile.trackedRelic = 'archivist';
    p.profile.discovered.push('archivist');
    legacy.shards = 18;
    assert.equal(journeyGoal(p.profile, snapshot()).target.name, 'Craft your tracked relic');
    assert.equal(journeyGoal(p.profile, snapshot()).dungeon, undefined);
    c.quest = 0;
    assert.equal(
      journeyTarget(journeyGoal(p.profile, snapshot()), snapshot()).name,
      'Craft your tracked relic',
    );
    legacy.shards = 0;
    assert.equal(
      journeyTarget(journeyGoal(p.profile, snapshot()), snapshot()).name,
      'The Sunken Archive',
    );
  } finally {
    store.close();
  }
});

test('distant wardens leave introductory hunts alone until approached or attacked', () => {
  const { store, realm, p } = setup();
  try {
    p.z = -10;
    const warden = realm.spawn('duskwarden', 0, -35, 'wilds');
    realm.time = 10;
    warden.nextFire = 0;
    realm.updateEnemy(warden, [p], 0.05);
    assert.equal(warden.z, -35);
    assert.equal(warden.telegraph, 0);
    assert.equal(realm.bullets.size, 0);
    // A player can deliberately engage with a long-range hit.
    warden.hp -= 1;
    warden.nextFire = realm.time;
    realm.updateEnemy(warden, [p], 0.05);
    assert.ok(realm.bullets.size > 0);
  } finally {
    store.close();
  }
});

test('main combat clearings contain no tall blockers while the surrounding world retains scenery', () => {
  for (const clearing of COMBAT_CLEARINGS)
    assert.ok(
      PROPS.filter((p) => Math.hypot(p.x - clearing.x, p.z - clearing.z) < clearing.radius).every(
        (p) => p.kind === 'grass',
      ),
    );
  assert.ok(PROPS.some((p) => p.kind === 'tree'));
  assert.ok(PROPS.some((p) => p.kind === 'crystal'));
});

test('a prior life or final-boss assist cannot complete the current full Elder chapter', () => {
  const { store, realm, p, c } = setup();
  try {
    c.quest = 6;
    c.level = 20;
    c.bosses.push('nullelder');
    p.profile.victories = 1;
    ensureLegacy(p.profile).clears = 4;
    ensureLegacy(p.profile).highestDepth = 4;
    realm.completeJourney(p);
    assert.equal(c.quest, 6);
    realm.enterDungeon(p, 'eclipse');
    for (let stage = 0; stage < 5; stage++) {
      Object.assign(p, realm.dungeons.state('eclipse')!.altar);
      realm.action(p.profile.id, 'delve');
      for (const enemy of [...realm.enemies.values()].filter((e) => e.dimension === 'eclipse')) {
        Object.assign(p, { x: enemy.x, z: enemy.z });
        realm.killEnemy(enemy, [p]);
      }
    }
    assert.ok(c.clears?.includes('eclipse'));
    assert.equal(c.quest, 8);
    assert.equal(realm.dungeons.state('eclipse')!.status, 'cleared');
  } finally {
    store.close();
  }
});

test('the place table is the single source for zones, regions, dungeons, and lookups', () => {
  // Derived views must keep the order and identity every existing caller depends on.
  // The island's five places keep their identity and order; the outer ring follows them.
  assert.deepEqual(
    ZONES.slice(0, 5).map((z) => z.id),
    ['haven', 'meadow', 'grove', 'glass', 'crown'],
  );
  assert.deepEqual(
    ZONES.slice(5).map((z) => z.id),
    ['coast', 'orchard', 'saltflat', 'observatory', 'marsh', 'glacier', 'ashfall'],
  );
  assert.equal(ZONES[1].id, 'meadow', 'zoneAt falls back to ZONES[1]');
  assert.deepEqual(
    REGIONS.slice(0, 4).map((r) => r.id),
    ['meadow', 'grove', 'glass', 'crown'],
  );
  assert.equal(REGIONS.length, 11, 'four island regions and seven outer biomes');
  assert.equal(REGIONS[1].name, 'Hollow Grove', 'the first-grove step reads REGIONS[1]');
  for (const [i, region] of REGIONS.slice(0, 4).entries()) assert.equal(region.tier, i + 1);
  assert.deepEqual(Object.keys(DUNGEONS), ['eclipse', 'hollow', 'crucible']);
  assert.equal(DUNGEONS.hollow.level, 5);
  // Lookups resolve through the table, including dungeon dimensions.
  assert.equal(placeAt(0, 20).id, 'haven');
  assert.equal(placeAt(0, -10).id, 'meadow');
  assert.equal(placeAt(0, 0, 'hollow').id, 'hollow');
  assert.equal(placeAt(0, -120).id, 'ashfall', 'the ring beyond the island is tiled by biome');
  assert.equal(placeAt(-50, 96).id, 'coast');
  assert.equal(
    BIOME_PLACES.some((b) => b.id === placeAt(999, 999).id),
    true,
    'off-map resolves to the biome whose sector it falls in',
  );
  // Every wild carries the counterplay line the atlas and plates show.
  for (const place of WILDS) {
    assert.ok(place.lesson, `${place.id} lesson`);
    assert.ok(place.creature, `${place.id} creature`);
    assert.ok(place.levels[1] >= place.levels[0]);
  }
  assert.ok(PLACES.some((p) => p.kind === 'setpiece'));
});

test('threat bands read a place and a creature against the level standing in front of them', () => {
  const meadow = PLACES.find((p) => p.id === 'meadow')!;
  const crown = PLACES.find((p) => p.id === 'crown')!;
  const haven = PLACES.find((p) => p.id === 'haven')!;
  assert.equal(threatOf(1, meadow), 'even');
  assert.equal(threatOf(9, meadow), 'safe');
  assert.equal(threatOf(1, crown), 'deadly');
  assert.equal(threatOf(14, crown), 'hard');
  assert.equal(threatOf(1, haven), 'safe', 'the sanctuary is never dangerous');
  assert.equal(threatOfTier(1, 1), 'even');
  assert.equal(threatOfTier(20, 1), 'safe');
  assert.equal(threatOfTier(1, 4), 'deadly');
});

test('the objective board offers every unlocked source, in priority order, and gates the rest', () => {
  const { store, realm, p, c, snapshot } = setup();
  try {
    // A brand new traveler still sees exactly one row: Phase 0's gating holds.
    let goals = journeyGoals(p.profile, snapshot());
    assert.equal(goals.length, 1);
    assert.equal(goals[0].source, 'chapter');
    assert.equal(goals[0].priority, 0);
    assert.equal(primaryGoal(p.profile, snapshot()).id, goals[0].id);
    assert.equal(journeyGoal(p.profile, snapshot()).id, goals[0].id, 'the old name still works');
    assert.equal(chapterGoal(p.profile, snapshot()).source, undefined);
    // Finishing chapter 0 unlocks the hunt, the seals, and the first dungeon.
    p.z = -10;
    realm.rng = () => 0.99;
    for (let i = 0; i < 6; i++) realm.killEnemy(realm.spawn('cinderling', 0, -11, 'wilds'), [p]);
    assert.equal(c.quest, 1);
    goals = journeyGoals(p.profile, snapshot());
    const sources = goals.map((g) => g.source);
    assert.ok(sources.includes('hunt'), JSON.stringify(sources));
    assert.ok(sources.includes('dungeon'));
    assert.deepEqual(
      [...goals].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)).map((g) => g.id),
      goals.map((g) => g.id),
      'the board arrives sorted',
    );
    assert.equal(goals[0].source, 'chapter', 'the chapter stays the default HUD card');
    // Every row carries what the board renders.
    for (const goal of goals) {
      assert.ok(goal.title && goal.reward && goal.target.name, goal.id);
      assert.ok(goal.total > 0 && goal.level >= 1, goal.id);
    }
    // A tracked relic adds its own row rather than hijacking the chapter.
    p.profile.trackedRelic = 'duskwarden';
    const withRelic = journeyGoals(p.profile, snapshot());
    assert.ok(withRelic.some((g) => g.source === 'relic'));
    // The Elder Convergence stays hidden until the account has actually earned it.
    assert.ok(!withRelic.some((g) => g.id === 'dungeon-eclipse'));
    c.level = 20;
    p.profile.victories = 1;
    assert.ok(journeyGoals(p.profile, snapshot()).some((g) => g.id === 'dungeon-eclipse'));
  } finally {
    store.close();
  }
});

test('a live event outranks repeatable work while it burns, and disappears when it ends', () => {
  const { store, realm, p, c, snapshot } = setup();
  try {
    c.quest = 2;
    c.level = 8;
    const live = () => {
      const s = snapshot() as Snapshot;
      s.event = { active: true, remaining: 40, kills: 3, target: 12 };
      return s;
    };
    const goals = journeyGoals(p.profile, live());
    const event = goals.find((g) => g.source === 'event')!;
    assert.ok(event, 'the star is on the board while it is live');
    assert.equal(event.current, 3);
    assert.equal(event.total, 12);
    assert.ok(
      goals.indexOf(event) < goals.findIndex((g) => g.source === 'hunt'),
      'a timed event outranks a repeatable hunt',
    );
    assert.equal(goals[0].source, 'chapter', 'but never displaces the chapter');
    // Below level 3 and once the star fades, the row is gone entirely.
    c.level = 1;
    assert.ok(!journeyGoals(p.profile, live()).some((g) => g.source === 'event'));
    c.level = 8;
    assert.ok(!journeyGoals(p.profile, snapshot()).some((g) => g.source === 'event'));
  } finally {
    store.close();
  }
});

test('a pin persists on the profile, survives a reconnect, and only accepts a bounded id', () => {
  const { store, realm, p, account } = setup();
  try {
    assert.equal(p.profile.pinned, undefined);
    realm.action(p.profile.id, 'pin', 'glass');
    assert.equal(p.profile.pinned, 'glass');
    // Saved, so it comes back with the profile on a new connection.
    assert.equal(store.authenticate(account.token)?.pinned, 'glass');
    realm.disconnect(p.profile.id);
    const rejoined = realm.add(account.profile, 'arcanist', () => {});
    assert.equal(rejoined.profile.pinned, 'glass');
    // A goal id pins just as well as a place id; an empty id clears.
    realm.action(p.profile.id, 'pin', 'hunt-1');
    assert.equal(p.profile.pinned, 'hunt-1');
    realm.action(p.profile.id, 'pin', '');
    assert.equal(p.profile.pinned, undefined);
    realm.action(p.profile.id, 'pin', 'x'.repeat(200));
    assert.equal(p.profile.pinned!.length, 64, 'a forged id cannot grow the profile');
  } finally {
    store.close();
  }
});
