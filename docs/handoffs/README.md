# Handoffs

One file per phase of work. Each file is a complete, self-contained brief for an
agent starting cold in this repository. Hand over exactly one phase at a time.

| Phase | File                                                       | Theme                                                 | Estimate                                 |
| ----- | ---------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------- |
| 0     | shipped                                                    | Show, don't brief — first-session legibility          | done                                     |
| 1     | shipped                                                    | Minimap, world map, HUD, and an objective board       | done                                     |
| 2     | [phase-2-living-world.md](phase-2-living-world.md)         | Three times the map, seven biomes, ecology, setpieces | shipped                                  |
| 3     | [phase-3-doors-everywhere.md](phase-3-doors-everywhere.md) | Dungeon instances, portal drops, room graphs          | shipped                                  |
| 4     | [phase-4-mastery.md](phase-4-mastery.md)                   | Skill ceiling, attunements, level 30, new callings    | shipped except §5 and the fourth slot    |
| 5     | brief below                                                | Realm lifecycle and social fabric                     | shipped except the shared Crown raid bar |

Phases 2 to 5 landed together; what was cut from each is recorded in
`docs/VALIDATION.md` under "The living world, doors, mastery and the realm".

## The north star for every phase

**Easy to learn.** A stranger understands the screen in ten seconds and lands a
kill in sixty, without reading a paragraph. Nothing is named before it is seen.
One primary objective at a time, always with a direction.

**Difficult to master.** Every system has a depth layer that beginners never
trip over: dodge timing, target priority in mixed packs, boss break windows,
gear tradeoffs with a real opportunity cost, depth ladders, clear times.

**Engaging forever.** No two sessions look the same. Layouts, spawns, portals,
weather, and realm state are generated or driven by other players, so the reason
to log in this week did not exist last week.

Every change is measured against those three lines. A feature that adds depth by
adding explanation has failed the first line and should be redesigned.

## Order and parallelism

Phases 1 and 2 can run concurrently by two agents if they agree on the biome
table contract in Phase 2 §1 first. Phase 3 depends on Phase 2's biome data for
portal drop placement. Phase 4 depends on nothing but is best played after 2 and
3 exist to spend the mastery on.

## Rules that hold across all phases

- The client sends intent only. Every rule is server-authoritative.
- No SQLite schema break. Existing profiles must load and play. New character or
  profile fields are optional and defaulted.
- The full check suite stays green: `npm run typecheck`, `npm test`,
  `npm run test:journey`, `npm run test:balance`, `npm run test:expeditions`,
  `npm run test:depth`, `npm run test:e2e`, `npm run test:load`.
- Match the visual language: dark pine, ember gold, teal, warm parchment. No new
  fonts, no UI framework, no downloaded images or models. Everything procedural.
- Update `docs/ARCHITECTURE.md` in the same style as the surrounding prose, and
  add captures to `docs/playtests/` for anything visual.
- Report honestly. If a deliverable is cut, say which and why.

## Phase 5 brief — realm lifecycle and social fabric

Not yet written as a full handoff. The shape:

- **Liberation.** Each biome tracks kills against a quota. Thresholds unlock
  setpieces, surface a mini-boss, and lift the biome's fog. The world map shows
  liberation as a per-biome ring so an arriving player sees where the fight is.
- **A realm that ends.** Today the Sovereign dies, chat says so, and wardens
  respawn in 180 seconds. Make it an event: sky change, a one-minute warning to
  everyone, free travel to the Crown, a shared raid with a realm-wide health
  bar, then the realm closes with a recap for everyone present and a new realm
  opens on a fresh seed.
- **Parties and friends.** Shared marker, shared XP at any distance in the same
  dimension, party rally, a friends list keyed by account with travel-to.
- **Graves in the world.** Deaths are already recorded. Place a marker where each
  fell, with name and cause.
- **A realm board at the Hearth** showing liberation, open portals with timers,
  live events, and who is where.
