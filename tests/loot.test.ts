import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/database.js';
import { Realm } from '../server/realm.js';
import { makeItem } from '../server/model.js';
import { bagItems, salvageable } from '../shared/loot.js';
import { bagStyle } from '../shared/gear.js';

function setup() {
  const store = new Store(':memory:'),
    realm = new Realm('bags', 'Bags', store);
  const p = realm.add(store.create('Aster').profile, 'arcanist', () => {});
  realm.enemies.clear();
  return { store, realm, p, c: p.profile.character! };
}
test('personal bags merge nearby drops up to eight, keep their best color, and separate owners and dimensions', () => {
  const { store, realm, p } = setup();
  try {
    const items = Array.from({ length: 9 }, () => makeItem('weapon', 1, 'common'));
    items[3] = { ...makeItem('charm', 6, 'relic'), relicId: 'nullelder' };
    realm.dropItems(p.profile.id, p, items);
    assert.equal(realm.loot.size, 2);
    const bags = [...realm.loot.values()];
    assert.deepEqual(
      bags.map((b) => bagItems(b).length),
      [8, 1],
    );
    assert.equal(bagStyle(bags[0].item), 'white');
    realm.dropItems('other', p, [makeItem('armor', 1, 'common')]);
    realm.dropItems(p.profile.id, { ...p, dimension: 'hollow' }, [makeItem('armor', 1, 'common')]);
    assert.equal(realm.loot.size, 4);
    realm.action(p.profile.id, 'loot', `${bags[0].id}:${items[3].id}`);
    assert.equal(bagStyle(bags[0].item), 'brown');
    assert.equal(carryCount(realm, p.profile.id), 11);
  } finally {
    store.close();
  }
});
function carryCount(realm: Realm, owner: string) {
  const c = realm.players.get(owner)!.profile.character!;
  return c.inventory.length + [...realm.loot.values()].reduce((n, b) => n + bagItems(b).length, 0);
}
test('partial collect-all and a full-satchel ground swap conserve every item and cannot replay', () => {
  const { store, realm, p, c } = setup();
  try {
    c.inventory = Array.from({ length: 17 }, () => makeItem('armor', 1, 'common'));
    const old = c.equipment.weapon!,
      better = makeItem('weapon', 5, 'rare');
    realm.dropItems(p.profile.id, p, [makeItem('charm', 2, 'rare'), better]);
    const bag = [...realm.loot.values()][0];
    realm.action(p.profile.id, 'loot-all', bag.id);
    assert.equal(c.inventory.length, 18);
    assert.equal(bagItems(bag).length, 1);
    realm.action(p.profile.id, 'loot-equip', `${bag.id}:${better.id}`);
    assert.equal(c.equipment.weapon?.id, better.id);
    assert.equal(bagItems(bag)[0].id, old.id);
    realm.action(p.profile.id, 'loot-equip', `${bag.id}:${better.id}`);
    assert.equal(bagItems(bag)[0].id, old.id);
    assert.equal(c.inventory.length, 18);
    assert.equal(carryCount(realm, p.profile.id), 19);
  } finally {
    store.close();
  }
});
test('bag transactions reject another owner, distant, expired and wrong-dimension items', () => {
  const { store, realm, p, c } = setup();
  try {
    realm.dropItems(p.profile.id, p, [makeItem('weapon', 4, 'rare')]);
    const bag = [...realm.loot.values()][0];
    for (const patch of [
      { owner: 'other' },
      { x: p.x + 5 },
      { expires: -1 },
      { dimension: 'hollow' as const },
    ]) {
      const before = { ...bag };
      Object.assign(bag, patch);
      for (const action of ['loot', 'loot-all', 'loot-equip'] as const)
        realm.action(p.profile.id, action, bag.id);
      assert.equal(c.inventory.length, 0);
      assert.notEqual(c.equipment.weapon?.id, bag.item.id);
      Object.assign(bag, before);
    }
  } finally {
    store.close();
  }
});
test('bulk salvage uses current build dominance and protects named relics, locks and tradeoffs', () => {
  const { store, realm, p, c } = setup();
  try {
    c.equipment.weapon = { ...makeItem('weapon', 6, 'rare'), trait: 'pierce' };
    const weak = { ...c.equipment.weapon, id: 'weak', power: 1 },
      trade = { ...weak, id: 'trade', power: 90, trait: undefined },
      locked = { ...weak, id: 'locked', locked: true },
      relic = { ...weak, id: 'named', relicId: 'archivist' };
    c.inventory = [weak, trade, locked, relic];
    assert.deepEqual(
      salvageable(c).map((i) => i.id),
      ['weak'],
    );
    const gold = c.gold;
    p.z = -10;
    realm.action(p.profile.id, 'salvage');
    assert.equal(c.inventory.length, 4);
    p.z = 22;
    realm.action(p.profile.id, 'salvage');
    realm.action(p.profile.id, 'salvage');
    assert.equal(c.gold, gold + 3);
    assert.deepEqual(
      c.inventory.map((i) => i.id),
      ['trade', 'locked', 'named'],
    );
    realm.action(p.profile.id, 'sell', locked.id);
    realm.action(p.profile.id, 'drop', locked.id);
    assert.equal(c.inventory.length, 3);
    realm.action(p.profile.id, 'lock', locked.id);
    realm.action(p.profile.id, 'drop', locked.id);
    assert.equal(c.inventory.length, 2);
    realm.action(p.profile.id, 'loot-all', [...realm.loot.keys()][0]);
    assert.equal(c.inventory.length, 3);
  } finally {
    store.close();
  }
});
test('locked equipped gear is retained in the satchel during a ground swap, or the swap is rejected when full', () => {
  const { store, realm, p, c } = setup();
  try {
    const old = c.equipment.weapon!;
    old.locked = true;
    c.inventory = Array.from({ length: 18 }, () => makeItem('charm', 1, 'common'));
    realm.dropItems(p.profile.id, p, [makeItem('weapon', 6, 'rare')]);
    const bag = [...realm.loot.values()][0],
      better = bag.item;
    realm.action(p.profile.id, 'loot-equip', bag.id);
    assert.equal(c.equipment.weapon?.id, old.id);
    c.inventory.pop();
    realm.action(p.profile.id, 'loot-equip', bag.id);
    assert.equal(c.equipment.weapon?.id, better.id);
    assert.ok(c.inventory.some((i) => i.id === old.id && i.locked));
    assert.equal(realm.loot.size, 0);
  } finally {
    store.close();
  }
});
