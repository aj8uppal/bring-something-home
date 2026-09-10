import { createCharacter, makeItem, stats } from '../server/model.js';
import { DUNGEONS, distance, zoneAt } from '../shared/content.js';
import { SPAWN_TABLE } from '../server/realm.js';
/** Self-contained load test. Creates a disposable database and server; never uses player accounts. */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { Decoder } from '../shared/protocol.js';
import { Store } from '../server/database.js';
import type { Snapshot } from '../shared/types.js';
const expedition = process.env.LOAD_EXPEDITION === 'eclipse';
/** LOAD_ZONE=meadow keeps every client fighting inside Cindermeadow and watches the creature
 * count, which the spawn budget must hold at or above the zone's base within five seconds. */
const meadow = process.env.LOAD_ZONE === 'meadow';
const count = Math.max(1, Math.min(48, Number(process.env.LOAD_PLAYERS || (meadow ? 20 : 48)))),
  seconds = Math.max(5, Number(process.env.LOAD_SECONDS || 20));
const meadowBase = SPAWN_TABLE.find((z) => z.zone === 'meadow')!.baseCount;
const dir = mkdtempSync(join(tmpdir(), 'emberwilds-load-')),
  path = join(dir, 'load.sqlite'),
  store = new Store(path);
const accounts = Array.from({ length: count }, (_, i) => {
  const a = store.create(`Load ${i + 1}`);
  if (expedition) {
    const c = (a.profile.character = createCharacter(
      i % 3 === 0 ? 'sentinel' : i % 3 === 1 ? 'arcanist' : 'ranger',
    ));
    c.level = 20;
    a.profile.victories = 1;
    for (const slot of ['weapon', 'armor', 'charm'] as const)
      c.equipment[slot] = makeItem(slot, 6, 'rare', () => 0.5);
    c.hp = stats(c).maxHp;
    c.mp = stats(c).maxMp;
    store.save(a.profile);
  }
  return a;
});
store.close();
const port = 18178;
const child = spawn(process.execPath, ['--import', 'tsx', 'server/main.ts'], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_PATH: path },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const clients: WebSocket[] = [];
let frames = 0,
  bytes = 0,
  rosterBytes = 0,
  welcomes = 0,
  errors = 0,
  peakBullets = 0,
  peakEnemies = 0;
const latencies: number[] = [],
  intervals: ReturnType<typeof setInterval>[] = [];
const latest = new Map<number, Snapshot>();
/** Per second: distinct meadow creatures seen by any client during that second (presence),
 * and the instantaneous union at the sample instant. The five-second rule applies to presence. */
const windowIds = new Set<string>();
const meadowSamples: number[] = [],
  meadowInstant: number[] = [];
let deficitRun = 0,
  longestDeficit = 0,
  minMeadow = Infinity;
let stopped = false;
try {
  let started = false;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) {
        started = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!started) throw new Error('Load server did not start.');
  await Promise.all(
    accounts.map(async (account, index) => {
      const decoder = new Decoder();
      const ws = new WebSocket(`ws://127.0.0.1:${port}/socket`);
      clients.push(ws);
      let state: Snapshot | undefined,
        seq = 0,
        lastSnapshot = 0;
      ws.on('error', () => errors++);
      ws.on('message', (raw) => {
        bytes += raw.length;
        const wire = JSON.parse(String(raw));
        const m = wire.type === 'frame' ? decoder.decode(wire) : wire;
        if (m.type === 'welcome') welcomes++;
        if (m.type === 'error') errors++;
        if (m.type === 'snapshot') {
          frames++;
          state = m;
          latest.set(index, m);
          if (meadow)
            for (const e of m.enemies)
              if (!e.boss && zoneAt(e.x, e.z).id === 'meadow') windowIds.add(e.id);
          if (wire.roster) rosterBytes += JSON.stringify(wire.roster).length;
          peakBullets = Math.max(peakBullets, m.bullets.length);
          peakEnemies = Math.max(peakEnemies, m.enemies.length);
          if (lastSnapshot) latencies.push(performance.now() - lastSnapshot);
          lastSnapshot = performance.now();
        }
      });
      await once(ws, 'open');
      ws.send(
        JSON.stringify({
          type: 'join',
          token: account.token,
          classId: index % 3 === 0 ? 'sentinel' : index % 3 === 1 ? 'arcanist' : 'ranger',
        }),
      );
      let ticks = 0;
      intervals.push(
        setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN || !state) return;
          ticks++;
          const p = state.self;
          // Walk out of the sanctuary, fire at real enemies, use cooldowns, and recall if hurt.
          let x = 0,
            z = 0;
          if (meadow) {
            // Hold a ring around the meadow's heart so the whole zone stays observed.
            const hx = -4 + Math.cos(index) * 7,
              hz = -12 + Math.sin(index) * 6;
            const dx = hx - p.x,
              dz = hz - p.z,
              d = Math.hypot(dx, dz);
            if (p.safe || d > 3) {
              x = dx / (d || 1);
              z = dz / (d || 1);
            } else {
              x = Math.sin(ticks * 0.05 + index) * 0.6;
              z = Math.cos(ticks * 0.045 + index) * 0.6;
            }
          } else if (p.safe || p.z > -30) {
            z = -1;
            x = -Math.sign(p.x) * 0.15;
          } else {
            x = Math.sin(ticks * 0.04 + index) * 0.55;
            z = Math.cos(ticks * 0.035 + index) * 0.55;
          }
          const enemy = state.enemies.reduce<Snapshot['enemies'][number] | undefined>(
            (a, b) =>
              !a || Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a,
            undefined,
          );
          if (expedition) {
            const target =
              p.dimension === 'wilds'
                ? DUNGEONS.eclipse
                : state.dungeon?.status === 'ready'
                  ? state.dungeon.altar
                  : enemy;
            if (target) {
              const dx = target.x - p.x,
                dz = target.z - p.z,
                d = Math.hypot(dx, dz) || 1;
              if (p.dimension === 'wilds' || state.dungeon?.status === 'ready') {
                x = dx / d;
                z = dz / d;
                if (d < 3.5 && ticks % 10 === 0)
                  ws.send(
                    JSON.stringify({
                      type: 'action',
                      action: p.dimension === 'wilds' ? 'interact' : 'delve',
                    }),
                  );
              } else {
                const radial = d > 15 ? 0.7 : d < 8 ? -0.7 : 0;
                x = (dx / d) * radial - (dz / d) * 0.5;
                z = (dz / d) * radial + (dx / d) * 0.5;
                if (Math.abs(p.x + x * 3) > 27) x = -Math.sign(p.x) * 0.6;
                if (Math.abs(p.z + z * 3) > 27) z = -Math.sign(p.z) * 0.6;
              }
            }
            if (p.hp < p.maxHp * 0.6 && ticks % 20 === 0)
              ws.send(JSON.stringify({ type: 'action', action: 'potion' }));
            if (state.dungeon?.status === 'cleared')
              ws.send(JSON.stringify({ type: 'action', action: 'recall' }));
          }
          // Meadow mode approximates people, not turrets: fire in bursts at creatures within
          // reach, with imperfect aim and no ability spam. The wilds mode keeps its worst case.
          const reach = enemy ? Math.hypot(enemy.x - p.x, enemy.z - p.z) : Infinity;
          const engaged = meadow ? reach < 9 && (ticks + index * 3) % 20 < 7 : true;
          ws.send(
            JSON.stringify({
              type: 'input',
              input: {
                x,
                z,
                angle: enemy
                  ? Math.atan2(enemy.z - p.z, enemy.x - p.x) +
                    (meadow ? (Math.random() - 0.5) * 0.7 : 0)
                  : -Math.PI / 2,
                fire: !p.safe && engaged,
                seq: ++seq,
              },
            }),
          );
          if (!meadow && ticks % 50 === 0)
            ws.send(JSON.stringify({ type: 'action', action: 'ability' }));
          if (ticks % 44 === 0) ws.send(JSON.stringify({ type: 'action', action: 'dash' }));
          if (p.hp < p.maxHp * 0.3) ws.send(JSON.stringify({ type: 'action', action: 'recall' }));
        }, 50),
      );
    }),
  );
  const sampler = setInterval(() => {
    if (!meadow) return;
    const ids = new Set<string>();
    for (const s of latest.values())
      for (const e of s.enemies)
        if (!e.boss && e.dimension === 'wilds' && zoneAt(e.x, e.z).id === 'meadow') ids.add(e.id);
    const present = windowIds.size;
    windowIds.clear();
    meadowSamples.push(present);
    meadowInstant.push(ids.size);
    minMeadow = Math.min(minMeadow, ids.size);
    deficitRun = present < meadowBase ? deficitRun + 1 : 0;
    longestDeficit = Math.max(longestDeficit, deficitRun);
  }, 1000);
  intervals.push(sampler);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const health = (await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()) as {
    tickMs: number;
    players: number;
  };
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  console.log(
    JSON.stringify(
      {
        mode: expedition ? 'elder-expedition' : meadow ? 'cindermeadow' : 'wilds',
        players: count,
        joined: welcomes,
        durationSeconds: seconds,
        snapshots: frames,
        meanSnapshotsPerPlayerSecond: Number((frames / count / seconds).toFixed(2)),
        p95SnapshotIntervalMs: Math.round(p95),
        averageTickWorkMs: health.tickMs,
        aggregateMegabytes: Number((bytes / 1e6).toFixed(2)),
        rosterMegabytes: Number((rosterBytes / 1e6).toFixed(3)),
        peakBullets,
        peakEnemies,
        errors,
        ...(meadow
          ? {
              meadowBase,
              meadowInstantMin: minMeadow,
              meadowInstantMean: Number(
                (
                  meadowInstant.reduce((a, b) => a + b, 0) / Math.max(1, meadowInstant.length)
                ).toFixed(1),
              ),
              meadowPresentPerSecond: meadowSamples.slice(-30),
              longestDeficitSeconds: longestDeficit,
            }
          : {}),
      },
      null,
      2,
    ),
  );
  if (welcomes !== count || errors || frames < count * seconds * 7 || p95 > 250)
    throw new Error('Load budget exceeded.');
  // The budget checks every five seconds, so no deficit may last longer than that.
  if (meadow && longestDeficit > 5)
    throw new Error(
      `Cindermeadow sat below ${meadowBase} creatures for ${longestDeficit}s: ${meadowSamples.join(',')}`,
    );
} finally {
  for (const timer of intervals) clearInterval(timer);
  for (const ws of clients) ws.close();
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), new Promise((r) => setTimeout(r, 5000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
}
