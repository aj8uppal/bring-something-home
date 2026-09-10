import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MovementPrediction } from '../src/game/prediction.js';
import { Store } from '../server/database.js';
import { Realm } from '../server/realm.js';
import { stats } from '../server/model.js';
import type { Input, Snapshot } from '../shared/types.js';
const idle: Input = { x: 0, z: 0, angle: 0, fire: false, seq: 1 };
function setup() {
  const store = new Store(':memory:'),
    realm = new Realm('a', 'Test', store);
  const p = realm.add(store.create('Mira').profile, 'arcanist', () => {});
  p.x = 0;
  p.z = -10;
  realm.enemies.clear();
  let snapshot: Snapshot;
  p.send = (m) => {
    if (m.type === 'snapshot') snapshot = structuredClone(m);
  };
  realm.broadcast();
  const prediction = new MovementPrediction();
  prediction.reconcile(snapshot!, 0);
  return { realm, p, prediction, snapshot: snapshot! };
}
test('movement responds in one render frame without waiting for a server packet', () => {
  const { prediction } = setup();
  prediction.step({ ...idle, x: 1 }, 9, 1 / 60, 1 / 60);
  assert.ok(prediction.position.x >= 0.149);
});
test('prediction replays acknowledged motion under 150ms round-trip delay and direction changes', () => {
  const { realm, p, prediction } = setup();
  const inputs: { at: number; value: Input }[] = [],
    frames: { at: number; value: Snapshot }[] = [];
  let now = 0,
    seq = 0,
    maxError = 0;
  p.send = (m) => {
    if (m.type === 'snapshot') frames.push({ at: now + 0.075, value: structuredClone(m) });
  };
  for (let frame = 1; frame <= 600; frame++) {
    now = frame / 60;
    const input = { ...idle, seq, z: Math.floor(now) % 2 ? 1 : -1 };
    if (frame % 3 === 0) {
      input.seq = ++seq;
      prediction.record(input, now);
      inputs.push({ at: now + 0.075, value: input });
    }
    while (inputs[0]?.at <= now) realm.input(p.profile.id, inputs.shift()!.value);
    if (frame % 3 === 0) realm.step();
    while (frames[0]?.at <= now) prediction.reconcile(frames.shift()!.value, now, 150);
    prediction.step(input, stats(p.profile.character!).speed, 1 / 60, now);
    if (frame > 30)
      maxError = Math.max(
        maxError,
        Math.hypot(prediction.position.x - p.x, prediction.position.z - p.z),
      );
  }
  assert.ok(
    maxError < 2,
    `prediction error ${maxError.toFixed(3)} exceeds the movement covered by delay`,
  );
  assert.ok(Number.isFinite(prediction.position.x));
});
test('recall snaps to the new epoch, clears pending dash, and stale connections stop moving', () => {
  const { prediction, snapshot } = setup();
  prediction.dash({ ...idle, x: 1 }, 0);
  prediction.step({ ...idle, x: 1 }, 9, 0.05, 0.05);
  snapshot.self.z = 22;
  snapshot.motion!.epoch++;
  prediction.reconcile(snapshot, 0.1);
  assert.equal(prediction.position.z, 22);
  assert.equal(prediction.dashUntil, 0);
  const before = { ...prediction.position };
  prediction.step({ ...idle, x: 1 }, 9, 0.05, 0.6);
  assert.deepEqual(prediction.position, before);
});

test('slow render frames preserve movement speed instead of discarding elapsed time', () => {
  const { prediction } = setup();
  prediction.step({ ...idle, z: -1 }, 9, 0.08, 0.08);
  assert.ok(Math.abs(prediction.position.z + 10.72) < 0.001);
  const before = { ...prediction.position };
  prediction.step(idle, 9, 0, 0.08);
  assert.deepEqual(prediction.position, before);
});
