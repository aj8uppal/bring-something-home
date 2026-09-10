# Phase 1 — Sight Lines

**Minimap, world map, HUD, and an objective board.** Estimated 3–4 weeks.

You are working in Bring Something Home: a cooperative 3D bullet-hell RPG with a
Three.js client in `src/`, an authoritative Node realm server in `server/`, and
shared content and rules in `shared/`. Read `README.md` and
`docs/ARCHITECTURE.md` first. `npm ci && npm run dev` runs client and server;
open `http://127.0.0.1:5173`.

## Why this phase exists

Phase 0 fixed the first two minutes. This phase fixes the next two hours. The
information layer was designed for a world 172 units across with five zones and
one creature per zone. Phase 2 triples the map and adds seven biomes, eighteen
creature kinds, roaming packs, setpieces, and dropped portals. Every piece of UI
you build here must be driven by a table, never by the five zones that exist
today, or it will be rewritten in six weeks.

The reference for utility is Realm of the Mad God: a player-centered minimap they
can zoom, a stat panel that says exactly what your build does, and a quest arrow
that always points somewhere. Nothing on that screen needs a tutorial. Match that
bar, in this game's visual language.

## What exists right now

- `src/game/map.ts` (338 lines) — `drawMap(canvas, snapshot, large, objective, roster, selected)`
  draws both the minimap and the full map from one function, at a **fixed world
  scale centred on world origin** (`scale = min(w,h) / (large ? 196 : 189)`). It
  already draws zones, props, roads, the Hearth, dungeon ellipses, warden
  diamonds with seal checkmarks, enemies, the roster with name labels and
  density glow, loot, the event ring, the objective line, and the player arrow.
  It returns `MapHit[]` for clickable traveler labels.
- The minimap redraws at 2 Hz; snapshots arrive at 10 Hz.
- `src/main.ts` (~1708 lines) owns the HUD loop. Objective elements are
  `objective-name`, `objective-hint`, `objective-distance`, `objective-arrow`.
- `src/hud-ui.ts` — `kitHud()` renders equipment and satchel; `bagHud()` the
  nearby bag; `itemTooltip()` the hover comparison.
- `src/progression-ui.ts` — `hearthBriefing()`, `journeyOverview()`, `regionGuide()`.
- `shared/progression.ts` — `journeyGoal(profile, snapshot)` returns the single
  current `JourneyGoal`; `journeyTarget()` resolves it to a live position.
- `shared/combat.ts` — `combatStats(c)` returns `maxHp, maxMp, damage, reduction,
  speed, regen, rate`. `TRAITS` has six entries. `weaponShots(c)` describes the
  actual shot pattern.
- `shared/content.ts` — `ZONES` (5), `DUNGEONS` (3), `LANDMARKS`, `ENEMIES` (14).
- `shared/progression.ts` — `REGIONS` (4) carries level bands, tiers, and a
  one-line lesson per region.
- `shared/types.ts` — `Snapshot`, `RosterEntry`, `PlayerState`, `EnemyState`.

## Deliverables

### 1. A place table, not five hardcoded zones

Before touching UI, introduce the contract Phase 2 will fill.

Add `shared/places.ts` exporting a `PLACES` array. One entry per named area,
overworld or otherwise:

```ts
export interface Place {
  id: string;
  name: string;
  subtitle: string;
  x: number; z: number; radius: number;
  tier: number;              // 0 sanctuary, 1..n
  levels: [number, number];  // recommended band
  color: string;             // map + fog + ground tint
  kind: 'sanctuary' | 'wild' | 'dungeon' | 'setpiece';
  lesson?: string;           // one line of counterplay, shown on entry and in the atlas
  parent?: string;           // biome an inner area belongs to
}
```

Derive today's five zones, three dungeons, and four regions into `PLACES` and
make `ZONES`, `REGIONS`, `zoneAt()`, `regionGuide()`, and every UI consumer read
from it. Keep `ZONES` and `REGIONS` exported as derived views so existing tests
and callers keep working. Nothing else in this phase may hardcode a place.

### 2. The minimap: player-centred, zoomable, always useful

Rewrite the minimap path in `drawMap` (keep one function; branch on mode).

- **Centre on the player, north up.** Never on world origin.
- **Three zoom levels** at roughly 60, 120, and 240 world units across, cycled by
  a key (`N`, since `M` opens the atlas) and by clicking the corner control.
  Persist the choice in settings like `cameraTilt` already is.
- **Draw, in this order:** ground tint from the place under each sample, roads,
  place boundary arcs with the place name where it crosses the viewport edge,
  props as faint specks, loot bags in their bag colour, enemies (bosses larger
  and ember-gold), travelers in class colour, the objective marker.
- **Edge indicators.** Anything relevant outside the current zoom clamps to the
  minimap edge as a small chevron: your objective, an open portal, an active
  event, a boss, a party member. This is what makes a big world navigable.
- **Keep the 2 Hz redraw**, but interpolate the player dot every frame so it does
  not stutter. Redraw immediately on zoom change.
- Performance: at 240 units the prop loop must not iterate all 1,300 props per
  redraw. Bucket props into the same 4-unit grid `shared/world.ts` already builds
  for collision, and iterate only visible cells.

### 3. The atlas: a full map worth opening

`M` currently opens the same drawing at a bigger size. Make it a real screen.

- Whole realm, fit to the panel, with every place labelled with its name, level
  band, and drop tier from `PLACES`.
- **Live overlay:** travelers with names (already built, keep it), enemies,
  bosses with a health ring, open dungeon portals with population and stage,
  active events with a countdown, loot bags.
- **Legend** in a corner, four or five rows, drawn from the same colour constants
  the map uses. No prose.
- **Click behaviour:** click a traveler name to select and, at the Hearth, travel
  to them (this exists — keep the `MapHit` path). Click a place to pin it as a
  custom waypoint; the compass and minimap then point there until cleared.
- **Fog of discovery, optional but recommended.** Places a character has not
  entered draw dimmed with the name shown and detail hidden. Store in the
  existing optional `character.visited` field Phase 0 added. This turns the map
  into a to-do list, which is most of the "more objectives" ask.

### 4. The HUD: say what the build actually does

Today the rail shows equipment, satchel, and a salvage button. A player cannot
see their own damage, attack rate, or move speed anywhere outside a hover
comparison. Add a compact stat readout in the rail, above equipment.

- One row per stat from `combatStats()`: **Health, Light, Damage, Rate, Range,
  Speed, Armour**. Value right-aligned, `font-variant-numeric: tabular-nums`.
- Derive **Damage per second** from `weaponShots(c)` and `rate`, shown once,
  clearly labelled as assuming every bolt hits (the same honesty
  `shared/gear.ts` already applies).
- **Tier ceiling marker.** When a stat sits at the maximum its equipped tier can
  provide, mark it — a filled pip and an ember colour. This is the RotMG "maxed
  stat" affordance and it gives a player a visible goal per slot.
- **Live deltas.** Hovering a satchel or bag item tints the affected rows green
  or red with the delta, reusing `compareGear()`. No second tooltip system.
- **Traits line.** The active traits from equipped gear, by name, with the
  one-line description on hover. Six traits exist and most players never learn
  they have one.
- Collapse to a two-column compact form under 1100 px, and into the existing
  touch popover on phones.

### 5. An objective board, not one card

`journeyGoal()` returns exactly one goal. The game actually has six concurrent
sources of things to do: the chapter, the hunt contract, the tracked relic, the
realm seals, the live event, and recommended dungeons. Today five of them are
either hidden or crammed into stacked cards.

- Change `journeyGoal` into `journeyGoals(profile, snapshot): JourneyGoal[]`,
  each entry carrying `priority`, `source`, and the existing fields. Keep a
  `primaryGoal()` helper returning `goals[0]` so existing callers and
  `scripts/journey-check.ts` keep working.
- **HUD shows one:** the pinned goal, or the highest-priority goal if nothing is
  pinned. Same card as today, with the compass arrow.
- **`J` shows the board:** every available goal as a row with its reward,
  recommended level, distance, and a Pin button. Sorted by priority, with ones
  above the player's level marked rather than hidden.
- **Pinning** sets the compass, the minimap marker, and the HUD card. It persists
  on the profile as an optional field, alongside `trackedRelic`.
- Gating from Phase 0 stays: a source that has not unlocked yet does not appear
  on the board at all.

### 6. Threat legibility in the world

- **Name plates** above enemies within 20 units: name, and a level-band colour
  drawn from the creature's tier against the player's level (green safe, amber
  even, red dangerous). Bosses always plated with a health bar.
- **Bestiary on hover.** Holding `C` over a plated enemy shows its pattern name
  and the one-line counterplay already written in `attackPlan().hint` and
  `PLACES.lesson`. The text exists; it is just never shown at the moment it
  matters.
- **Danger tint.** When a player is three or more levels under the place's band,
  the screen edge carries a faint warm vignette. Remove it in sanctuary.

## Constraints

- One canvas draw function keeps serving both maps. Do not fork into two files.
- No new dependency. Canvas 2D and the existing CSS system only.
- The atlas must open in under 100 ms with 48 travelers on the roster.
- Keyboard: `M` atlas, `N` minimap zoom, `J` objective board, `C` bestiary. Do
  not reassign existing keys. Update the controls table in `README.md` and the
  in-game guide.
- Touch parity: minimap zoom control, atlas pan and pinch, and the stat readout
  in the popover.

## Verification

1. A fresh account can name their damage, attack rate, and current objective
   after 60 seconds on screen, without opening a panel.
2. Minimap at each zoom: the objective chevron is visible from anywhere in the
   realm, and clamps correctly at the edge.
3. Atlas with two browsers: names, portals, events, and a boss health ring all
   live; clicking a name at the Hearth travels.
4. Pin a place, walk away, confirm the compass and minimap follow the pin and not
   the chapter goal, and that the pin survives a reconnect.
5. Frame time on Low quality with the atlas open stays inside the existing 60 fps
   target. Record it.
6. Every check command in `docs/handoffs/README.md` passes. Extend
   `tests/progression.test.ts` for `journeyGoals` priority and pin behaviour, and
   add an e2e scenario for minimap zoom and atlas pinning.

## Done when

A player who has never seen the game can, without asking anyone: find where they
are, see where they should go, see what they will get for going there, tell
whether an area is too dangerous, read what their gear does, and find another
player on the map and travel to them.
