import { DUNGEONS, ENEMIES, GATE, QUESTS, distance } from './content.js';
import { DUNGEON_PLACES, WANDERING_STAR, WILDS } from './places.js';
import { legacyOf, MAX_DEPTH } from './endgame.js';
import { relicChase } from './chase.js';
import { bagItems } from './loot.js';
import type { Character, DungeonId, Item, Profile, Rarity, Slot, Snapshot, Vec } from './types.js';

/** The same contract and chapter rewards drive the server, HUD, journal, and map.
 * Derived from the wild places so a new biome joins the guidance by being added there. */
export const REGIONS = WILDS.map((p) => ({
  id: p.id,
  name: p.id === 'grove' ? 'Hollow Grove' : p.id === 'glass' ? 'Glasswaste' : p.name,
  level: p.levels[0],
  end: p.levels[1],
  tier: p.tier,
  x: p.hunt?.x ?? p.x,
  z: p.hunt?.z ?? p.z,
  kind: p.creature!,
  direction: p.direction!,
  lesson: p.lesson!,
}));

export const WARDENS = [
  { kind: 'rootwarden', x: -43, z: -20, region: 'Hollow Grove', level: 5 },
  { kind: 'duskwarden', x: 0, z: -35, region: 'Northern Cindermeadow', level: 8 },
  { kind: 'glasswarden', x: 42, z: -25, region: 'Glasswaste', level: 10 },
] as const;

export const CHAPTER_CACHES: { tier: number; rarity: Rarity; slots: Slot[]; label: string }[] = [
  { tier: 2, rarity: 'uncommon', slots: ['armor', 'charm'], label: 'T2 armor + charm' },
  { tier: 3, rarity: 'rare', slots: ['weapon'], label: 'T3 Astral weapon' },
  { tier: 3, rarity: 'rare', slots: ['armor', 'charm'], label: 'T3 Astral armor + charm' },
  { tier: 4, rarity: 'rare', slots: ['weapon', 'armor'], label: 'T4 Astral weapon + armor' },
  { tier: 5, rarity: 'rare', slots: ['weapon', 'armor', 'charm'], label: 'Full T5 Astral kit' },
  { tier: 5, rarity: 'rare', slots: ['charm'], label: 'T5 Astral charm' },
  { tier: 6, rarity: 'rare', slots: ['weapon'], label: 'T6 Astral weapon' },
  { tier: 6, rarity: 'rare', slots: ['armor', 'charm'], label: 'T6 Astral armor + charm' },
];
export const CHAPTER_UNLOCKS = [
  'Prepare for your first warden at level 5',
  'Take on the Sunken Archive',
  'Prepare for the Ember Crucible at level 10',
  'Break all three realm seals and challenge the Crown',
  'Elder portal awakened on this account · level 20 required',
  'Enter the Elder Convergence',
  'Climb the Elder depths · each clear opens the next',
  'Push to depth 12, complete the nine relics, and improve your best times',
];

export function huntContract(c: Character) {
  const round = c.huntRound ?? 0;
  const tier = Math.min(4, 1 + Math.floor(round / 2));
  return {
    round: round + 1,
    kills: c.huntKills ?? 0,
    target: Math.min(18, 8 + round * 2),
    tier,
    slot: (['weapon', 'armor', 'charm'] as const)[round % 3],
    rewardTier: tier + 1,
    gold: tier * 25,
    xp: tier * 100 + Math.min(8, round) * 25,
    region: REGIONS[tier - 1],
  };
}

/** Where a goal comes from. The board shows every unlocked source at once. */
export type GoalSource = 'chapter' | 'event' | 'seals' | 'hunt' | 'relic' | 'dungeon';
export interface JourneyGoal {
  id: string;
  /** Sort order on the board. Lower is more urgent; the chapter is always 0. */
  priority?: number;
  source?: GoalSource;
  chapter: number;
  chapterName: string;
  title: string;
  detail: string;
  reward: string;
  unlock: string;
  current: number;
  total: number;
  progressLabel: string;
  level: number;
  gearTier: number;
  target: Vec & { name: string; hint: string };
  enemy?: string;
  dungeon?: DungeonId;
  depth?: number;
}

/** The chapter goal: the single thread the story pulls you along. */
export function chapterGoal(profile: Profile, snapshot?: Snapshot): JourneyGoal {
  const c = profile.character!;
  const chapter = Math.min(c.quest, QUESTS.length);
  const q = QUESTS[chapter];
  const legacy = legacyOf(profile);
  const goal: JourneyGoal = {
    id: `chapter-${chapter}`,
    chapter,
    chapterName: q?.name ?? 'Beyond the Crown',
    title: q?.text.replace(/\.$/, '') ?? 'Carry your legacy further',
    detail: q?.hint ?? '',
    // Embers are named only after the Cinder Smith or vault has introduced them.
    reward: q
      ? `${CHAPTER_CACHES[chapter].label} · ${q.gold} gold${chapter >= 2 ? ' · 5 embers' : ''}`
      : 'Permanent shards, relics, and personal bests',
    unlock: CHAPTER_UNLOCKS[Math.min(chapter, 7)],
    current: c.questProgress,
    total: q?.target ?? MAX_DEPTH,
    progressLabel: 'Progress',
    level: 1,
    gearTier: 1,
    target: { ...GATE, name: 'Trouble at the gate', hint: 'Head north' },
  };
  const train = (level: number, tier: number, title: string) => {
    const contract = huntContract(c),
      region = REGIONS[tier - 1];
    Object.assign(goal, {
      id: `train-${level}`,
      title,
      level,
      gearTier: Math.max(1, tier),
      current: c.level,
      total: level,
      progressLabel: 'Level',
      enemy: region.kind,
      detail: `${region.direction}. Defeat creatures to gain XP; finish hunts for guaranteed Astral gear.`,
      reward: `Hunt: T${contract.rewardTier} ${contract.slot} · ${contract.xp} XP · ${contract.gold} gold · tonic`,
      target: { ...region, hint: region.lesson },
    });
  };
  const dungeon = (id: DungeonId, title?: string) => {
    const d = DUNGEONS[id];
    Object.assign(goal, {
      dungeon: id,
      enemy: undefined,
      depth: undefined,
      level: d.level,
      gearTier: id === 'hollow' ? 2 : id === 'crucible' ? 3 : 5,
      title: title ?? `Clear ${d.name.replace(/^The /, '')}`,
      detail: `${id === 'hollow' ? 'West' : id === 'crucible' ? 'East' : 'South'} of the Hearth. ${id === 'eclipse' ? 'Five encounters, three elders' : 'Two chambers and a keeper'}. Activate each lit altar when ready.`,
      target: { ...d, hint: 'X at the portal · P to rally from the Hearth' },
    });
  };
  const crown = () => {
    goal.enemy = undefined;
    goal.dungeon = undefined;
    goal.depth = undefined;
    const remaining = WARDENS.filter((w) => !snapshot?.realm.seals?.includes(w.kind));
    if (snapshot?.realm.crown === 'restoring') {
      dungeon(c.level < 10 ? 'hollow' : 'crucible', 'The Crown is rebuilding · Run a dungeon');
      goal.detail = `The realm renews in ${Math.ceil((snapshot.realm.renewal ?? 0) / 60)} min. Dungeon keepers and their rewards can be repeated now.`;
      return;
    }
    if (snapshot?.realm.wardens === 3 || !remaining.length) {
      goal.title = 'Defeat the Ashen Sovereign';
      goal.enemy = 'sovereign';
      goal.level = 15;
      goal.gearTier = 4;
      goal.target = {
        x: 0,
        z: -66,
        name: ENEMIES.sovereign.name,
        hint: 'The Crown is open · Far north · R retreats instantly',
      };
      goal.detail =
        'All three seals are broken. Defeat the Sovereign to awaken the Elder portal permanently.';
    } else {
      const w = remaining[0];
      if (chapter === 1 && w.kind === 'rootwarden' && !c.visited?.includes('grove')) {
        // Step d: the first warden is introduced by its place, then by its name.
        const grove = REGIONS[1];
        Object.assign(goal, {
          id: 'first-grove',
          title: 'Reach the Hollow Grove',
          level: w.level,
          gearTier: 2,
          current: 0,
          total: 1,
          progressLabel: 'Grove',
          detail: `${grove.direction}. The oldest tree waits among the roots.`,
          target: { x: grove.x, z: grove.z, name: grove.name, hint: grove.lesson },
        });
        return;
      }
      goal.title =
        chapter === 1
          ? w.kind === 'rootwarden'
            ? 'Wake the Rootbound'
            : 'Defeat your first warden'
          : `Break the seals · ${snapshot?.realm.wardens ?? 0}/3`;
      goal.enemy = w.kind;
      goal.level = w.level;
      goal.gearTier = w.level >= 10 ? 3 : 2;
      goal.current = chapter === 1 ? 0 : (snapshot?.realm.wardens ?? 0);
      goal.total = chapter === 1 ? 1 : 3;
      goal.progressLabel = 'Seals';
      goal.detail = `${ENEMIES[w.kind].name} waits in ${w.region}. Every traveler shares the realm's seal progress.`;
      goal.target = {
        ...w,
        name: ENEMIES[w.kind].name,
        hint: `${w.region} · LV ${w.level}+ recommended · Guaranteed boss bag`,
      };
    }
  };

  if (chapter === 0) {
    // The first arc is the tutorial. Each step is named after the thing the player just saw.
    const worn = c.equipment.weapon?.power ?? 0;
    const better = (item: Item) => item.slot === 'weapon' && item.tier >= 2 && item.power > worn;
    const bag = (snapshot?.loot ?? []).find((b) => bagItems(b).some(better));
    const carried = c.inventory.find(better);
    goal.progressLabel = 'Creatures';
    goal.current = Math.min(6, c.kills);
    goal.total = 6;
    goal.reward = `Armor and a charm at six kills · ${q.gold} gold`;
    if (c.kills < 3) {
      Object.assign(goal, {
        id: 'first-gate',
        title: 'Kill three of the creatures at the gate',
        enemy: 'cinderling',
        current: Math.min(3, c.kills),
        total: 3,
        detail: 'Trouble waits just north of the Hearth. Hold the mouse to fire and keep moving.',
        reward: 'Your third kill drops a better weapon',
        target: {
          ...GATE,
          name: 'Trouble at the gate',
          hint: 'Hold the mouse to fire · Keep moving',
        },
      });
    } else if (bag) {
      Object.assign(goal, {
        id: 'first-bag',
        title: 'A bag dropped. Take it (X)',
        detail: 'Your third kill left a bag on the ground. Walk to it and press X.',
        reward: 'A better weapon is inside',
        target: { x: bag.x, z: bag.z, name: 'A bag dropped', hint: 'X takes it' },
      });
    } else if (carried) {
      const here = snapshot?.self ?? GATE;
      Object.assign(goal, {
        id: 'first-wear',
        title: 'Wear it (click it, or G)',
        detail: 'The new weapon is in your satchel. Click its ↑ slot, or press G.',
        reward: 'More damage on every shot',
        target: {
          x: here.x,
          z: here.z,
          name: 'Wear it',
          hint: 'Click the ↑ satchel slot, or press G',
        },
      });
    } else {
      Object.assign(goal, {
        id: 'first-clear',
        title: `Three more · ${Math.min(6, c.kills)}/6`,
        enemy: 'cinderling',
        detail: 'Keep moving between the glowing shots. Armor and a charm drop at six kills.',
        target: { ...GATE, name: 'Trouble at the gate', hint: 'Keep moving between the shots' },
      });
    }
  } else if (chapter === 1) {
    if (c.level < 5) train(5, 1, 'Prepare for your first warden');
    else if (snapshot?.realm.wardens === 3 && c.level < 15) {
      dungeon(c.level < 10 ? 'hollow' : 'crucible', 'The seals are broken · Prepare for the Crown');
      goal.detail +=
        ' This realm’s wardens have already fallen. The Sovereign also credits your first seal.';
    } else crown();
  } else if (chapter === 2) dungeon('hollow');
  else if (chapter === 3) {
    dungeon(
      c.level < 10 ? 'hollow' : 'crucible',
      c.level < 10 ? 'Reach level 10 · Return to the Archive' : undefined,
    );
    if (c.level < 10) {
      goal.current = c.level;
      goal.total = 10;
      goal.progressLabel = 'Level';
      goal.reward = 'Archive: T3 treasure · keeper XP · 5 permanent shards for a full clear';
    }
  } else if (chapter === 4) {
    if (c.level < 15) {
      dungeon('crucible', 'Reach level 15 · Master the Crucible');
      goal.current = c.level;
      goal.total = 15;
      goal.progressLabel = 'Level';
      goal.reward = 'Crucible: T4 treasure · keeper XP · 7 permanent shards for a full clear';
    } else crown();
  } else if (chapter === 5) train(20, 4, 'Reach level 20 · Hunt the Crown');
  else {
    // Reborn travelers retain the legacy but must rebuild their current character.
    if (!profile.victories) crown();
    else if (c.level < 20)
      train(
        20,
        c.level < 5 ? 1 : c.level < 10 ? 2 : c.level < 15 ? 3 : 4,
        'Rebuild your strength for the Elders',
      );
    else {
      dungeon('eclipse');
      goal.depth = Math.min(MAX_DEPTH, legacy.highestDepth + 1);
      goal.title = `Clear Elder depth ${goal.depth}`;
      goal.current = legacy.highestDepth;
      goal.total = chapter === 7 ? 3 : MAX_DEPTH;
      goal.progressLabel = 'Deepest clear';
      goal.reward = `T6 Astral cache · ${17 + goal.depth * 2} permanent shards for a full clear`;
      goal.unlock =
        goal.depth < MAX_DEPTH
          ? `Unlock Elder depth ${goal.depth + 1} and its stronger storms`
          : 'Complete all nine relics, try other classes, and improve your best times';
    }
  }

  const chase = profile.trackedRelic && relicChase(profile, profile.trackedRelic);
  if (chase) {
    const kind = profile.trackedRelic!;
    const dim: DungeonId | undefined =
      kind === 'archivist'
        ? 'hollow'
        : kind === 'forgemother'
          ? 'crucible'
          : ['tideelder', 'cinderelder', 'nullelder'].includes(kind)
            ? 'eclipse'
            : undefined;
    if (dim !== 'eclipse' || (profile.victories > 0 && c.level >= 20)) {
      if (dim) dungeon(dim);
      else if (kind === 'sovereign' || snapshot?.realm.seals?.includes(kind)) crown();
      else {
        const w = WARDENS.find((w) => w.kind === kind)!;
        goal.enemy = kind;
        goal.dungeon = undefined;
        goal.target = {
          ...w,
          name: ENEMIES[kind].name,
          hint: `${w.region} · Hunt this keeper for its white bag`,
        };
      }
      goal.id = `chase-${kind}`;
      goal.title = `Find ${chase.relic.name}`;
      goal.current = 6 - chase.untilGuaranteed;
      goal.total = 6;
      goal.progressLabel = 'Keeper victories';
      goal.reward = `${chase.untilGuaranteed} more ${chase.untilGuaranteed === 1 ? 'victory' : 'victories'} guarantees its white bag`;
      goal.unlock = `${chase.shards}/${chase.cost} shards to craft${chase.known ? ' at the Cinder Smith' : ' after your first keeper victory'}`;
      if (chase.known && chase.shards >= chase.cost && snapshot?.self.safe) {
        goal.target = {
          x: -6,
          z: 22,
          name: 'Craft your tracked relic',
          hint: `You have ${chase.cost} shards · X at the Cinder Smith`,
        };
        goal.detail =
          'You can forge this relic now. Your collection survives death; the item itself must be banked to keep it safe.';
        goal.dungeon = undefined;
        goal.enemy = undefined;
      }
    }
  }
  return goal;
}

/** Every unlocked thing worth doing right now, most urgent first.
 *
 * Phase 0's gating holds: a source the character has not unlocked never appears, so a new
 * traveler still sees exactly one row. Everything here is derived from live state, so the
 * board and the HUD card can never disagree.
 */
export function journeyGoals(profile: Profile, snapshot?: Snapshot): JourneyGoal[] {
  const c = profile.character;
  if (!c) return [];
  const goals: JourneyGoal[] = [];
  const chapter = chapterGoal(profile, snapshot);
  goals.push({ ...chapter, source: 'chapter', priority: 0 });

  // The wandering star is time-limited, so it outranks anything repeatable while it burns.
  if (snapshot?.event?.active && c.level >= 3)
    goals.push({
      ...chapter,
      id: 'event-star',
      source: 'event',
      priority: 10,
      title: 'Secure the Wandering Star',
      detail: `${WANDERING_STAR.lesson} The light fades in ${Math.ceil(snapshot.event?.remaining ?? 0)} seconds.`,
      reward: '10 embers · 60 gold for everyone nearby',
      unlock: 'A fallen star is only worth what you carry out of it',
      current: snapshot.event?.kills ?? 0,
      total: snapshot.event?.target ?? 12,
      progressLabel: 'Guardians',
      level: WANDERING_STAR.levels[0],
      gearTier: WANDERING_STAR.tier,
      enemy: undefined,
      dungeon: undefined,
      depth: undefined,
      target: {
        x: WANDERING_STAR.x,
        z: WANDERING_STAR.z,
        name: WANDERING_STAR.name,
        hint: WANDERING_STAR.lesson!,
      },
    });

  // Realm seals: shared progress, so it is worth showing even when the chapter is elsewhere.
  const broken = snapshot?.realm.wardens ?? 0;
  const remaining = WARDENS.filter((w) => !snapshot?.realm.seals?.includes(w.kind));
  if (c.quest >= 1 && remaining.length && chapter.source !== 'seals') {
    const w = remaining[0];
    goals.push({
      ...chapter,
      id: `seals-${w.kind}`,
      source: 'seals',
      priority: 20,
      title: `Break the seals · ${broken}/3`,
      detail: `${ENEMIES[w.kind].name} still stands in ${w.region}. Every traveler shares this progress.`,
      reward: 'A guaranteed boss bag · shards · the Crown opens at three',
      unlock: 'Three seals wake the Ashen Sovereign at the Crown',
      current: broken,
      total: 3,
      progressLabel: 'Seals',
      level: w.level,
      gearTier: w.level >= 10 ? 3 : 2,
      enemy: w.kind,
      dungeon: undefined,
      depth: undefined,
      target: {
        x: w.x,
        z: w.z,
        name: ENEMIES[w.kind].name,
        hint: `${w.region} · LV ${w.level}+ recommended`,
      },
    });
  }

  // The repeatable hunt, unlocked with the first chapter exactly as the HUD card is.
  if (c.quest >= 1) {
    const contract = huntContract(c);
    goals.push({
      ...chapter,
      id: `hunt-${contract.round}`,
      source: 'hunt',
      priority: 30,
      title: `Hunt ${contract.round} · ${contract.target} tier ${contract.tier}+ creatures`,
      detail: `${contract.region.direction}. ${contract.region.lesson}`,
      reward: `Guaranteed T${contract.rewardTier} Astral ${contract.slot} · ${contract.xp} XP · ${contract.gold} gold · 1 tonic`,
      unlock: 'Hunts never run out. The next round asks for tougher creatures.',
      current: contract.kills,
      total: contract.target,
      progressLabel: 'Creatures',
      level: contract.region.level,
      gearTier: contract.tier,
      enemy: contract.region.kind,
      dungeon: undefined,
      depth: undefined,
      target: {
        x: contract.region.x,
        z: contract.region.z,
        name: contract.region.name,
        hint: contract.region.lesson,
      },
    });
  }

  // A chosen relic, if the player has chosen one.
  const chase = profile.trackedRelic && relicChase(profile, profile.trackedRelic);
  if (chase && chapter.source !== 'relic') {
    const kind = profile.trackedRelic!;
    const w = WARDENS.find((w) => w.kind === kind);
    goals.push({
      ...chapter,
      id: `relic-${kind}`,
      source: 'relic',
      priority: 40,
      title: `Find ${chase.relic.name}`,
      detail: `${ENEMIES[kind].name} carries it. Every sixth victory guarantees the drop.`,
      reward: `${chase.untilGuaranteed} more ${chase.untilGuaranteed === 1 ? 'victory' : 'victories'} guarantees its white bag`,
      unlock: `${chase.shards}/${chase.cost} shards to craft it instead`,
      current: 6 - chase.untilGuaranteed,
      total: 6,
      progressLabel: 'Keeper victories',
      level: w?.level ?? ENEMIES[kind].tier * 5,
      gearTier: ENEMIES[kind].tier,
      enemy: kind,
      dungeon: undefined,
      depth: undefined,
      target: w
        ? { x: w.x, z: w.z, name: ENEMIES[kind].name, hint: `${w.region} · hunt this keeper` }
        : chapter.target,
    });
  }

  // Dungeons that are actually open to this character.
  for (const place of DUNGEON_PLACES) {
    const id = place.dimension!;
    if (id === 'eclipse' && (!profile.victories || c.level < 20)) continue;
    if (id === 'hollow' && c.quest < 1) continue;
    if (id === 'crucible' && c.quest < 2 && c.level < place.levels[0]) continue;
    if (chapter.dungeon === id) continue;
    const listing = snapshot?.expeditions?.find((e) => e.dimension === id);
    goals.push({
      ...chapter,
      id: `dungeon-${id}`,
      source: 'dungeon',
      priority: 50 + place.levels[0],
      title: `Clear ${place.name.replace(/^The /, '')}`,
      detail: `${place.direction}. ${place.lesson ?? ''}${listing && listing.status !== 'empty' ? ` ${listing.population} inside, chamber ${listing.stage}.` : ''}`,
      reward: `T${place.tier} treasure · keeper XP · permanent shards for a full clear`,
      unlock: 'Repeatable. Rally friends to the entrance with P.',
      current: c.clears?.includes(id) ? 1 : 0,
      total: 1,
      progressLabel: 'Cleared this life',
      level: place.levels[0],
      gearTier: place.tier - 1,
      enemy: undefined,
      depth: undefined,
      dungeon: id,
      target: {
        x: place.x,
        z: place.z,
        name: place.name,
        hint: 'X at the portal · P to rally from the Hearth',
      },
    });
  }

  return goals.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
}

/** The goal the HUD card and compass follow when nothing is pinned. */
export function primaryGoal(profile: Profile, snapshot?: Snapshot): JourneyGoal {
  return journeyGoals(profile, snapshot)[0] ?? chapterGoal(profile, snapshot);
}
/** Kept under its original name: the single goal every existing caller expects. */
export const journeyGoal = primaryGoal;

/** Point at a real living enemy, then fall back to its habitat, never an unrelated nearby boss. */
export function journeyTarget(goal: JourneyGoal, snapshot: Snapshot) {
  const p = snapshot.self;
  if (goal.enemy) {
    const enemies = snapshot.enemies.filter(
      (e) => e.kind === goal.enemy || (goal.enemy === 'cinderling' && e.kind === 'thornling'),
    );
    const enemy = enemies.sort((a, b) => distance(a, p) - distance(b, p))[0];
    if (enemy) return { ...goal.target, x: enemy.x, z: enemy.z };
  }
  return goal.target;
}
