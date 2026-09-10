# Phase 2 — The Living World

**Three times the map, seven new biomes, an ecology instead of a spawn list.**
Estimated 5–7 weeks. The largest content phase.

You are working in Bring Something Home: a cooperative 3D bullet-hell RPG with a
Three.js client in `src/`, an authoritative Node realm server in `server/`, and
shared content and rules in `shared/`. Read `README.md` and
`docs/ARCHITECTURE.md` first. `npm ci && npm run dev` runs both halves.

## Why this phase exists

The world is a circle of radius 86, crossed in about seventeen seconds at base
speed. It holds five zones, one basic creature kind each, three wardens, and one
event that always fires at (18, −12). Phase 0 added spawn budgets so a crowd is
not starved, but the same clearing still holds the same creature doing the same
thing on every visit. After roughly two hours a player has seen the entire world
and the only thing left is bosses and numbers.

This phase makes the world worth exploring: bigger, more varied, and different on
every visit and in every realm.

## What exists right now

- `shared/world.ts` (154 lines) — `groundHeight()`, `inBounds()` (wilds:
  `hypot(x, z+8) < 86`), `Prop` with kinds `tree | rock | grass | ruin | crystal
  | signpost`, `COMBAT_CLEARINGS`, `makeProps()` generating 1,300 seeded props,
  a 4-unit spatial grid for collision, `canMove()`, `move()` with substeps.
- `shared/content.ts` — `ZONES` (5), `ENEMIES` (14: five basic kinds, three
  wardens, three keepers, three elders), `GATE_SPAWNS`, `DUNGEONS`, `LANDMARKS`.
- `server/realm.ts` (~1715 lines) — `SPAWN_TABLE` per zone with `kinds`,
  `baseCount`, `perPlayer`, `cap`, `roamRadius`, `anchors`; `populate()`;
  `spawn()`; `updateEnemy()` which leashes each creature within its roam radius
  of a fixed home point; `killEnemy()`; `updateEvent()` with the hardcoded
  wandering star; `broadcast()` filtering every entity per player at 48 units.
- `shared/patterns.ts` — `attackPlan(e)` produces the committed shot plan and a
  one-line counterplay hint per pattern.
- `src/game/creatures.ts` (800 lines) — original silhouettes for all fourteen
  kinds from merged, vertex-coloured rigid parts with shared prototype geometry.
- `src/game/scene.ts` (~1663 lines) — instanced scenery, warden light columns,
  portal level sprites, signposts, per-zone terrain vertex colours and fog drift.

If Phase 1 has landed, `shared/places.ts` exists and everything reads places from
it. If it has not, create that table here first — Phase 1 §1 defines it.

## Deliverables

### 1. Three times the world

Keep the current island exactly as it is. It is the level 1–20 story track and it
works. Wrap it.

- Raise the wilds bound from radius 86 to radius 150 in `inBounds()`. Keep the
  same centre offset so existing coordinates are untouched.
- The existing island becomes the **inner ring**, unchanged in layout, levels,
  wardens, and dungeon portals.
- Add an **outer ring of seven biomes** for levels 15–40, arranged around it.
  Each is a `Place` with its own prop kinds, ground palette, fog colour, ambient
  sound bed, creature mix, and one setpiece slot:

  | Biome | Band | Character |
  | ----- | ---- | --------- |
  | The Drowned Coast | 15–19 | Tidal flats, standing water, slow wide patterns |
  | The Petrified Orchard | 18–22 | Stone trees in rows, dense cover, ambushes |
  | The Salt Flat | 21–25 | Open and flat, nowhere to hide, long-range duels |
  | The Shattered Observatory | 24–28 | Broken rings and platforms, verticality |
  | The Bone Marsh | 27–31 | Fog, low visibility, things that close distance |
  | The Glacier of Fused Glass | 30–34 | Reflective, slippery, shots that ricochet |
  | The Ashfall | 33–40 | Storm around the Crown's far side, constant hazard |

- **Terrain with shape.** `groundHeight()` is currently one sine expression for
  the whole world. Make it per-biome so the outer ring has cliffs, basins, and
  ridges. Add `water` and `wall` as impassable prop kinds so movement has real
  geography instead of scattered obstacles. Reuse the existing 4-unit collision
  grid; do not add a physics library.
- **Roads.** Extend the two existing roads into a ring road and seven spokes, so
  a player can always find their way back. Signposts at every junction, using the
  `signpost` prop kind Phase 0 added.
- **Travel time.** A radius-150 world takes about 30 seconds to cross at base
  speed, which is right for the pacing. Do not add mounts. Do add two or three
  one-way shortcut passes so the return trip is shorter than the outbound one.

### 2. Creature roster from five to eighteen

Keep one attack pattern per creature so the bullet reading stays learnable. Add
**behaviour**, which is where the mastery lives. Every new kind needs an entry in
`ENEMIES`, a silhouette in `src/game/creatures.ts`, and lore.

Behaviours to add to `updateEnemy()` as an optional `behaviour` field on
`EnemyDef`, each a small state machine:

- **Charger** — closes distance on a telegraph, then commits to a straight rush.
- **Kiter** — retreats to hold its preferred range; punishes passive players.
- **Bulwark** — its front arc absorbs shots; must be flanked.
- **Splitter** — dies into two smaller creatures with the same pattern.
- **Summoner** — spawns two minions on a long cooldown, capped, and stops when
  its minions are alive.
- **Anchor** — slow, high health, drops a floor hazard using the existing
  `summonHazards()` machinery.
- **Lantern** — buffs nearby allies' fire rate; visibly linked by a light line,
  so killing it first is the obvious correct play once you notice.

**Mixed packs are the point.** A pack of one anchor plus two kiters plus a
lantern is a genuinely different fight from four cinderlings, using patterns the
player already knows how to read. Define packs in the biome table, not ad hoc.

### 3. Ecology instead of a spawn list

Replace `SPAWN_TABLE` with a per-biome ecology table.

```ts
interface Ecology {
  place: string;
  packs: { kinds: { kind: string; count: number }[]; weight: number }[];
  baseCount: number;      // solo population, unchanged pacing
  perPlayer: number;
  cap: number;
  roam: 'anchored' | 'patrol' | 'wander';
  patrolRadius: number;
}
```

- **Packs spawn and move together.** A patrol walks a seeded loop between
  clearings; a wanderer drifts. Packs may spill into a neighbouring biome's edge,
  which is how a player discovers something above their level without being
  ambushed by it in a safe area.
- Keep Phase 0's guarantees exactly: solo counts and respawn pacing unchanged, no
  deficit below `baseCount` for longer than five seconds in a crowded biome, and
  the fixed gate creatures outside the budget.
- **The 48-unit broadcast filter will not survive this.** `broadcast()` currently
  filters every entity for every player. With ~600 creatures and hundreds of
  bullets that is the first thing to break. Bucket entities into the same 4-unit
  grid the prop collision uses and gather only nearby cells. Do this before
  adding the creatures, not after.

### 4. Setpieces: twelve reasons to leave the road

Handcrafted encounter clusters placed by the realm seed, one to two per biome.
Each has a visible landmark, a name banner on approach, a distinct encounter, and
a guaranteed bag. They appear in the atlas once discovered.

Ship at least these shapes: a shrine with a mini-boss, an ambush hollow that
seals briefly and spawns waves, a ruined caravan with a treasure guardian, a
lantern circle that must be lit under pressure, and a nest that spawns splitters
until the nest itself is destroyed.

Setpieces are `Place` entries with `kind: 'setpiece'` so the atlas, compass, and
objective board pick them up with no extra work.

### 5. Events as a table

`updateEvent()` hardcodes the wandering star: one position, two waves of six, a
180-second timer. Generalise it.

```ts
interface WorldEvent {
  id: string; name: string;
  places: string[];          // eligible biomes
  waves: { kinds: string[]; count: number }[];
  duration: number; cooldown: number;
  reward: { embers: number; gold: number; shards?: number };
  beacon: string;            // colour of the world beam and map icon
}
```

Ship five: the wandering star (unchanged in feel), a meteor with a glass
mini-boss, a wisp procession to escort, a cinder tide that spawns in expanding
rings, and a lost traveler to find and walk home. Each raises a visible beam and
a map icon with a countdown, and announces in realm chat with a place name.

### 6. Biome bosses

Each outer biome gets a boss on a long respawn, using the existing three-phase
boss machinery and hazard system. They are not realm seals; they are repeatable
targets with their own signature relic in `BOSS_RELICS` and their own bestiary
entry. Seven bosses, seven new relics, seven new traits or trait combinations
worth building around.

Give each one a **break window**: a phase transition where a visible core is
exposed and damage during it skips the next pattern. Beginners kill the boss
anyway; experienced groups halve the fight. This is the single cheapest
skill-ceiling mechanic available and it costs no new UI.

## Constraints

- Original assets only. Procedural geometry, vertex colours, synthesized sound.
  No downloaded models, textures, or fonts.
- Prop count must stay bounded. Radius 150 is roughly three times the area, so
  budget props by density per biome and keep instancing; do not simply scale
  1,300 to 4,000 without measuring draw calls.
- Solo play at every level band must remain completable. Run
  `npm run test:balance` and extend it to cover the new bands.
- Existing saves load and play. A character standing anywhere in the old world
  stays valid.
- Everything new is data in a table. If you find yourself adding a biome with an
  `if`, stop and extend the table.

## Verification

1. Walk the ring road from the Hearth all the way around and back. Every biome is
   entered, named, and legible; no invisible walls; no prop-locked passages.
2. Two visits to the same biome ten minutes apart differ in pack composition and
   position.
3. `LOAD_ZONE=<biome> npm run test:load` with 20 clients in one biome: no deficit
   below `baseCount` longer than five seconds, and simulation work per tick stays
   in the same order of magnitude as today's 1.73 ms. Report the numbers.
4. A 48-client load test with the full outer ring populated. Report snapshot
   interval p95, peak visible projectiles, and peak entity count.
5. Frame time at High quality standing in the densest biome, and on Low.
6. Every check command in `docs/handoffs/README.md` passes.
7. Fresh captures in `docs/playtests/` for each new biome and each setpiece.

## Done when

A player at level 22 has three biomes they could go to, a different reason to
pick each, and no idea what they will run into when they get there.
