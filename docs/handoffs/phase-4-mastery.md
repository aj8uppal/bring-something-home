# Phase 4 — Mastery

**The skill ceiling, the stat economy, level 30, and two new callings.**
Estimated 4–5 weeks.

You are working in Bring Something Home: a cooperative 3D bullet-hell RPG with a
Three.js client in `src/`, an authoritative Node realm server in `server/`, and
shared content and rules in `shared/`. Read `README.md` and
`docs/ARCHITECTURE.md` first.

Depends on nothing technically. Best played after Phases 2 and 3 exist, so there
is somewhere to spend the mastery.

## Why this phase exists

Reaching level 20 costs 15,390 XP, which is a few hours. After that, character
progression is finished: three equipment slots, six traits, and a boss-relic
collection. Two level-20 Arcanists with the same tier gear are identical.

Separately, the combat has almost no skill ceiling above "dodge the bullets."
Dodge is a flat 0.32-second invulnerability on a 2.2-second cooldown. Kill chains
give up to 40% bonus XP and are invisible in the moment. Bosses have three phases
that differ only in shot count. A player who has mastered the patterns has no way
to express it beyond dying less.

Easy to learn is done. This phase is difficult to master.

## What exists right now

- `shared/combat.ts` — `TRAITS` (6), `combatStats()` returning `maxHp, maxMp,
  damage, reduction, speed, regen, rate`, `weaponShots()`, `chainMultiplier()`
  capped at 40% over a 12-second `CHAIN_WINDOW`, `BOSS_RELICS` (9).
- `shared/content.ts` — `CLASSES` (3), `MAX_LEVEL` 20, `xpForLevel()`,
  `RARITIES` (4), `SHOP` (4 items).
- `server/realm.ts` — `action()` handles `dash` (0.2 s dash, 0.32 s
  invulnerability, 2.2 s cooldown), `ability` per class, `upgrade` (tempering to
  tier 6 for gold and embers), `craft` (relics for star shards).
- `shared/endgame.ts` — `MODIFIERS` (4), `MAX_DEPTH` 12, `masteryTitle()`,
  `legacy` carrying shards, depths, clears, boss kills, relics, best times.
- `shared/patterns.ts` — `attackPlan()` with committed windups and phase-scaled
  shot counts.
- Embers accumulate from bosses, hunts, chapters, and deaths, and are spent only
  on tempering (5 per upgrade). They are effectively a dead currency.

## Deliverables

### 1. Skill expression in combat

Four mechanics, none of which a beginner needs to know, all of which reward a
player who has learned the patterns. Each must be discoverable by doing, not by
reading.

- **Perfect dodge.** A dash that begins within roughly 0.2 seconds before a
  hostile projectile would have hit refunds a portion of light and shortens the
  dash cooldown. Feedback: a distinct chime and a brief silver ring. A new player
  gets this by accident and wonders what happened; an expert builds around it.
  Server-authoritative: the server already knows every projectile's swept path.
- **Break windows.** Damaging a boss during its telegraph beyond a threshold
  cancels that attack and staggers it briefly. Bosses already expose `telegraph`
  from 0 to 1 and commit to a plan. Show the window as a brightening core, not a
  bar. Groups that focus learn to skip patterns.
- **Visible chains.** `chainMultiplier()` exists and is invisible. Surface it as
  a small ascending counter near the vitals with the remaining window, and extend
  the cap past 40% with steeper falloff, so a long chain is a real reward for
  aggressive play.
- **Positional damage.** Give each boss an exposed facing or core that takes
  extra damage. Draw it. This turns a damage race into a positioning problem and
  costs nothing in UI.

None of these change the outcome for a player who ignores them. All of them
change the outcome for a player who does not.

### 2. Attunements: the stat economy

The genre's real endgame is permanent, consumable stat gains. Add them.

- Seven attunement kinds, one per stat in `combatStats()`. Each is a consumable
  item that permanently raises that stat on the **current character** by a small
  fixed amount, up to a per-stat cap that scales with level.
- They drop from dungeon keepers and biome bosses, weighted so each boss favours
  two kinds. This gives every dungeon a reason to run after its relic is
  collected, which is the single biggest retention gap today.
- Show progress toward each cap in the Phase 1 stat readout: a filled pip row per
  stat, with the ember colour at cap. Reaching cap on a stat is a visible,
  brag-worthy milestone, exactly as maxing a stat is in the reference game.
- **They belong to the life, not the account.** Attunements are lost on death.
  This is the whole tension of the game and must not be diluted. Compensate by
  making them drop generously.
- Add a shard-to-attunement exchange at the Cinder Smith at a deliberately poor
  rate, as a floor for unlucky players.

### 3. Level 30, and a curve that earns it

- Raise `MAX_LEVEL` to 30, alongside Phase 2's outer ring.
- Keep `xpForLevel()` unchanged through level 20 so the early game is untouched,
  then steepen. Target roughly three times the total XP at 30 that 20 costs
  today, so the outer ring is a real journey rather than a formality.
- Per-level stat gains continue at the current rate. The outer ring's creature XP
  from Phase 2 should make the pace feel steady, not grindy. Verify with
  `npm run test:balance` extended to the new bands.

### 4. Item depth

- **Traits from six to twelve.** New ones should change how you play, not only a
  number: shots that ricochet off scenery, a shield that absorbs one hit per ten
  seconds, a dash that leaves a damaging trail, mana on perfect dodge, bonus
  damage while at full health, bonus damage while below a third.
- **Set bonuses.** Wearing a keeper's full trio grants a named bonus. Nine
  keepers, nine sets, each a build worth chasing. This makes the relic collection
  a goal rather than a checklist.
- **A fourth slot: ability items.** They modify the class ability rather than
  adding stats. An Arcanist nova that leaves a lingering field; a Wayfarer volley
  that marks targets; a Sentinel ward that also reflects. Three slots have been
  the shape since the beginning, so add the fourth carefully: keep the satchel
  and vault sizes, and make the slot empty by default with the class ability
  unchanged.

### 5. Two new callings

Unlocked by deeds, never by purchase. Each needs a silhouette in
`src/game/creatures.ts`, an ability, and a projectile family.

- **The Lanternkeeper** — places a stationary light that draws enemy fire and
  slowly heals allies standing in it. Unlocked by clearing the Sunken Archive.
  Teaches positioning as a resource.
- **The Cartographer** — lays traps and a recall beacon. Unlocked by discovering
  every setpiece in the realm. Rewards exploration with a playstyle.

If a third is wanted later, a Choirwarden with short-range heavy bursts unlocked
at Elder depth 6 fits the roster.

### 6. Spend the embers

Account-wide perks bought with embers, all quality-of-life or cosmetic, none
buying power directly:

- A fourth satchel row, and a second vault page.
- A starting Verdant kit for each new life, so rebuilding after death is quicker.
- Cloak colours and a Hearth banner.
- A named title from `masteryTitle()` shown beside the player name.

### 7. Seasons and boards

- Weekly realm modifiers drawn from an expanded `MODIFIERS` table, from four to
  around a dozen, announced at the Hearth.
- Leaderboards per season for deepest clear, fastest clear per template, and
  fame, reset with a persistent badge on the profile.
- Keep the Hall of Echoes as it is. Ranking real fallen travelers by fame is one
  of the best things in the game.

## Constraints

- **No purchased randomness, no monetization, no punitive daily streaks.** This
  is stated in `README.md` and `docs/PLAYABILITY.md` and it stays true.
- Nothing here may make the first two hours more complicated. Attunements, sets,
  the fourth slot, and the chain counter all stay hidden until the player first
  encounters one.
- Permadeath stakes are not softened. Attunements, levels, and carried gear are
  lost. The vault, embers, shards, relic collection, depths, and best times
  survive, exactly as today.
- Balance every new trait and set against `npm run test:balance`. A set bonus
  that makes a class trivially safe is a bug.
- Class additions need the same care as the original three: distinct silhouette,
  distinct projectile family, distinct range and cadence.

## Verification

1. A new player's first hour is measurably unchanged. Re-run the Phase 0 timings:
   time to first kill, first equip, and chapter 2.
2. Perfect dodge, break windows, and positional damage each verified in isolation
   with a scripted client, then in a real fight. Confirm no client-side grant of
   damage or invulnerability.
3. Two level-30 characters of the same class with different attunement spreads
   and different sets perform measurably differently. Show the numbers.
4. Death removes attunements and levels, and preserves everything the legacy is
   documented to preserve. Test against a real saved profile.
5. `npm run test:balance` extended through level 30 and every new trait and set.
6. Every check command in `docs/handoffs/README.md` passes.

## Done when

Two players who both cleared the Crown a week ago have different builds,
different goals, and different opinions about which boss is hardest.
