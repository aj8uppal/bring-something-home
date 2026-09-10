# Bring Something Home · validation record · 1.4.1 + Phases 0–5

Validated September 5, 2026 on macOS with Node 24.20.0, Three.js 0.185.1,
TypeScript 7.0.2, Vite 8.2.2, and Playwright 1.63.0. Local and public results are
identified separately below.

## The living world, doors, mastery and the realm · Phases 2–5 (September 9, 2026)

Four phases landed together. What follows is what was built, what the checks say, and
what was cut.

### The world

The wilds are one disc of radius 150. Inside radius 86 the island is byte-identical: the
prop stream, the heights and the five places are generated exactly as before, from their own
untouched random stream, and `groundHeight()` blends into a biome only beyond that radius,
across a 22-unit seam. Seven biomes tile the ring by bearing as two level ladders that rise
from the Hearth side and meet at the Ashfall behind the Crown, so a level-22 traveler has
three places they could go and a different reason for each.

Scenery is budgeted by density per biome rather than scaled: 3,120 props against the
original 1,300 for roughly three times the area, in one instanced batch per kind. Every road
in the realm is one table — the two Hearth roads extended to an inner ring at radius 80,
seven spokes, a ring road at radius 116 through every biome centre, and three one-way passes
home. A sweep of every road centreline at 0.4-metre intervals (4,642 samples) finds **zero
blocked points**, and a lap of the ring road passes through all seven biomes.

The spawn table is now an ecology of packs that spawn, patrol and wander together. Fourteen
new creatures and seven biome keepers carry `behaviour` as data — charger, kiter, bulwark,
splitter, summoner, anchor, lantern — with one attack pattern each, so a pack of one anchor,
two kiters and a lantern is a genuinely different fight made of bullets you already know how
to read. Twelve setpiece anchors take one of five shapes from the realm seed. Events are a
table of five in three shapes, and they move.

### Doors

`Dimension` is `'wilds'` or an instance id shaped `template:seed`. That refactor landed on
its own with the suite green before anything else in Phase 3. Layouts are generated from the
instance id alone — three to six chambers, one or two side rooms, sometimes a secret — so no
layout crosses the wire and two clients in the same instance draw the same architecture. A
flood fill over 360 generated layouts (nine templates × forty seeds) finds **every room
reachable from the entry in every one of them**.

Six templates only fall in the world, one per creature family. A dropped door stands open
for eighty seconds with a beam, a world label, an atlas icon and a chat line naming the
place; the instance outlives it, and nobody inside is ever moved. Any door opens at depth one
to five with the same scaling and modifier rotation and rewards to match, gated on the
traveler's own best clear of that template.

### Mastery

Level 30. `xpForLevel()` is unchanged through twenty and then steepens; reaching thirty costs
**3.37×** what reaching twenty costs, which is asserted in the unit tests. Seven attunement
draughts, one per stat, drunk where they lie and lost with the life; keepers pour them freely
and favour two kinds each. A perfect dodge — a dash that begins inside 0.2 s of a shot that
would have landed — refunds light and shortens the cooldown, decided by the server against
the live projectile set. Enough damage during a keeper's windup breaks the pattern, and the
core brightens as it goes. Every keeper's back takes 35% more; a creature's shielded front
turns shots aside entirely and a keeper's by 70%, and both now turn at a limited rate rather
than snapping, which is what makes a bulwark beatable alone.

### The realm

Every creature anyone puts down counts toward taking its place back. At a third the place's
ruins stop going quiet, at two thirds a second keeper comes out, and at the quota the fog
lifts and everyone standing there is paid. The atlas draws it as a ring per place; `K` opens
a board that draws it as a list, beside the open doors and their timers, the live event, the
woken setpieces, and everybody in the realm. Breaking the third seal starts a one-minute
muster: the sky turns, the road to the Crown is free from anywhere, and the Sovereign's fall
gives everyone present the same recap before the realm reseeds — new setpiece shapes, new
packs, every place to take again. Graves stand where travelers fell.

### Automated checks on this revision

| Check                      | Result                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `npm run typecheck`        | clean                                                                               |
| `npm test`                 | 111 unit tests pass (106 before)                                                    |
| `npm run test:e2e`         | 32 native Chrome scenarios pass                                                     |
| `npm run test:journey`     | all three callings complete chapter 8: arcanist 635 s, ranger 441 s, sentinel 853 s |
| `npm run test:balance`     | 66 solo boss encounters cleared, 66/66, plus a head-to-head build comparison        |
| `npm run test:expeditions` | 33 runs cleared, 33/33, across nine templates and depths 1, 3, 5 and 12             |
| `npm run test:depth`       | 32 depth samples correct                                                            |

`test:balance` grew from 27 encounters to 66: every biome keeper and every drop-door keeper
at its recommended band, on a real keeper's stage in a generated instance. It also runs two
level-30 arcanists against Vesper with different draught spreads and different sets, and
fails if they are not measurably different:

| Build  | Set                    | Health | Effective | Damage | Blocked | DPS   | Kill   |
| ------ | ---------------------- | ------ | --------- | ------ | ------- | ----- | ------ |
| Sharp  | The Sun and the Glass  | 966    | 1,558     | 222.0  | 38%     | 1,664 | 17.2 s |
| Steady | The Salt and the Stone | 1,218  | 2,581     | 175.4  | 53%     | 877   | 32.2 s |

### Server load

Twenty clients walk out along a biome's spoke road and hold a ring around its heart. The
budget must never leave a place below its base for longer than five seconds. Deficit
accounting starts once the herd has actually arrived, since a place nobody has reached yet is
not a starved place.

| Place                      | Tick work | p95 snapshot | Peak shots | Mean population (base 11/14) | Longest deficit |
| -------------------------- | --------- | ------------ | ---------- | ---------------------------- | --------------- |
| Cindermeadow               | 2.73 ms   | 108 ms       | 122        | 10.8                         | 1 s             |
| The Drowned Coast          | 1.58 ms   | 107 ms       | 312        | 26.2                         | 0 s             |
| The Petrified Orchard      | 0.41 ms   | 106 ms       | 115        | 30.9                         | 0 s             |
| The Salt Flat              | 0.37 ms   | 106 ms       | 163        | 26.7                         | 1 s             |
| The Shattered Observatory  | 0.63 ms   | 106 ms       | 323        | 26.4                         | 0 s             |
| The Bone Marsh             | 0.60 ms   | 109 ms       | 208        | 18.8                         | 0 s             |
| The Glacier of Fused Glass | 0.75 ms   | 107 ms       | 413        | 28.2                         | 0 s             |
| The Ashfall                | 1.67 ms   | 108 ms       | 611        | 18.5                         | 3 s             |

Today's recorded baseline was 1.73 ms of tick work with twenty clients in Cindermeadow; the
outer ring sits in the same order of magnitude and mostly below it.

Forty-eight clients in the open wilds with the whole outer ring populated: **p95 snapshot
interval 109 ms**, 2.88 ms of tick work, **peak 793 visible projectiles**, peak 51 visible
creatures, 237.7 MB aggregate over twenty seconds, zero errors. The 48-unit visibility filter
and friendly-shot collision both go through a bucket grid now; without it this is the
quadratic that breaks first.

Twenty-four clients opening doors until the cap is full: **24 live instances** — the
per-realm ceiling — with **0.36 ms of tick work and 23.7 MB of server heap**. `/api/health`
reports live instances, open doors, creature count and heap.

### Frame time and captures

Standing in the Petrified Orchard — the densest scenery in the realm at 8.5 props per
hundred square units — in the running app on native Chrome: **60 fps at High quality and
60 fps at Low**, 144 and 142 draw calls. Draw calls stay flat because every kind of scenery
is one instanced batch regardless of how many of it there are; the outer ring adds rows to
those batches, not new ones. Across the seven biomes on arrival, draw calls ranged from 71 in the Shattered Observatory
to 157 on the Drowned Coast, at 60 fps in all of them.
Captures: `playtests/biome-*.png` (seven), `playtests/setpiece-*.png`, and
`playtests/frames-orchard-high.png` / `-low.png`.

`CAPTURES=1 npx playwright test e2e/captures.spec.ts` walks the ring road from the Hearth,
records one image per biome and per setpiece into `docs/playtests/`, asserts that all seven
biomes name themselves distinctly on arrival, and prints frame time at both quality settings
from inside the densest scenery in the realm.

### Cut, deliberately

- **The two new callings.** The Lanternkeeper and the Cartographer are not built. A calling
  needs its own silhouette, projectile family, range and cadence, and its own place in the
  balance checks; done badly it is worse than absent. Phase 4 §5 is untouched.
- **The fourth, ability-modifying equipment slot.** Phase 4 §4's first two parts shipped —
  twelve traits and seven named sets — but the fourth slot did not. It changes persistence,
  every comparison table, the satchel and vault UI, and the balance of all three class
  abilities at once, and the brief asks for it to be added carefully.
- **Season leaderboards.** Twelve realm modifiers and a weekly season drawn from them
  shipped, announced on the realm board. Per-season boards for deepest clear, fastest clear
  and fame, with a persistent badge, did not: they need a schema for season history, which is
  the one thing the phases were told not to break.
- **The Crown raid's realm-wide health bar.** The realm ending is an event — a muster, a sky
  change, free travel, a shared recap and a reseed — but the Sovereign's health is shown by
  the existing boss ring rather than a dedicated realm-wide bar.
- **Party rally.** Parties share every kill in the same dimension at any distance and stand
  out on each other's cards; a party leader cannot pull the party into an instance. Moving
  someone else's traveler without their input needed more thought than a rally button, and
  the existing invitation flow already gathers a group at a door.
- **Attunements are drunk on pickup rather than carried.** The brief calls them consumable
  items. They are items, they drop into bags, and collecting one drinks it. Making them
  carryable would let them be banked, and anything bankable outlives the life, which is the
  one thing they must not do.

## Sight lines · Phase 1 (September 9, 2026)

The information layer now reads from one table. `shared/places.ts` holds every named area
with its band, tier, colour, kind and counterplay line; `ZONES`, `REGIONS`, `DUNGEONS` and
`zoneAt()` are derived views in their established order, so saves, tests and existing callers
are untouched. Nothing in the new UI hardcodes a place.

The minimap is player-centred and north-up at 60, 120 or 240 metres across, cycled with `N`
or the corner control and stored in settings. It draws the biome wash under you, roads, place
boundary arcs, props, loot in bag colour, creatures, travelers in class colour, and clamps
your objective, live portals, bosses, the event and your selected traveler to the edge as
chevrons. Its world is drawn into an offscreen base at 2 Hz and blitted each frame at the
predicted player offset, so movement is smooth without redrawing terrain at frame rate.
Props come from the existing 4-unit collision grid, queried by visible box.

The atlas labels every place with its band and drop tier, dims places absent from the
character's `visited` list, shows live portals with population and chamber, a boss health
ring, the event countdown, and named travelers. Clicking a name selects and travels; clicking
a place pins it. The rail carries a build readout — health, light, damage, rate, range, speed,
armour and damage per second — with an ember pip when a stat is at the ceiling its tier can
provide, live green/red deltas on hover through `compareGear()`, and the active traits by
name. `J` lists every unlocked goal with reward, level, distance and a Pin button.

Realm information also carries the living overworld bosses and their health, so a warden being
fought across the island shows a health ring on the atlas rather than being invisible to
snapshot interest.

Local checks on this revision: type checking, 106 unit tests (100 before: the place table and
its derived views, threat bands, board priority and gating, live-event ranking, pin
persistence, and the boss roster are new), 32 native Chrome browser scenarios (30 before; the new ones cover
minimap zoom persistence, atlas pinning through a reload, the build readout with hover deltas,
and the objective board), the journey check for all three classes, balance, expeditions, and
the depth check.

Frame time on Low quality, measured in the running app after walking into Cindermeadow:
60 fps with the atlas open and 60 fps with it closed; the atlas opened in 24 ms against the
100 ms budget, and a full atlas redraw costs 0.01 ms. The objective chevron was verified by
sampling minimap edge pixels with a pin 84 units away: present at 60 m and 120 m, and
correctly a ring rather than a chevron at 240 m where the target is back inside the frame.

Cut from this phase, deliberately: **fog of discovery is on**, but a character only records a
place in `visited` when it enters the wilds, so the sanctuary and dungeon interiors are always
treated as known rather than tracked separately. **Party members** are not among the minimap
edge chevrons because there is no party system yet; the selected traveler stands in for it
until Phase 5 builds parties. Screenshots: `playtests/p1-rail-build.png`,
`p1-minimap-60m.png`, `p1-minimap-120m.png`, `p1-minimap-240m.png`, `p1-objective-board.png`,
`p1-atlas-pinned.png`, `p1-threat-plates.png`, `p1-bestiary-hold.png`.

## First-session legibility · Phase 0 (September 9, 2026)

The Hearth briefing modal is gone. A new traveler spawns facing north with two
cinderlings in view just outside the sanctuary, a three-line banner above the
compass fades on the first step, and chapter 0 is a stepped goal driven by what
the traveler just saw (three kills, the bag, the weapon inside, then six). Hunt
contracts and the Wandering Star card wait for chapter 1 and level 3. A 1 Hz realm
roster names every traveler on the large map, with a server-validated travel-to
from the Hearth. Signposts, portal level sprites, warden light columns, and
per-zone fog and ground grading replace text. `populate()` now uses a per-zone
budget that grows with the travelers present. Saves, the SQLite schema, and all
eight persisted quest indices are unchanged.

Local checks on this revision: type checking, 100 unit tests (94 before this
work: the first arc's step transitions, gate spawns, the spawn budget, roster
encoding, travel, and travel refusals are new), 30 native Chrome browser
scenarios (29 before; the new one runs two browsers, names a traveler in the
Glasswaste on the large map from the Hearth, travels to them, and confirms the
refusals from outside the sanctuary and toward a dungeon), the journey check for
all three classes with the first-arc steps observed in order and a tier-2 weapon
worn at 4.9–5.6 simulated seconds, the balance and expedition checks, and the
depth check (32 of 32 samples correct).

Scripted first session, fresh account, real browser inputs, driven only by the
compass and objective card: HUD at 0.3 s, gate objective at 1.2 s, first shot at
3.1 s, bag step at 4.9 s, wear step at 6.3 s, tier-2 weapon worn at 6.8 s; never
more than one visible objective card; no modal. This is a scripted proxy for the
two-minute target in [playability](PLAYABILITY.md), not a human observation.

Load, 48 clients in the wilds for 20 s: 9,600 snapshots, 10 per player per second,
109 ms p95 interval, 2.01 ms average tick, 224.77 MB aggregate of which the roster
is 3.09 MB (about 1.4%), peak 788 projectiles and 49 enemies, no errors. Load,
20 paced clients in Cindermeadow for 30 s: creatures present per second stayed
between 11 and 22 after the first refill, the longest run below the base of 11 was
1 s, the instantaneous count averaged 7.9 with a minimum of 2, 105 ms p95. The
meadow clients fire in bursts with aim error to approximate people; perfect
turrets kill faster than any sane spawn rate, and presence per second is the
measure the five-second rule is applied to.

Known limits: the play camera is orthographic and top-down, so a warden's light
column is only in view once its arena scrolls onto the screen or from anywhere
north of it; it cannot be seen from the Hearth. The map keeps the seal markers for
distance. Screenshots: `playtests/v7-spawn-view.png`, `v7-first-arc-bag.png`,
`v7-first-arc-wear.png`, `v7-travel-to.png`, `v7-warden-beacon.png`,
`v7-phone-spawn.png`.

## Fullscreen and hosting release · 1.4.1

Added fullscreen controls on the title screen, minimap and Settings. The browser
owns fullscreen state; controls synchronize on entry and exit, including exits
initiated by the browser. Input is cleared across transitions. Unsupported
browsers receive a disabled control and explanation. Existing browser storage,
database paths and protocol identifiers remain unchanged.

Fresh local checks passed the production build, 94 unit tests and 29 native
Chrome browser scenarios. The additional scenario uses actual fullscreen API
entry/exit, keyboard activation in Settings, canvas resizing and resumed
movement after returning to a window. The final Settings privacy link was
included in a subsequent production build and focused fullscreen check.

The 48-client, 20-second local load check received 9,600 snapshots, 10 per player
per second, with a 110 ms p95 interval and 1.73 ms average simulation work. It
reached 762 visible projectiles and 33 enemies with zero errors. The production
dependency audit reported zero vulnerabilities. These remain local measurements,
not measurements of the public Fly.io host.

Receipts: `/tmp/bring-something-home-1.4.1-verify.txt`,
`/tmp/bring-something-home-1.4.1-final-build.txt`,
`/tmp/bring-something-home-1.4.1-final-fullscreen.txt`,
`/tmp/bring-something-home-1.4.1-load.txt` and
`/tmp/bring-something-home-1.4.1-audit.txt`.

The public Fly.io deployment passed an HTTPS browser smoke check with two
independent browsers: signup, mutual player visibility, fullscreen, movement,
recall, reload and recovery in a fresh touch browser. Both disposable accounts
were deleted afterward; no browser errors were recorded. A separate disposable
account retained its identity and valid session across a graceful Fly machine
restart, then was deleted. The volume and database are owned by `node:node`.
All nine served client files match the local release byte-for-byte, and the
deployed compiled server entrypoint SHA-256 also matches. The exact 1.4.1 archive
passed clean installation and backup verification with 62 entries.

Public receipts: `/tmp/bring-something-home-1.4.1-public-check.txt`,
`/tmp/bring-something-home-1.4.1-persistence.json`,
`/tmp/bring-something-home-1.4.1-deployed-files.json`, and
`/tmp/bring-something-home-1.4.1-release-check.txt`. Six title layouts also passed
on this revision (`/tmp/bring-something-home-1.4.1-layout.txt`). These checks do
not establish large-scale hosting capacity or independent player retention.

GitHub Pages publication succeeded for portfolio commit
`4b45efa8a2314789158ea51ff7ad4961cc74c262`
([deployment run](https://github.com/aj8uppal/aj8uppal.github.io/actions/runs/33998833277)).
A fresh browser followed the published collection card into the public game,
toggled fullscreen, and verified invitation parameters and the fallback with
JavaScript disabled. Receipt: `/tmp/bring-something-home-pages-live-check.json`.
The portfolio passed its complete visual gate and all 136 collection checks.

## Branded release attribution · earlier 1.4.0

The canonical title is **Bring Something Home**, with the line **Every life is
temporary. What you bring home can outlast it.** This revision changes public
branding, metadata, title sizing, the favicon, exported headings/filenames, and
the distribution filename. Gameplay remains version 1.4.0.

Fresh owner-run verification of the branded production build passed `npm run
verify`: type checking, client/server compilation, 94 unit tests, and all 28
native Chrome browser scenarios. Six additional title-layout checks passed at
1440×1000, 1280×720, 768×1024, 390×844, 320×740, and 844×390, with no title overflow,
navigation overlap, or browser errors. Captures are in [branding](branding/title-1440.png).

Five focused SwiftShader browser scenarios also passed on this branded build:
title/classes/guide, reload and account recovery, phone entry, relic tracking and
branded victory-card export, and the first-expedition briefing. The clean archive
check passed runtime-only installation, all three referenced client assets,
server health, compiled moderation tools, and a verified online database backup.

All 25 fingerprinted gameplay/compatibility files match the pre-rebrand source,
including shared content/types/protocol, persistence, progression simulation,
client storage/network/prediction/projectiles, database defaults, and the Compose
volume. The server entrypoint differs only in its startup label. Existing `ew:`
storage, database, and wire identifiers are preserved; no migration is required.

The gameplay, load, full software-renderer, bot-run, and advanced encounter results
below were recorded on the pre-rebrand 1.4.0 release. They are carried forward as
baseline evidence for unchanged mechanics. All evidence here is game-owner-run;
the portfolio worker owns independent snapshot verification and captures.

## Gameplay baseline

Q rotates counterclockwise and E clockwise, including the on-screen buttons.
Characters, scenery, hurtbox rings, reticles, and solid projectile cores use the
world depth buffer. Projectile cores write depth; translucent trails use a
separate pass sorted by the camera's view depth. Faction and creation order do
not determine which shot is on top. There is no foreground scenery cutout.
Open combat clearings keep tall props away from the main fighting grounds.
Wild wardens wait until approached within 18 units or deliberately attacked.

A shared progression model connects the briefing, HUD, journal, compass, map,
and authoritative rewards. It provides the current task, location, readiness,
reward, and next unlock. Area labels show recommended levels and loot tiers.
The journal begins with the current task and a direct dungeon rally when safe.
Completed endgame players see their next unlocked depth before the full roadmap.
Global seal identities and the Crown renewal state prevent stale boss targets.
Tracked relics show the guaranteed-drop count and point to an affordable recipe.
The live briefing preserves its controls between snapshots, so pointer clicks
and keyboard focus remain stable. Enter and Space activate focused UI controls.
Software renderers start at a reduced 3D resolution, adapt down to 35% when
needed, and target 30 fps in play and 12 on the title. Interface text remains at
native resolution. Returning to the title clears both projectile render passes.

Hunts award the advertised XP and rotate weapons, armor, and charms. Every
chapter supplies an automatic equipment cache. The first six kills supply armor
and a charm in addition to the third-kill weapon. Full satchels do not destroy
these rewards. Chapter indices remain compatible with saved characters, existing
milestones are reconciled on joining, and rewards cannot be claimed twice.
A final-boss assist or a previous life cannot satisfy the current full Elder
chapter: all five chambers must be credited in this life.

## Automated checks

| Check                       | Result                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `npm run verify`            | Production build, 94 unit tests, and 28 native browser scenarios passed                |
| `npm run test:e2e:software` | All 28 scenarios passed with forced SwiftShader                                        |
| `npm run test:journey`      | All three classes completed every chapter through Elder depth 3 from fresh accounts    |
| `npm run test:balance`      | 27/27 class/boss fixtures cleared                                                      |
| `npm run test:expeditions`  | 18/18 full expedition fixtures cleared, including depth 12 with all modifiers          |
| `npm run test:depth`        | 32 rendered-pixel assertions passed across four pitches and four yaws                  |
| `npm run test:release`      | Archive, clean runtime install, server, assets, operator tools, verified backup passed |
| Production dependency audit | 0 reported vulnerabilities                                                             |

The full browser suite ran against the production build in native Chrome/Metal
(1.4 minutes) and forced SwiftShader (7.5 minutes), with all 28 scenarios passing
in each mode.
It includes signup, recovery, deletion, two-browser co-op and invitations, chat,
muting/reporting, death/rebirth, all camera controls, delayed-input prediction,
loot ownership and full-satchel swaps, inventory comparisons, touch layouts,
dungeon travel, crafting, recaps, PNG downloads, progression briefing, preparation,
and direct next-depth rally. Signup rate limits remain enabled; ordinary gameplay
scenarios use saved test accounts to avoid exhausting the public creation quota.
A 250 ms movement-packet delay still produces local motion within 150 ms.
Co-op, recovery, and invitation scenarios run their second traveler in an
independent browser process to represent a second device.

The journey pilot starts ordinary new accounts and never assigns levels, gear,
position, kills, or rewards. It moves, fires, equips, swaps, banks, recalls, and
activates altars through the normal server input/action handlers. Full-clear
simulation times were 721.7 seconds for Arcanist, 446.4 for Wayfarer, and 649.3 for
Sentinel. These pilots have perfect state knowledge and precise dodging; the times
are feasibility checks, not predictions of human pacing or retention.

Additional unit coverage verifies once-only caches with full inventories,
retroactive earned chapter credit, exact contract XP, all three reward slots,
Crown renewal guidance, Elder prerequisites, affordable relic navigation,
non-aggressive distant wardens, open clearings, and full-chamber life-specific
credit. Projectile tests verify core alignment, ally opacity, dimension filtering,
and reversed transparent ordering after a camera orbit.

## Browser gameplay and rendering

A native Chrome run began as an ordinary level 1 Arcanist, collected and equipped
earned drops, reached level 8, defeated the first warden, and received the Archive
objective in 29.6 seconds using keyboard and mouse input. It had no injected gear
or progression. Sampled rendering was about 59–60 fps with no browser errors.
The pilot reads state to choose inputs; this is not an independent human playtest.

A separate five-encounter Elder Convergence run used a level 20, ordinary T6 Astral
fixture, then normal keyboard/mouse controls. It completed in 138.55 seconds at
62° tilt, including loot collection, all three elders, a saved recap, and PNG
export. Keeper counters were set to five before login to exercise guaranteed
white drops. The Apple M3 Max Metal renderer reported 60 fps in sampled updates
and 64 draw calls at completion, with zero browser errors.

The depth test renders an orange projectile both behind and in front of a solid
blue pillar and reads actual GPU pixels. All 32 positions produced the expected
visible surface. A separate close-camera character inspection found depth testing
enabled on every body part and the hurtbox ring. Twelve Archive entry/recall
cycles stayed at 65 geometries, 3 textures, and 29 shader programs with no errors.
These are bounded rendering and lifecycle checks, not a multi-hour memory soak.
A live fire/quit check also verifies that both projectile cores and trails are
present during firing and empty after returning to the title, with no errors.

- [First expedition briefing](playtests/v6-welcome.png)
- [Phone briefing](playtests/v6-phone-welcome.png)
- [Earned first-warden progression](playtests/v6-chapter-2.png)
- [Next expedition and preparation](playtests/v6-next-expedition.png)
- [Endgame route](playtests/v6-endgame-route.png)
- [Rendered depth comparisons](playtests/v6-depth-buffer.png)
- [Character depth at close zoom](playtests/v6-pillar-depth.png)
- [Elder floor attack at 62° tilt](playtests/v6-tideelder-hazard.png)
- [Completed Elder expedition](playtests/v6-elder-cleared.png)
- [Live clear recap](playtests/v6-live-recap.png)
- [Exported victory card](playtests/v6-live-victory.png)

## Server load

A 60-second Elder exercise used 48 authenticated WebSocket clients against a
separate server and disposable database: all 48 joined, 28,800 snapshots were
received (10 per player per second), p95 snapshot interval was 109 ms, average
tick work was 1.98 ms, and no errors were reported. Peak visible combat contained
768 projectiles and 17 enemies; aggregate traffic was 616.35 MB across clients.
This measures one full realm for one minute, not twelve full realms or an
internet deployment. The server's simulation budget is 50 ms per tick.

## Packaged release

`npm run release` produces `release/bring-something-home-1.4.0.tar.gz` with a SHA-256 checksum.
It includes compiled client/server code, runtime manifests, licenses, and launch
instructions. The allowlist excludes databases, accounts, environment files,
credentials, and installed dependencies. `npm run test:release` extracts the exact
bundle, verifies its checksum and launch link, installs production dependencies,
checks health and all referenced client assets, and runs the compiled moderation
and online backup tools with a fresh temporary SQLite database. The backup passes
SQLite's integrity check. CI includes the same distribution check.

## Scope of the evidence

Results apply to this workstation. Earlier tests with two simultaneous software
WebGL contexts in one browser process stalled, even with the recorder disabled.
The final co-op, recovery, and invitation tests use independent browser processes
and preserve their gameplay assertions. All scenarios pass in both modes with
that setup; multiple simultaneous software contexts in one process remain outside
the passing evidence. Native contexts also passed in one process before this
harness change.

No public domain or cloud service has been deployed. Docker is unavailable here;
the Linux container smoke job is configured but was not run locally. Real-device
Safari and Firefox, lower-powered hardware, multi-hour soaks, internet conditions,
and independent human balance/retention feedback remain unverified. Operational
setup is described in [Deployment](DEPLOYMENT.md); design intent and human test
questions are in [Playability](PLAYABILITY.md).
