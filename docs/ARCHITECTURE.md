# Architecture

## Runtime boundary

The client sends **intent**, never positions, damage, rewards, inventory mutations,
experience, or death decisions. A Node process owns every realm. The 20 Hz fixed
step caps catch-up after stalls at 250 ms, and sends state at 10 Hz. The Three.js
client predicts local movement using shared collision geometry, interpolates remote
entities, and extrapolates projectile positions for rendering. Each snapshot
acknowledges an input sequence, the time applied to that input, and a teleport
epoch. The client replays newer local motion and eases small corrections; a
teleport resets the prediction history. Visual shot prediction and local ability
effects do not grant damage, loot, invulnerability, or permission to move.
The server decides collision outcomes using swept line-segment tests.

A realm has an overworld and three shared dungeon dimensions. Only entities in the
same dimension and within 48 world units appear in a traveler’s snapshots. Once a
second the snapshot also carries a realm roster: id, name, class, level, dimension,
and position for every connected traveler, so the map can name people at any
distance. Roster positions may be up to a second old and carry no combat state.
Nearby travelers share XP; every eligible traveler gets independent, soulbound loot.
Characters cannot hit each other. Safe-zone rules, collision geometry, bounds,
cooldowns, mana, item ownership, capacities, and trading location are validated by
the server. Diagonal movement is normalized and input expires after 350 ms.

## Network protocol

HTTP creates and restores accounts, returns the current profile, lists realms,
creates realms, and reads the leaderboard. WebSocket authentication occurs in the
first message, so tokens never enter URL query strings or access logs. An unauthenticated
socket has five seconds to join. WebSocket payloads are limited to 4 KiB. Input
schema validation rejects nonfinite and out-of-range numbers and unknown actions.
Per-connection and per-IP rate limits bound messages and expensive endpoints.

The compact wire codec in `shared/protocol.ts` transmits player/enemy tuples and
projectile spawn/removal deltas, with an optional projectile-art identity on spawn.
`PROTOCOL_VERSION` 2 adds the optional roster as compact rows; style-free and
roster-free packets remain valid. Projectiles have constant velocity, so repeated
motion is reconstructed from server time without resending every coordinate.
A complete baseline every two seconds, dimension changes, reconnects, and reset
signals after backpressure prevent stale shots. The client coalesces snapshots
before touching the scene or DOM, keeping a slow renderer from replaying stale
frames. Health, inventory, and other gameplay decisions remain authoritative.

## Combat progression

`shared/combat.ts` owns equipment effects and class attack parameters used by both
presentation and simulation. Old saved items without a trait remain valid.
`shared/patterns.ts` describes the same committed attack plans shown in telegraphs.
Boss health scales once when a group first damages it, and scaling clears after
10 seconds without a target. Phase transitions clear nearby bullets and delay the
next attack, leaving distant projectiles visible and dodgeable.

`shared/places.ts` is the single table of named areas. Each row carries a position and
radius, a tier, a recommended level band, a colour used by the map, fog and ground tint, a
kind of sanctuary, wild, dungeon or setpiece, and an optional line of counterplay. `ZONES`,
`REGIONS`, `DUNGEONS` and `zoneAt()` are derived views over it, in their established order,
so existing callers and saved tests are unaffected; `placeAt()` is the full record. Road and
island geometry live beside it, and `threatOf()` and `threatOfTier()` turn a level and a place
or creature tier into a safe/even/hard/deadly band that the map, the objective board and the
enemy plates all colour from. Adding a biome is adding a row: nothing in the information layer
hardcodes a place.

`shared/progression.ts` owns the journey plan, region recommendations, contract
rewards, chapter caches, and navigation targets. The client uses it for the HUD,
entry banner, journal, and map. The server uses the same reward definitions and alone
awards XP, currency, and items. All eight persisted quest indices remain compatible.
Chapter 0 still completes at six kills, but its displayed goal is a stepped tutorial
driven by observable state: kills below three target the gate creatures; a personal
bag holding a better weapon targets that bag; a better weapon carried unworn asks to
be worn; then the remaining kills. Chapter 1 introduces the first warden by place
before name: the server records each overworld zone a life enters in the optional
character `visited` field, and the grove step yields to the Rootbound on entry.
Caches drop into owned bags even when inventory is full, and completed chapters
cannot award again. Existing earned milestones are reconciled when joining.
A Sovereign victory also credits the first seal when a player joined after the
wardens fell. Elder chapter completion requires all five chambers in the current
life, recorded in an optional character `clears` field. Prior-life clears and a
late final-boss assist cannot satisfy it.

Two cinderlings stand permanently at the gate just outside the sanctuary edge; they
are fixed spawns outside the zone budget and always return to their posts. New
characters spawn at (0, 22) facing north and the play camera is north-up.

`populate()` fills each overworld zone from a table of weighted kinds, anchors, a
`baseCount` equal to the pre-budget population, a `perPlayer` growth rate, and a
cap. Every five seconds the realm counts travelers fighting in each zone and raises
living plus queued respawns toward `base + floor(perPlayer × travelers)`. With two
or more travelers present the living count is also topped up to `baseCount` at
once, and a staggered trickle is queued across the next five seconds that refills
toward the target and replaces what the crowd cleared in the last interval, capped
per interval. Respawn timers are unchanged; any respawn or trickle entry that would
push a crowded zone above its target is dropped when it fires. Solo play therefore
keeps the original counts and pacing. The meadow load scenario
(`LOAD_ZONE=meadow`) measures creatures present per second and requires no deficit
below `baseCount` longer than five seconds.

`travel` is a validated action that accepts a traveler id. The actor must stand in
the sanctuary and be off a 20-second cooldown; the target must be connected, alive,
in the overworld, and outside the sanctuary. The actor lands two units away on the
Hearth side, gets two seconds of invulnerability and a teleport epoch, and a portal
effect plays. Refusals spend no cooldown.

`journeyGoals()` returns every unlocked source of work at once: the chapter, a live event,
the realm seals, the repeatable hunt, a tracked relic, and the dungeons actually open to that
character. Each row carries a `source` and a `priority`, sorted with the chapter always first,
so the HUD card and the board can never disagree. `primaryGoal()` is `goals[0]`, and
`journeyGoal` remains an alias of it for existing callers and the journey check. Phase 0's
gating is unchanged: a source a character has not unlocked never appears, so a new traveler
still sees exactly one row. `chapterGoal()` is the chapter thread on its own.

A `pin` action stores one bounded id on the profile, naming either a place from the atlas or
a goal from the board. The server only remembers it; the client resolves it and lets it
outrank the chapter goal on the compass, the minimap and the HUD card until it is cleared.

Realm information includes the broken seal identities, Crown state, renewal time, and the
living overworld bosses with their health as a fraction. That last list is at most four
entries and lets the atlas ring a warden that someone is fighting on the other side of the
island, which snapshot interest alone could never show. Guidance never invents a living target: it chooses remaining wardens, the
open Sovereign, or a repeatable dungeon while the realm renews. Ordinary dungeon
levels are recommendations; the Elder victory, level, and depth gates are enforced.
Wild wardens remain idle until a traveler comes within 18 units or damages them.

Hunt rounds and progress belong to the living character and survive a restart.
Kill chains last 12 seconds, cap at 40% bonus XP, and reset on recall. Hunt rewards
and the guaranteed third-kill weapon become private ground drops, respecting
satchel capacity. Boss relic identities are fixed; their 16% drop chance and every-sixth-kill guarantee are shown
in the bestiary. Shards provide a deterministic crafting path. There is no monetization or purchased randomness.

`shared/gear.ts` compares the before/after character builds, including non-stacking
traits from other slots. Only strict dominance earns an upgrade or outclassed
badge. Mixed gains and losses are a tradeoff. Primary DPS assumes every bolt hits;
single-bolt damage and damaging ability power are shown separately. The server
preserves fractional firing cadence across fixed ticks so speed traits deliver
the advertised sustained attack rate.

`server/dungeons.ts` owns shared, staged expeditions. Entering creates or joins a
run; nearby altar actions start each encounter. Managed enemies never enter the
normal respawn queue. Each chamber clears hostile hazards and projectiles, restores
20% health and 30% light, and supplies one tonic to participating occupants.
A traveler must earn credit in every chamber and be present at the end to receive
the clear bonus. Occupied expeditions cannot be reset by late arrivals. Empty runs
expire after 60 seconds; the eight-second disconnect body counts as an occupant.

The Elder Convergence requires an account Sovereign victory and a level 20
character. A new run snapshots the opening player's chosen depth, bounded by their
highest clear plus one, and rotates its modifier. Late arrivals must independently
qualify for that depth. Twelve depths cap progression; repeated runs retain their
modifier, loot, and best-time goals. Depth and modifier health factors compose with
group scaling. Floor hazards transmit fixed positions and detonation times, never
retarget during their 1.65-second warning, and resolve damage exactly once.
Dodge immunity, sanctuary, and armor apply; the owning boss's death clears hazards.

## Bags and item management

`shared/loot.ts` defines eight-slot personal containers, representative quality,
and strict bulk-salvage eligibility. Nearby rewards merge only for the same owner
and dimension. The best remaining item determines bag color; taking a named relic
can change a white bag to a lower color. Full bags create another container.

The server validates bag reach, owner, dimension, expiry, and exact item ID.
`loot-all` moves only what fits. `loot-equip` atomically swaps worn gear into the
same bag and works with a full satchel. A locked worn item goes into the satchel
instead; without capacity, the swap fails without changing either side.
`drop` creates recoverable floor loot from an unlocked carried item. `lock`
persists on the item. `salvage` requires sanctuary and recomputes dominance using
the current build; it excludes locked items, named relics, and tradeoffs. Every
successful inventory transaction is saved. Floor bags remain ephemeral, expire,
and are destroyed with their owner on death; they are not a second bank.

The HUD caches equipment and container markup between real changes. Desktop
slots equip or collect on click; Shift-click swaps from a bag, without triggering
a dodge. Right-click drops a carried item. Hover/focus exposes a small comparison;
an explicit inspector provides the complete build table, drop and lock buttons.
Touch slots open the action popover. Bag slots never scroll, while dialog and chat
scroll remain native. The canvas gets the remaining desktop viewport beside the
rail; resize observation updates its render buffer and camera. Vitals sit above
the hotbar and beneath the traveler. Objective and interaction stacks grow in
normal layout flow instead of relying on fixed heights.

## Rally and clear results

`rally` is a validated action that accepts only a known dungeon ID and requires
sanctuary. It reuses portal entry and Elder depth eligibility. An occupied cleared
run cannot be reset through the board. Snapshots include a shared expedition
listing with live population and at most eight public crew previews per dungeon;
this is computed once per broadcast, not once per recipient. Invitations contain
only realm and dungeon IDs. A restart can reopen an expedition, so invitations
do not promise that a specific unfinished run is preserved indefinitely.

Each finished run records personal chamber credit, exact clear bonus, elapsed
server time, modifier/depth, and actual participating crew. A late assist records
zero clear bonus. The result is persisted with the final reward transaction and
remains through death/recovery. The client offers a recap after recall without
interrupting floor-loot collection. PNG victory cards are generated locally from
that result; they contain no credentials and are not a signed leaderboard record.

`track` accepts a known keeper ID or clears the goal. `shared/chase.ts` derives
sixth-victory progress and crafting cost from persisted boss counters. Tracking
does not change rewards, probabilities, or enemy behavior.

## Persistence

SQLite runs in WAL mode with a busy timeout. Account credentials are generated
with Node crypto and stored as SHA-256 hashes. Recovery rotates the session token.
Profiles contain character data, banked items, embers, discoveries, victories,
optional backward-compatible legacy data (shards, selected/highest Elder depth,
clear counts, boss kill counts, relic collection, and best times),
an optional tracked relic and last expedition result,
and up to 20 recent deaths. A separate indexed table retains leaderboard entries. Report and suspension
tables support operator moderation. Account deletion removes live personal
records in one transaction.

Profile writes occur on account/character creation, economic transactions,
important rewards, recall, disconnect, shutdown, and a batched five-second
checkpoint. A character death saves the new profile and inserts its grave in one
transaction. Abrupt process or machine failure can roll ordinary combat progress
back by up to five seconds; inventory transactions and recorded deaths have
already committed. Use the online SQLite backup API, not a copy of only the main
file while WAL writes are active.

Simulation positions, uncollected ground loot, active projectiles, hazards, expedition state, monsters, realm events, and raid seals
are ephemeral. A process restart returns saved travelers to the Hearth. The
server intentionally does not restore a character into an unobserved battlefield.

## Connection lifecycle

A duplicate authenticated login transfers control of the same character. It does
not create a second body. The old connection cannot issue further actions. An
unexpected disconnect stops input immediately, keeps a vulnerable body for eight
seconds, then saves and removes it. Rejoining during that window resumes the same
body; subsequent connections start at the Hearth. Recovery invalidates the old
token and closes its live connection. Graceful shutdown saves all profiles before
closing sockets with a restart code; clients reconnect with bounded backoff.

## Rendering

The world is original procedural geometry. Terrain colors, trees, grass, rocks,
ruins, and paths are seeded. Scenery and projectiles use instancing. Static shadow
maps avoid redrawing the entire island for every frame. Actor meshes, temporary
ring effects, loot geometry, and dungeon resources release owned GPU resources
when removed, including the per-instance GPU buffers of dungeon batches. Shared
geometry and cached materials remain reusable. Characters, including capes and the
hurtbox ring, use ordinary depth testing. There is no foreground cutout or forced
actor/projectile overlay. The four Hearth pillars use shared movement collision.
`shared/world.ts` defines open combat clearings; tall scenery stays at their edges.

`src/game/map.ts` draws both maps from one function, branching on mode. The minimap is
player-centred and north-up at 60, 120 or 240 world units across, cycled with `N` and stored
in settings; the atlas fits the island and labels every place with its band and drop tier,
dimming places absent from the character's `visited` list. Both read the place table, the
shared palette and the loot-bag colours, so the atlas legend cannot drift from what is drawn.
The minimap renders its world into an offscreen base at 2 Hz and blits it each frame at the
predicted player offset, with the arrow and the edge chevrons drawn per frame on top, so
movement is smooth without redrawing terrain at frame rate. Props come from the same 4-unit
collision grid `shared/world.ts` builds, queried by visible box rather than iterated whole.
Clicking the atlas hit-tests returned label rectangles: a traveler selects, a place pins.

The rail carries a build readout derived from `combatStats()` and `weaponShots()`: health,
light, damage, rate, range, speed, armour, and damage per second on the same every-bolt-hits
assumption the comparison tables use. A filled ember pip marks a stat already at the ceiling
its equipped tier can provide. Hovering any item tints the rows it would move using
`compareGear()`, so there is one comparison system rather than two. Enemy plates within 20
units, and every boss, take their colour from the same threat bands; holding `C` expands each
plate into its pattern name and counterplay line, and tapping `C` still opens the bestiary.

Living wardens (and the open Crown) raise instanced additive light columns that
ignore fog; the set follows the realm's seals and renewal. Dungeon portals carry a
canvas-drawn level sprite, three signposts stand at the road forks out of the
Hearth, and terrain vertex colors and the wilds fog drift toward each zone's map
color. No fonts or images are downloaded for any of it.

`src/game/creatures.ts` gives all fourteen enemy kinds original silhouettes with
merged, vertex-colored rigid parts. Prototype geometry and materials are shared;
per-actor limbs, wings, books, tails and cores animate from movement and the
server's committed windup/phase. Contact shadows anchor creatures to the ground.
Quest targets have a distinct marker and damaged creatures expose health bars.

Both quality settings target 60 fps; the title targets 24 fps. The renderer
adjusts world resolution between 65% and 100% when frame time requires it; the
DOM interface stays at native resolution. Low disables shadows. Projectiles use
two instanced passes sharing geometry and transforms: opaque shaded cores write
depth, then depth-tested translucent trails blend from far to near. Sorting uses
the actual camera view matrix rather than faction or creation order. Three class
silhouettes and seven hostile families retain distinct shapes. Allied opacity
defaults to 30%; screen-door coverage fades their solid cores without corrupting
depth. Hostile shots retain full opacity. Resolution changes precede rendering.
Impact sparks and dungeon architecture are instanced. Q rotates counterclockwise,
E clockwise, and movement remains relative to the view. Scroll zoom interpolates
between 0.30 and 1.60; camera changes preserve world-space aiming.
Camera pitch interpolates between 32 and 78 degrees and is saved locally.
Projectile trails use the actual camera basis; tilt never offsets the collision core.
Cloth bag models share bounded cached geometry/materials and use five draw calls
per container. Quality controls color, with cyan reserved for T5–6 Astral items and white
reserved for named keeper relics. Stitches distinguish tier families. Nearby personal drops show only item count and an upgrade marker.
The selected bag and item IDs are sent for pickup to avoid ambiguity in stacks. Shared line geometry renders boss attack guides. Timed danger discs
show the same hazard radius and deadline that the server uses.
It suspends drawing in hidden tabs. Software renderers automatically use Low.
The minimap updates at 2 Hz; network snapshots remain 10 Hz. No image downloads,
third-party font fetches, or model inference are needed to play.

## Scale boundary

A process admits up to 12 realms, each with 48 travelers. This is a capacity
ceiling, **not a benchmark of 576 simultaneous players**. One full realm is covered
by the checked-in load test. Account storage and realm ownership are local to one
process; do not point multiple independent processes at the same account database
and assume character ownership becomes distributed. For larger deployments,
introduce a shared account service, single-owner session routing, and realm worker
processes before horizontally scaling the public endpoint.

The current design has no public administrative HTTP endpoint. Operators review
reports and suspend accounts with a local database CLI. Server and database
access are operator responsibilities. TLS termination, off-host backups, monitoring,
abuse response, and staffed community moderation belong to the deployment.
