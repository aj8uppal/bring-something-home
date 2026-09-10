import { move } from '../../shared/world';
import type { Dimension, Input, Snapshot, Vec } from '../../shared/types';

/** Predict presentation only. Position, damage, pickups and cooldowns remain authoritative.
 * Acknowledged input age maps server simulation back onto the local input history without
 * synchronizing wall clocks. Replaying newer motion avoids pulling the traveler backwards. */
export class MovementPrediction {
  position: Vec = { x: 0, z: 22 };
  dimension: Dimension = 'wilds';
  epoch = -1;
  initialized = false;
  error: Vec = { x: 0, z: 0 };
  history: { from: number; to: number; vx: number; vz: number }[] = [];
  sent = new Map<number, number>();
  dashUntil = 0;
  dashDirection: Vec = { x: 0, z: 0 };
  lastSnapshotAt = 0;
  reset() {
    this.initialized = false;
    this.history = [];
    this.sent.clear();
    this.error = { x: 0, z: 0 };
    this.dashUntil = 0;
  }
  record(input: Input, now: number) {
    this.sent.set(input.seq, now);
    for (const [seq, at] of this.sent) if (now - at > 2) this.sent.delete(seq);
  }
  reconcile(s: Snapshot, now: number, latency = 0) {
    this.lastSnapshotAt = now;
    const epoch = s.motion?.epoch ?? 0;
    if (!this.initialized || epoch !== this.epoch || s.self.dimension !== this.dimension) {
      this.reset();
      this.position = { x: s.self.x, z: s.self.z };
      this.dimension = s.self.dimension;
      this.epoch = epoch;
      this.initialized = true;
      return;
    }
    const ackAt = s.motion ? this.sent.get(s.motion.seq) : undefined;
    const replayFrom = Math.max(
      now - 0.35,
      Math.min(
        now,
        ackAt === undefined
          ? now - Math.min(0.2, latency / 2000)
          : ackAt + (s.motion?.heldFor ?? 0),
      ),
    );
    const target = { x: s.self.x, z: s.self.z };
    for (const frame of this.history) {
      const dt = Math.max(0, frame.to - Math.max(frame.from, replayFrom));
      if (dt) move(target, frame.vx * dt, frame.vz * dt, this.dimension);
    }
    this.error = { x: target.x - this.position.x, z: target.z - this.position.z };
    if (Math.hypot(this.error.x, this.error.z) > 6) {
      this.position = target;
      this.error = { x: 0, z: 0 };
      this.dashUntil = 0;
    }
  }
  dash(input: Input, now: number) {
    const n = Math.hypot(input.x, input.z);
    this.dashDirection =
      n > 0.1
        ? { x: input.x / n, z: input.z / n }
        : { x: Math.cos(input.angle), z: Math.sin(input.angle) };
    this.dashUntil = now + 0.2;
  }
  step(input: Input, speed: number, dt: number, now: number) {
    if (!this.initialized || dt <= 0 || !Number.isFinite(dt)) return;
    dt = Math.min(0.1, dt);
    // Never let a disconnected display keep running into unseen danger.
    if (now - this.lastSnapshotAt > 0.35) return;
    const n = Math.max(1, Math.hypot(input.x, input.z));
    const dashTime = Math.max(0, Math.min(dt, this.dashUntil - (now - dt)));
    const vx =
      (speed * ((input.x / n) * (dt - dashTime) + this.dashDirection.x * 4 * dashTime)) / dt;
    const vz =
      (speed * ((input.z / n) * (dt - dashTime) + this.dashDirection.z * 4 * dashTime)) / dt;
    move(this.position, vx * dt, vz * dt, this.dimension);
    const blend = 1 - Math.exp(-dt * 12);
    move(this.position, this.error.x * blend, this.error.z * blend, this.dimension);
    this.error.x *= 1 - blend;
    this.error.z *= 1 - blend;
    this.history.push({ from: now - dt, to: now, vx, vz });
    while (this.history.length && this.history[0].to < now - 0.6) this.history.shift();
  }
}
