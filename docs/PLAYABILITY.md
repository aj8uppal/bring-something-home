# Playability and the return loop

The product promise is a short, readable adventure with other people: survive a
storm, recognize a useful drop, improve a build, and choose the next keeper.
A run should produce a story worth sharing even when it ends in death.

The reference is RotMG's combination of cooperative bullet-hell combat,
permadeath, personal loot, and persistent legacy, described in its
[official overview](https://hub.realmofthemadgod.com/about). The choices below are
our design interpretation, not evidence that Bring Something Home has achieved retention
or virality. Art, encounters, models, and implementation are original.

## What this release changes

| Player need                  | Concrete behavior                                                                                                                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read the space               | Smooth 32–78° camera tilt, Q counterclockwise / E clockwise rotation, close zoom, and trails oriented using the actual camera basis. The bright projectile core remains at its collision position.                                                              |
| Recognize a reward           | Original cloth bags: brown Weathered, purple Verdant, blue T1–4 Astral, cyan T5–6 Astral, gold Relic, white named keeper relic. Eight item slots open beside the satchel; hover or tap compares gear without cluttering combat.                                 |
| Clear a full satchel         | Drop individual items anywhere; salvage strictly outclassed gear at the Hearth. Locks, named relics, and tradeoffs survive bulk salvage. Ground swaps work with a full satchel.                                                                                 |
| Keep combat in sight         | Vitals sit above the hotbar and under the traveler. Characters, scenery, and solid shots share world depth; translucent trails sort far to near. Enemy silhouettes, committed animations, shaded hostile shots and quieter ally fire make threats legible.      |
| Remember a rare drop         | White bags have a distinct chime, warm white light, and an explicit personal-drop notice. Ordinary relic gear uses a gold bag.                                                                                                                                  |
| Choose a build goal          | Track a named relic in the journal. The HUD shows progress toward its sixth-victory guarantee and shard recipe, and the compass leads toward its keeper or dungeon.                                                                                             |
| Find friends                 | Every traveler is named on the large map and realm list at any distance; from the Hearth, Travel lands beside a friend in the wilds. P opens a live dungeon rally board. Invitations select a realm and dungeon and open its board after login.                 |
| Read difficulty in the world | Signposts at the road forks name the region and level ahead, dungeon portals carry their level, living wardens raise light columns visible across the island, and ground and fog take on each zone's color. The health frame turns red-brown when underleveled. |
| Understand a late join       | A board distinguishes gathering, active encounters, and cleared runs. All entry/depth rules remain authoritative. Late arrivals can earn keeper rewards; full-clear bonuses require every chamber.                                                              |
| Finish with a clear choice   | A saved recap shows expedition time, personal chamber participation, crew, and exact clear bonus. Collect floor drops, recall, bank spare gear, then select another run.                                                                                        |
| Share a real accomplishment  | Save an original 1200×630 PNG victory card and copy the matching dungeon invitation. Nothing is posted automatically, and credentials never appear in either artifact.                                                                                          |

## The shipped progression route

There is no entry briefing. A new traveler spawns facing the trouble at the gate,
and a three-line banner above the hotbar fades on the first step. The current task
stays in the HUD, with its reward and a matching map/compass target, and the first
arc advances on what the traveler just saw: three kills, the bag that drops, the
weapon inside, then six kills. The Crown and the Elders are explained once, the
first time a realm seal breaks while the traveler is online, and in the journal. J puts the actionable step before
endgame collections. Guidance stays visible in combat; nearby loot temporarily
uses that space. The area label warns when a traveler is below the recommendation.

| Stage             | Immediate task                                          | Concrete gain                              | Next challenge                                        |
| ----------------- | ------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------- |
| First expedition  | Kill three at the gate, take the bag, wear it, then six | Third-kill weapon; chapter armor and charm | Hunts to prepare for a warden at level 5              |
| Warden hunt       | Defeat a remaining realm warden                         | T3 Astral weapon, shards, boss bag         | Sunken Archive                                        |
| Archive           | Two chambers and the Archivist                          | T3 armor and charm, XP, permanent shards   | Crucible at recommended level 10                      |
| Crucible          | Two chambers and the Forgemother                        | T4 weapon and armor, XP, shards            | Prepare for the Crown at level 15                     |
| Break the Crown   | Remaining seals, then the Sovereign                     | Full T5 kit; permanent Elder portal unlock | Reach level 20                                        |
| Elder Convergence | Five encounters and three elders                        | T6 cache, permanent shards, next depth     | Twelve depths, rotating modifiers, relics, best times |

Hunt contracts rotate weapons, armor, and charms and advertise the exact XP, tier,
gold, and tonic reward. Chapter rewards are automatic, once per life, and remain
in personal bags if the satchel is full. Other travelers share the realm seals;
guidance accounts for already defeated wardens and realm renewal. Players can
challenge ordinary dungeons early, join friends, or choose a relic chase instead.

At endgame the first journal section recommends the next unlocked depth and offers
a direct rally from the Hearth. A selected relic shows its guaranteed-drop count
and crafting alternative. The complete chapter roadmap remains available in an
expandable reference. Rebirth preserves the vault, embers, shards, collections,
Elder progression, and times, while rebuilding the new character's equipment.

## First-session playtest

Use fresh accounts with people who have not seen the controls. Observe without
coaching. Treat these as hypotheses to test, not achieved metrics:

- Most players should land their first kill within a minute and identify a useful
  upgrade within two minutes. Ask them to explain the comparison in their own words.
- Players should understand the hurtbox, hostile shots, tonic, dodge, and instant
  recall before a boss fight. Record which deaths they could explain afterward.
- A friend receiving an invitation should find the right dungeon and recognize
  the host without coordinating coordinates in chat.
- After a clear, players should be able to distinguish permanent shards,
  carried equipment, and gear stored in the vault. Record whether they choose a
  new run, a different build target, or to stop.

Then run several sessions with experienced bullet-hell players. Compare first
runs with later runs, class choices, low and high camera angles, solo and group
encounters, and realistic network conditions. Review frame times and deaths
alongside player explanations. Automated perfect-information bots establish
mechanical feasibility, not whether humans enjoy or understand the encounters.

## Evaluate return and sharing

Measure voluntary second runs, return visits, completed friend joins, and the
reasons people leave. A copied invitation is not a successful friend join; a
successful join is not retained play. The app does not currently send analytics
to an external provider or claim measured retention. Begin with observed
sessions; add a clearly described measurement system when planning a public test.

Keep the sixth-victory guarantee and crafting path transparent. Good reasons to
return are skill improvement, interesting builds, cooperative moments, and
uncollected relics. There are no paid random rewards, punitive daily streaks, or
invented scarcity in this release.

Everything added since — attunement draughts, gear sets, dropped doors, depth
dials, the weekly season, liberation, and the account-wide things embers buy —
follows the same rule. Embers are earned by playing and buy room, a quicker
rebuild, and a name: a wider satchel, a second vault page, a starting kit, a
title, a banner and a cloak colour. None of them buys power, none of them is sold,
and nothing anywhere is gated behind a streak or a wallet. Attunements are lost
with the life on purpose: they are the one reward that would break permadeath if
it could be banked, so it cannot be.

See [validation](VALIDATION.md) for technical evidence and [deployment](DEPLOYMENT.md)
for the actual operational boundary.
