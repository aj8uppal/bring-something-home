# Phase 3 — Doors Everywhere

**Dungeons become a system: dropped portals, generated layouts, a difficulty dial
on every door.** Estimated 5–6 weeks. The largest engineering phase.

You are working in Bring Something Home: a cooperative 3D bullet-hell RPG with a
Three.js client in `src/`, an authoritative Node realm server in `server/`, and
shared content and rules in `shared/`. Read `README.md` and
`docs/ARCHITECTURE.md` first, especially the sections on dimensions, expeditions,
and the wire protocol.

Depends on Phase 2 for biome data to place portal drops. Phase 1's atlas is what
displays open portals.

## Why this phase exists

There are exactly three dungeons. They sit at fixed positions near the Hearth,
their rooms are identical 60×60 boxes, and every run spawns the same enemies at
the same coordinates. `EXPEDITIONS` in `shared/endgame.ts` is a literal list of
positions. Elder depths add health and damage multipliers with three rotating
modifiers, which is a stat ladder, not new play.

The genre's engine of endless engagement is that creatures drop doors. You kill
things in the world, a portal opens, someone shouts, a group forms, the portal
closes. That loop is why a realm with strangers in it feels alive. This phase
builds it.

## What exists right now

- `shared/types.ts` — `Dimension = 'wilds' | 'hollow' | 'crucible' | 'eclipse'`
  and `DungeonId = Exclude<Dimension, 'wilds'>`. This union is threaded through
  the protocol, the realm, the map, the scene, bounds checks, and persistence.
  **Widening it is the central task of this phase.**
- `server/dungeons.ts` (282 lines) — `Dungeons` class holding
  `runs: Map<DungeonId, Run>`, one shared run per dimension per realm. Handles
  entry gating, altar activation, per-chamber credit, clear bonuses, expiry after
  60 empty seconds, and the `ExpeditionResult` recap.
- `shared/endgame.ts` — `EXPEDITIONS: Record<DungeonId, Encounter[]>` with fixed
  altar and enemy positions; `MAX_DEPTH` 12; `MODIFIERS` (4); `depthScaling()`.
- `shared/world.ts` — `inBounds()` returns `abs(x) < 29 && abs(z) < 29` for every
  non-wilds dimension. `groundHeight()` returns 0 for them.
- `server/realm.ts` — `enterDungeon()`, the `rally` action, `broadcast()` keyed on
  `p.dimension`.
- `src/game/scene.ts` — instanced dungeon architecture; `src/game/map.ts` draws
  the fixed 60×60 dungeon box.
- `src/rally-ui.ts`, `src/expedition-ui.ts` — the rally board and recap.
- `tests/expeditions.test.ts` (487 lines) and `scripts/expedition-check.ts` cover
  entry rules, credit, and clear bonuses. Keep them passing.

## Deliverables

### 1. Dimensions become instances

Change `Dimension` from a closed union to `'wilds' | string` where a dungeon
dimension is an **instance id** carrying a template and a seed.

```ts
export interface Instance {
  id: string;            // 'hollow:7f3a…'
  template: string;      // 'hollow' | 'crucible' | 'eclipse' | 'warren' | …
  seed: number;
  depth: number;
  modifier: Modifier;
  openedBy: string;
  expiresAt: number;
}
```

- `Dungeons.runs` becomes `Map<string, Run>` keyed by instance id.
- The three story dungeons keep their template names and their fixed Hearth
  portals, so invitations, the journey, and existing saves keep working. Treat
  `'hollow'` as shorthand for the realm's current hollow instance.
- `inBounds()` and `groundHeight()` take the template, so a generated layout can
  be any shape rather than a 29-unit square.
- The wire protocol currently encodes dimension compactly. Bump
  `PROTOCOL_VERSION` and encode instance ids as a per-snapshot small integer
  handle rather than repeating a string on every entity. Keep older packets
  decodable exactly as `shared/protocol.ts` already documents.
- **Do this first, alone, and get the full suite green before anything else in
  this phase.** It is a wide refactor with no player-visible change, and mixing
  it with content work will make failures impossible to attribute.

### 2. Room-graph templates

Replace fixed encounter lists with generation.

```ts
interface DungeonTemplate {
  id: string; name: string;
  level: number;                 // recommendation, not a gate
  rooms: { shape: string; size: [number, number] }[];
  graph: { min: number; max: number; optional: number };
  encounters: Record<string, { kinds: string[]; count: [number, number] }[]>;
  keeper: string;                // boss kind
  palette: string;
  secret: { chance: number; reward: number };
}
```

- Generate three to six rooms plus one or two optional side rooms from the seed,
  connected by short corridors. Rooms are rectangles or simple compound shapes;
  do not build a full BSP dungeon generator.
- **Keep the altar pacing.** The current rhythm — clear a room, restore 20%
  health and 30% light, receive a tonic, wake the next altar when the group is
  ready — is good and players understand it. Generation changes the path between
  altars, not the contract.
- Side rooms hold an optional encounter and a better bag. Entering one is a
  choice: more risk, more reward, more time.
- **One secret per template:** a breakable wall or a hidden altar worth a
  guaranteed higher-tier bag. Players will tell each other where they are, which
  is the point.
- The keeper room stays authored per template. Bosses deserve a stage.

### 3. Portal drops

- Creatures drop portals on a per-family chance, defined in the ecology table
  from Phase 2. Hunting a biome therefore means hunting for its door.
- A dropped portal is a world object with an owner-agnostic public timer
  (suggest 60–90 seconds), a visible beam, a map icon in the atlas, and a chat
  announcement naming the place.
- Anyone may enter while it is open. The instance outlives the portal: people
  already inside are not evicted when it closes.
- Six drop-only templates to ship, one per creature family, so every level band
  has a door of its own:

  | Template | Band | Drops from |
  | -------- | ---- | ---------- |
  | The Thornling Warren | 3 | thornling |
  | The Wisp Lantern | 6 | wisp |
  | The Scarab Hive | 9 | scarab |
  | The Watcher's Vigil | 13 | watcher |
  | The Cinder Choir | 16 | outer-ring cinder kinds |
  | The Drowned Chapel | 18 | outer-ring tide kinds |

- Each has its own keeper, its own signature relic in `BOSS_RELICS`, and its own
  bestiary entry.

### 4. A difficulty dial on every door

`depthScaling()` and `MODIFIERS` currently apply only to the Elder Convergence.

- Let **any** dungeon be opened at depth 1–5 from its entry altar, using the same
  scaling and modifier rotation, with the reward tier and shard count scaling to
  match.
- Gate it the way Elder depths are gated: a player may open at most one depth
  above their highest clear of that template, and late arrivals must independently
  qualify. The rules already exist in `Dungeons.enter()`; generalise them.
- This closes the gap a level 12 player has today, where the Glasswaste is easy
  and the Crucible is a wall with nothing in between.
- Elder depths stay capped at 12 and remain the top of the ladder.

### 5. The rally board becomes a live door board

`src/rally-ui.ts` lists three fixed dungeons. Make it list what is actually open:
every live instance in the realm with its template, depth, modifier, stage,
population, crew preview, and remaining portal time, plus the three story
dungeons which are always available. Sort by "joinable now". Keep invitations
working; an invitation now carries realm plus instance, and falls back to opening
a fresh instance of that template when the named one has expired.

## Constraints

- **Never evict a player from a live instance.** Expiry rules apply to empty
  instances only, exactly as the current 60-second rule does.
- Cap concurrent instances per realm and per template. Report the ceiling and add
  it to the scale boundary section of `docs/ARCHITECTURE.md`.
- Persistence: `character.clears` and `legacy.bestTimes` are keyed by dungeon id
  today. Key them by template, and migrate existing values on load without a
  schema change.
- Generation must be deterministic from the seed, so the same instance renders
  identically for everyone and can be reproduced in a test.
- Keep `tests/expeditions.test.ts` and `scripts/expedition-check.ts` passing, and
  extend both to cover generated layouts and depth gating on ordinary dungeons.

## Verification

1. Two consecutive runs of the same template have different layouts, and two
   clients in the same instance see an identical layout.
2. A portal drops in the overworld, appears in the atlas with a timer, and a
   second player joins it from across the map.
3. The portal expires while both are inside; neither is evicted; the run
   completes and pays the correct clear bonus.
4. An ordinary dungeon opened at depth 3 scales health, damage, and rewards, and
   refuses a player who has not cleared depth 2 of that template.
5. Existing saves: a character with `clears: ['hollow']` and Elder best times
   loads, keeps its credit, and can still enter.
6. Load test with the cap of concurrent instances open at once. Report memory and
   tick time.
7. Every check command in `docs/handoffs/README.md` passes.

## Done when

A stranger's shout in realm chat that a Scarab Hive just opened is a reason to
stop what you were doing and run there.
