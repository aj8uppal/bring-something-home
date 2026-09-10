import { ENEMIES, QUESTS, xpForLevel } from '../shared/content';
import {
  CHAPTER_CACHES,
  CHAPTER_UNLOCKS,
  REGIONS,
  WARDENS,
  huntContract,
  journeyGoal,
  journeyGoals,
  type JourneyGoal,
} from '../shared/progression';
import { distance } from '../shared/content';
import { threatOf } from '../shared/places';
import { legacyOf } from '../shared/endgame';
import { compareGear } from '../shared/gear';
import type { Profile, Snapshot } from '../shared/types';
import { escapeHtml as esc, icon } from './icons';

/** Three lines above the hotbar, gone after eight seconds or the first step. No modal. */
export function hearthBanner(profile: Profile, snapshot?: Snapshot) {
  const c = profile.character!,
    fresh = c.kills === 0 && c.level === 1 && c.quest === 0;
  const legacy = legacyOf(profile);
  // Legacy figures appear only once there is a legacy to show.
  const lineage = profile.graves.length > 0 || legacy.highestDepth > 0 || profile.vault.length > 0;
  const legacyLine = lineage
    ? `<small>${profile.vault.length} banked · ${legacy.shards} shards · ${legacy.relics.length}/9 relics · depth ${legacy.highestDepth}/12</small>`
    : '';
  if (fresh)
    return `<strong>Fight together. Die alone. Keep what you bank.</strong><span>Trouble is at the gate. Head north.</span>${legacyLine || '<small><kbd>W A S D</kbd> move · hold <kbd>LMB</kbd> to fire · <kbd>R</kbd> returns home</small>'}`;
  const goal = journeyGoal(profile, snapshot);
  return `<strong>Continue: ${esc(goal.title)}</strong>${legacyLine}`;
}
/** The world's larger shape, kept in the journal's foundations for whoever asks. */
export const CROWN_LORE =
  'Three wardens hold the seals of the Crown of Ash. Break all three and the Ashen Sovereign wakes at the Crown; defeat the Sovereign once and the Elder Convergence opens south of the Hearth.';

const SOURCE_LABELS: Record<string, string> = {
  chapter: 'CHAPTER',
  event: 'HAPPENING NOW',
  seals: 'THE REALM',
  hunt: 'REPEATABLE',
  relic: 'YOUR CHASE',
  dungeon: 'EXPEDITION',
};
/** Every unlocked thing worth doing, as rows. One of them is pinned; the rest are offers. */
export function objectiveBoard(profile: Profile, snapshot?: Snapshot, pinned?: string) {
  const c = profile.character!;
  const goals = journeyGoals(profile, snapshot);
  const here = snapshot?.self;
  const row = (goal: JourneyGoal) => {
    const under = c.level < goal.level;
    const away = here ? Math.round(distance(here, goal.target)) : 0;
    // Read the recommended level directly: a level 12 traveler is not in danger at a LV 10 door.
    const band = threatOf(c.level, { levels: [goal.level, goal.level + 4], kind: 'wild' });
    const isPinned = pinned === goal.id;
    return `<article class="board-row ${isPinned ? 'pinned' : ''} ${under ? 'over-level' : ''}">
      <div class="board-head"><span class="eyebrow">${SOURCE_LABELS[goal.source ?? 'chapter']}</span><span class="board-level ${band}">LV ${goal.level}${under ? ' · above you' : ''}</span></div>
      <h4>${esc(goal.title)}</h4>
      <p>${esc(goal.detail)}</p>
      <div class="board-meta"><span>${goal.progressLabel} ${Math.min(goal.current, goal.total)}/${goal.total}</span>${here ? `<span>${away}m away</span>` : ''}</div>
      <small class="board-reward">${esc(goal.reward)}</small>
      <button class="small-button" data-action="pin-goal" data-id="${goal.id}">${isPinned ? '✓ Pinned · clear' : 'Pin'} ${icon('compass')}</button>
    </article>`;
  };
  return `<section class="objective-board"><div class="board-heading"><span class="eyebrow">EVERYTHING WORTH DOING · ${goals.length}</span><small>Pin one to steer the compass and the minimap.</small></div>${goals
    .map(row)
    .join('')}</section>`;
}

export function regionGuide() {
  return `<div class="region-guide">${REGIONS.map((r) => `<article style="--region-tier:${r.tier}"><span class="region-number">${r.tier}</span><div><strong>${r.name}</strong><small>LV ${r.level}–${r.end} · T${r.tier} creature drops · ${r.direction}</small><p>${r.lesson}</p></div></article>`).join('')}</div>`;
}

export function journeyOverview(profile: Profile, snapshot?: Snapshot) {
  const c = profile.character!,
    goal = journeyGoal(profile, snapshot),
    contract = huntContract(c);
  const safe = snapshot?.self.safe;
  const upgrades = c.inventory.filter((item) => compareGear(c, item).verdict === 'upgrade').length;
  const weaponReady = (c.equipment.weapon?.power ?? 0) >= 3 + goal.gearTier * 3;
  return `<section class="journey-overview" data-goal="${goal.id}"><span class="eyebrow">${goal.chapter < 8 ? `CHAPTER ${goal.chapter + 1} OF 8 · ${esc(goal.chapterName)}` : 'YOUR ENDGAME'}</span><h3>${esc(goal.title)}</h3><p>${esc(goal.detail)}</p>
    <div class="journey-current"><strong>${goal.progressLabel}: ${Math.min(goal.current, goal.total)} / ${goal.total}</strong><span>${esc(goal.target.name)}</span><i><b style="width:${Math.min(100, (goal.current / goal.total) * 100)}%"></b></i></div>
    <div class="journey-payoff"><span><small>YOU EARN</small>${esc(goal.reward)}</span><span><small>THIS OPENS</small>${esc(goal.unlock)}</span></div>
    <div class="journey-readiness" aria-label="Preparation"><span class="${c.level >= goal.level ? 'ready' : ''}">${icon(c.level >= goal.level ? 'check' : 'compass')} LV ${c.level} / ${goal.level} recommended</span><span class="${weaponReady ? 'ready' : ''}">${icon(weaponReady ? 'check' : 'sword')} T${goal.gearTier}+ weapon strength</span><span class="${c.equipment.armor && c.equipment.charm ? 'ready' : ''}">${icon('armor')} ${Object.values(c.equipment).filter(Boolean).length}/3 gear slots filled</span><span>${icon('potion')} ${c.potions} tonics · F to heal</span></div>
    <div class="journal-actions"><button class="primary-button" data-action="follow-journey">Follow this route ${icon('arrow')}</button>${goal.dungeon && safe ? `<button class="small-button" data-action="journey-rally" data-id="${goal.dungeon}">${icon('portal')} Rally to the entrance${goal.depth ? ` · depth ${goal.depth}` : ''}</button>` : ''}${upgrades ? `<button class="small-button" data-panel="inventory">${icon('arrow')} Equip ${upgrades} carried upgrade${upgrades === 1 ? '' : 's'}</button>` : ''}${profile.trackedRelic ? '<button class="small-button" data-game="track" data-id="">Resume chapter guidance</button>' : ''}</div>
    <p class="journey-safety">${safe ? 'Heal and refill tonics here. Bank spare gear before your next run.' : 'The world keeps moving. R returns you to the Hearth instantly.'} Recommendations help you prepare; you can challenge ordinary dungeons earlier.</p></section>
    <div class="seal-strip" aria-label="Realm seals">${WARDENS.map((w) => `<span class="${snapshot?.realm.seals?.includes(w.kind) ? 'broken' : ''}">${icon(snapshot?.realm.seals?.includes(w.kind) ? 'check' : 'crown')}<strong>${ENEMIES[w.kind].name.replace(/^The /, '')}<small>${snapshot?.realm.seals?.includes(w.kind) ? 'Seal broken by this realm' : `${w.region} · LV ${w.level}+`}</small></strong></span>`).join('')}</div>
    <div class="journey-contract"><span class="eyebrow">ALWAYS SOMETHING TO GAIN · HUNT ${contract.round}</span><p>${contract.kills}/${contract.target} tier ${contract.tier}+ creatures · ${contract.region.name} or harder areas</p><strong>Guaranteed T${contract.rewardTier} Astral ${contract.slot} · ${contract.xp} XP · ${contract.gold} gold · 1 tonic</strong><small>${c.level < 20 ? `${Math.max(0, xpForLevel(c.level) - c.xp)} XP to level ${c.level + 1}. ` : ''}No need to return to a quest giver. The reward bag drops when you finish.</small></div>
    <details class="journey-foundations" ${c.quest < 4 ? 'open' : ''}><summary>The full journey, area difficulty, and what survives death</summary><p class="foundation-lore">${CROWN_LORE}</p><h3 class="minor-heading">THE ROAD FROM YOUR FIRST HUNT TO THE ELDERS</h3><div class="chapter-road">${QUESTS.map((q, i) => `<details class="chapter-step ${i < c.quest ? 'complete' : i === c.quest ? 'current' : ''}" ${i === c.quest ? 'open' : ''}><summary><b>${i < c.quest ? '✓' : i + 1}</b><span>${q.name}<small>${i < c.quest ? 'Completed this life' : i === c.quest ? 'Current chapter' : q.text}</small></span>${icon('chevron')}</summary><p>${q.hint}</p><small>Reward: ${i === 0 ? 'Armor and a charm' : CHAPTER_CACHES[i].label} · ${q.gold} gold · ${q.xp} XP${i >= 2 ? ' · 5 embers' : ''}</small><small>Next: ${CHAPTER_UNLOCKS[i]}</small></details>`).join('')}</div>
    <h3 class="minor-heading">VENTURE FARTHER · STRONGER CREATURES, BETTER DROPS</h3>${regionGuide()}
    <div class="legacy-explainer"><strong>Every run can leave something behind.</strong><p>Your vault, embers, star shards, unlocked Elder depths, relic collection, and best times survive death. Your current level, equipped gear, satchel, and gold belong to this life. Bank spares with X at the Memory Vault, then use them to start a new class.</p><button class="small-button" data-panel="vault">${icon('chest')} Memory vault</button></div></details>`;
}
