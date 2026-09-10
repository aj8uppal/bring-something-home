import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/database.js';
import { Realm } from '../server/realm.js';
import { cleanName, parseMessage, RateLimiter } from '../server/validation.js';
import { createCharacter } from '../server/model.js';
test('malformed, nonfinite, oversized, forged, and out-of-bounds inputs are rejected', () => {
  for (const raw of [
    'bad',
    'null',
    '[]',
    '{}',
    '{"type":"admin"}',
    JSON.stringify({ type: 'input', input: { x: 99, z: 0, angle: 0, seq: 1, fire: true } }),
    JSON.stringify({ type: 'input', input: { x: 0, z: 0, angle: null, seq: 1, fire: true } }),
    JSON.stringify({ type: 'action', action: 'teleport' }),
    JSON.stringify({ type: 'join', token: 'test', classId: 'god' }),
    JSON.stringify({ type: 'chat', text: 'a'.repeat(201) }),
  ])
    assert.equal(parseMessage(raw), null, raw);
  assert.ok(
    parseMessage(
      JSON.stringify({ type: 'input', input: { x: 0.5, z: -1, angle: -1.5, seq: 12, fire: true } }),
    ),
  );
  assert.ok(parseMessage(JSON.stringify({ type: 'action', action: 'recall' })));
  assert.ok(parseMessage(JSON.stringify({ type: 'action', action: 'travel', id: 'abc' })));
  assert.equal(
    parseMessage(JSON.stringify({ type: 'action', action: 'travel', id: 'x'.repeat(101) })),
    null,
  );
});
test('travel is refused outside the sanctuary, toward dungeon or sheltered targets, and toward ghosts', () => {
  const store = new Store(':memory:'),
    realm = new Realm('travel', 'Travel', store);
  const actor = realm.add(store.create('Aster').profile, 'arcanist', () => {});
  const target = realm.add(store.create('Birch').profile, 'ranger', () => {});
  const at = () => [actor.x, actor.z, actor.dimension] as const;
  target.x = 30;
  target.z = -20;
  // A non-safe actor cannot pull themselves across the map.
  actor.z = -10;
  const before = at();
  assert.equal(realm.action(actor.profile.id, 'travel', target.profile.id), undefined);
  assert.deepEqual(at(), before);
  // From the Hearth, a target inside a dungeon is out of reach.
  realm.recall(actor);
  actor.z = 22;
  target.dimension = 'hollow';
  target.x = 0;
  target.z = 0;
  realm.action(actor.profile.id, 'travel', target.profile.id);
  assert.deepEqual(at(), [0, 22, 'wilds']);
  // So is one standing in the sanctuary, oneself, an unknown id, or a disconnected body.
  target.dimension = 'wilds';
  target.z = 20;
  realm.action(actor.profile.id, 'travel', target.profile.id);
  assert.deepEqual(at(), [0, 22, 'wilds']);
  realm.action(actor.profile.id, 'travel', actor.profile.id);
  realm.action(actor.profile.id, 'travel', 'nobody');
  target.z = -20;
  realm.disconnect(target.profile.id);
  realm.action(actor.profile.id, 'travel', target.profile.id);
  assert.deepEqual(at(), [0, 22, 'wilds']);
  assert.equal(actor.cooldowns.travel, 0, 'a refused travel spends no cooldown');
  store.close();
});
test('names keep international letters and reject markup and control characters', () => {
  assert.equal(cleanName(' <script>Aster</script> '), 'scriptAsterscript');
  assert.equal(cleanName('  Étoile  '), 'Étoile');
  assert.equal(cleanName(null), '');
  assert.equal(cleanName('a'.repeat(100)).length, 18);
});
test('rate limiter expires windows and prunes inactive identities', () => {
  const rate = new RateLimiter(2, 100);
  assert.ok(rate.take('ip', 0));
  assert.ok(rate.take('ip', 1));
  assert.equal(rate.take('ip', 2), false);
  assert.ok(rate.take('ip', 100));
  rate.prune(201);
  assert.equal(rate.entries.size, 0);
});
test('account credentials are hashed and recovery rotates the session token', () => {
  const store = new Store(':memory:');
  const a = store.create('Aster');
  assert.equal(store.authenticate(a.token)?.id, a.profile.id);
  assert.equal(store.authenticate('incorrect'), null);
  const row = store.db.prepare('SELECT token_hash,recovery_hash FROM accounts').get()!;
  assert.notEqual(row.token_hash, a.token);
  assert.notEqual(row.recovery_hash, a.recoveryCode);
  const restored = store.recover(a.recoveryCode)!;
  assert.equal(restored.profile.id, a.profile.id);
  assert.equal(store.authenticate(a.token), null);
  assert.equal(store.authenticate(restored.token)?.id, a.profile.id);
  assert.equal(store.recover('invalid'), null);
  store.close();
});
test('characters and banked items survive a database restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'emberwilds-test-'));
  const path = join(dir, 'realm.sqlite');
  let store = new Store(path);
  const a = store.create('Birch');
  a.profile.character = createCharacter('ranger');
  a.profile.character.gold = 123;
  a.profile.embers = 42;
  store.save(a.profile);
  store.close();
  store = new Store(path);
  const loaded = store.authenticate(a.token)!;
  assert.equal(loaded.character?.classId, 'ranger');
  assert.equal(loaded.character?.gold, 123);
  assert.equal(loaded.embers, 42);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});
test('operator suspension blocks existing credentials and account deletion removes owned records', () => {
  const store = new Store(':memory:');
  const a = store.create('Aster'),
    b = store.create('Birch');
  store.report(a.profile.id, b.profile.id, 'A test report');
  store.db
    .prepare('INSERT INTO bans VALUES (?,?,?)')
    .run(b.profile.id, 'Test suspension', Date.now());
  assert.equal(store.authenticate(b.token), null);
  store.db.prepare('DELETE FROM bans WHERE account_id=?').run(b.profile.id);
  assert.ok(store.authenticate(b.token));
  store.deleteAccount(b.profile.id);
  assert.equal(store.authenticate(b.token), null);
  assert.equal(store.recover(b.recoveryCode), null);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM reports').get()!.n, 0);
  assert.ok(store.authenticate(a.token));
  store.close();
});
