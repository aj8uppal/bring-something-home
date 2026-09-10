import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Encoder, Decoder } from '../shared/protocol.js';
import type { Snapshot, BulletState } from '../shared/types.js';
const bullet = (id: number, x = 0): BulletState => ({
  id,
  x,
  z: 0,
  vx: 10,
  vz: 5,
  friendly: false,
  radius: 0.3,
  color: '#f18d81',
  owner: 'enemy',
  dimension: 'wilds',
});
function state(time: number, bullets: BulletState[]): Snapshot {
  return {
    type: 'snapshot',
    time,
    tick: Math.round(time * 20),
    self: {
      id: 'p',
      name: 'Aster',
      classId: 'arcanist',
      x: 0,
      z: -10,
      angle: 0,
      hp: 180,
      maxHp: 180,
      mp: 120,
      maxMp: 120,
      level: 1,
      dimension: 'wilds',
      safe: false,
      invulnerable: false,
      connected: true,
      attacking: true,
    },
    players: [],
    enemies: [],
    bullets,
    loot: [],
    effects: [],
    cooldowns: { dash: 0, ability: 0, potion: 0 },
    realm: { id: 'a', name: 'Hearth', players: 1, capacity: 48, wardens: 0 },
    event: { active: false, kills: 0, target: 12, remaining: 150 },
  };
}
test('wire codec preserves player state and authoritative bullet motion between spawn packets', () => {
  const e = new Encoder(),
    d = new Decoder();
  const first = e.encode(state(0, [bullet(1)]));
  assert.ok(first.reset);
  assert.equal(first.shots.length, 1);
  const decoded = d.decode(first);
  assert.deepEqual(decoded.self, state(0, []).self);
  const second = e.encode(state(0.1, [{ ...bullet(1, 1), z: 0.5 }]));
  assert.equal(second.shots.length, 0);
  assert.equal(second.removed.length, 0);
  const after = d.decode(second);
  assert.equal(after.bullets[0].x, 1);
  assert.equal(after.bullets[0].z, 0.5);
});
test('collisions, interest exits, and new bullets remove or add the correct render objects', () => {
  const e = new Encoder(),
    d = new Decoder();
  d.decode(e.encode(state(0, [bullet(1), bullet(2)])));
  const frame = e.encode(state(0.1, [bullet(2, 1), bullet(3, 4)]));
  assert.deepEqual(frame.removed, [1]);
  assert.deepEqual(
    frame.shots.map((b) => b[0]),
    [3],
  );
  assert.deepEqual(
    d.decode(frame).bullets.map((b) => b.id),
    [2, 3],
  );
});
test('dimension changes and periodic baselines clear old projectiles after reconnect or backpressure', () => {
  const e = new Encoder(),
    d = new Decoder();
  d.decode(e.encode(state(0, [bullet(1)])));
  const s = state(0.1, []);
  s.self.dimension = 'hollow';
  const changed = e.encode(s);
  assert.ok(changed.reset);
  assert.equal(d.decode(changed).bullets.length, 0);
  const late = e.encode(state(3, [bullet(5)]));
  assert.ok(late.reset);
  assert.deepEqual(
    d.decode(late).bullets.map((b) => b.id),
    [5],
  );
  e.reset();
  assert.ok(e.encode(state(3.1, [bullet(6)])).reset);
});
test('sustained bullet fields use substantially fewer bytes than full object snapshots', () => {
  const e = new Encoder();
  const bullets = Array.from({ length: 500 }, (_, i) => bullet(i, i / 10));
  e.encode(state(0, bullets));
  const frame = e.encode(state(0.1, bullets));
  assert.ok(JSON.stringify(frame).length < JSON.stringify(state(0.1, bullets)).length * 0.1);
});

test('projectile art identities survive spawn deltas and old style-free packets still decode', () => {
  const encoder = new Encoder(),
    decoder = new Decoder();
  const styled = { ...bullet(3), style: 10 };
  const first = decoder.decode(
    JSON.parse(JSON.stringify(encoder.encode(state(0, [styled, bullet(4)])))),
  );
  assert.equal(first.bullets[0].style, 10);
  assert.equal(first.bullets[1].style, undefined);
  const second = decoder.decode(encoder.encode(state(0.1, [styled, bullet(4)])));
  assert.equal(second.bullets[0].style, 10);
});

test('the 1 Hz roster rides the frame as compact rows and older roster-free frames still decode', () => {
  const encoder = new Encoder(),
    decoder = new Decoder();
  const s = state(0, []);
  s.roster = [
    { id: 'p', name: 'Aster', classId: 'arcanist', level: 1, dimension: 'wilds', x: 0, z: -10 },
    { id: 'q', name: 'Birch', classId: 'ranger', level: 7, dimension: 'hollow', x: 3.25, z: 4 },
  ];
  const frame = JSON.parse(JSON.stringify(encoder.encode(s)));
  assert.ok(Array.isArray(frame.roster[0]));
  assert.ok(JSON.stringify(frame.roster).length < JSON.stringify(s.roster).length * 0.6);
  const decoded = decoder.decode(frame);
  assert.deepEqual(decoded.roster?.[1], {
    id: 'q',
    name: 'Birch',
    classId: 'ranger',
    level: 7,
    dimension: 'hollow',
    x: 3.3,
    z: 4,
  });
  const quiet = decoder.decode(encoder.encode(state(0.1, [])));
  assert.equal(quiet.roster, undefined);
});
