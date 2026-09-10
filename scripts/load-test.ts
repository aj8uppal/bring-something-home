import { createCharacter, makeItem, stats } from '../server/model.js';
import { DUNGEONS, distance, zoneAt } from '../shared/content.js';
import { BIOME_BEARINGS, GATE_RING_RADIUS, RING_RADIUS, placeById } from '../shared/places.js';
import { pointOn } from '../shared/world.js';
import { TEMPLATES } from '../shared/templates.js';
import { ECOLOGY } from '../shared/biomes.js';
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
/** LOAD_INSTANCES=1 opens the realm's whole instance cap at once and reports what it costs. */
const instances = process.env.LOAD_INSTANCES === '1';
/**
 * LOAD_ZONE=<place> keeps every client fighting inside one place and watches the creature
 * count, which the spawn budget must hold at or above that place's base within five seconds.
 * Any place in the ecology works: `meadow` is the original case, `marsh` is a biome.
 */
const zoneId = process.env.LOAD_ZONE;
const zone = ECOLOGY.find((z) => z.place === zoneId);
if (zoneId && !zone) throw new Error(`LOAD_ZONE=${zoneId} is not a place in the ecology.`);
const meadow = !!zone;
const count = Math.max(1, Math.min(48, Number(process.env.LOAD_PLAYERS || (meadow ? 20 : 48)))),
  seconds = Math.max(5, Number(process.env.LOAD_SECONDS || 20));
const meadowBase = zone?.baseCount ?? 0;
/** Where the herd gathers: the place's hunting ground, or its first pack anchor. */
const heart = zone ? (placeById(zone.place)?.hunt ?? zone.anchors[0]) : { x: -4, z: -12 };
/**
 * How the herd gets there. An outer biome is a hundred units out, so the clients walk the
 * spoke road the same way a player would: out to the gate ring, along the spoke, then in.
 */
const bearing = zone ? BIOME_BEARINGS[zone.place as keyof typeof BIOME_BEARINGS] : undefined;
const approach: { x: number; z: number }[] =
  bearing === undefined
    ? [heart]
    : [pointOn(bearing, GATE_RING_RADIUS), pointOn(bearing, RING_RADIUS), heart];
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
let settled = false,
  settledAt = 0;
const began = Date.now();
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
              if (!e.boss && zoneAt(e.x, e.z).id === zone!.place) windowIds.add(e.id);
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
      let ticks = 0,
        leg = 0,
        was = { x: 0, z: 22 };
      intervals.push(
        setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN || !state) return;
          ticks++;
          const p = state.self;
          // Walk out of the sanctuary, fire at real enemies, use cooldowns, and recall if hurt.
          let x = 0,
            z = 0;
          if (meadow) {
            // Walk the road out, then hold a ring around the place's heart so the whole of
            // it stays observed. A step that makes no progress veers, the way a person does.
            while (
              leg < approach.length - 1 &&
              Math.hypot(p.x - approach[leg].x, p.z - approach[leg].z) < 8
            )
              leg++;
            const last = leg === approach.length - 1;
            const target = last
              ? { x: heart.x + Math.cos(index) * 7, z: heart.z + Math.sin(index) * 6 }
              : approach[leg];
            const dx = target.x - p.x,
              dz = target.z - p.z,
              d = Math.hypot(dx, dz);
            if (!last || p.safe || d > 3) {
              const stuck = Math.hypot(p.x - was.x, p.z - was.z) < 0.4;
              const veer = stuck ? (ticks % 60 < 30 ? 0.9 : -0.9) : 0;
              const a = Math.atan2(dz, dx) + veer;
              x = Math.cos(a);
              z = Math.sin(a);
            } else {
              x = Math.sin(ticks * 0.05 + index) * 0.6;
              z = Math.cos(ticks * 0.045 + index) * 0.6;
            }
            if (ticks % 6 === 0) was = { x: p.x, z: p.z };
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
    // The herd has to get there first. A place a hundred units from the Hearth is a
    // fifteen-second walk, and an empty place nobody has reached yet is not a deficit.
    const arrived = [...latest.values()].filter(
      (s) => zoneAt(s.self.x, s.self.z).id === zone!.place,
    ).length;
    if (!settled && arrived < Math.ceil(count * 0.6)) {
      windowIds.clear();
      return;
    }
    if (!settledAt) settledAt = Math.round((Date.now() - began) / 1000);
    settled = true;
    const ids = new Set<string>();
    for (const s of latest.values())
      for (const e of s.enemies)
        if (!e.boss && e.dimension === 'wilds' && zoneAt(e.x, e.z).id === zone!.place)
          ids.add(e.id);
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
  if (instances) {
    // Open the cap: every template, several instances of each, all populated at once.
    await fetch(`http://127.0.0.1:${port}/api/health`);
    for (let i = 0; i < 40; i++) {
      for (const ws of clients)
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'action', action: 'recall' }));
          ws.send(
            JSON.stringify({
              type: 'action',
              action: 'rally',
              id: TEMPLATES[(i + clients.indexOf(ws)) % TEMPLATES.length].id,
            }),
          );
        }
      await new Promise((r) => setTimeout(r, 250));
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  const health = (await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()) as {
    tickMs: number;
    players: number;
    instances?: number;
    heapMb?: number;
  };
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  console.log(
    JSON.stringify(
      {
        mode: expedition ? 'elder-expedition' : meadow ? `place:${zone!.place}` : 'wilds',
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
        ...(instances
          ? { liveInstances: health.instances ?? 0, serverHeapMb: health.heapMb ?? 0 }
          : {}),
        ...(meadow
          ? {
              place: zone!.place,
              settledAfterSeconds: settledAt,
              placeBase: meadowBase,
              instantMin: minMeadow,
              instantMean: Number(
                (
                  meadowInstant.reduce((a, b) => a + b, 0) / Math.max(1, meadowInstant.length)
                ).toFixed(1),
              ),
              presentPerSecond: meadowSamples.slice(-30),
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
      `${zone!.place} sat below ${meadowBase} creatures for ${longestDeficit}s: ${meadowSamples.join(',')}`,
    );
} finally {
  for (const timer of intervals) clearInterval(timer);
  for (const ws of clients) ws.close();
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), new Promise((r) => setTimeout(r, 5000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
}
