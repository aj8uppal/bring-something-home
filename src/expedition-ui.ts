import { journeyOverview, objectiveBoard } from './progression-ui';
import { DUNGEONS } from '../shared/content';
import { BOSS_RELICS } from '../shared/combat';
import { EXPEDITIONS, MAX_DEPTH, depthScaling, legacyOf, masteryTitle } from '../shared/endgame';
import type { Profile, Snapshot } from '../shared/types';
import { icon } from './icons';
import { chaseCollection } from './rally-ui';
const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export function journalPanel(profile: Profile | null, snapshot?: Snapshot, pinned?: string) {
  const c = profile?.character,
    legacy = profile ? legacyOf(profile) : null;
  const unlocked = !!profile?.victories,
    safe = snapshot?.self.safe ?? false;
  return `${profile?.character ? objectiveBoard(profile, snapshot, pinned) + journeyOverview(profile, snapshot) : '<p class="panel-intro">Enter the realm to begin your journey.</p>'}<h3 class="minor-heading">DUNGEON EXPEDITIONS</h3>
    <div class="journal-actions"><button class="small-button" data-panel="rally">${icon('portal')} Rally with friends <kbd>P</kbd></button>${profile?.lastExpedition ? '<button class="small-button" data-panel="recap">Last expedition</button>' : ''}</div><div class="expedition-grid">${(
      ['hollow', 'crucible', 'eclipse'] as const
    )
      .map((id) => [id, DUNGEONS[id]] as const)
      .map(
        ([id, dungeon]) =>
          `<article class="expedition-card" style="--expedition-color:${dungeon.color}"><span class="eyebrow">${id === 'eclipse' ? 'ELDER EXPEDITION' : 'SHARED DUNGEON'} · LV ${dungeon.level}</span><h3>${dungeon.name}</h3><p>${dungeon.description}</p><small>${EXPEDITIONS[id as keyof typeof EXPEDITIONS].length} encounters · ${id === 'eclipse' ? '3 elder bosses · T6 treasure' : id === 'hollow' ? '2 chambers + Archivist · T3 treasure' : '2 chambers + Forgemother · T4 treasure'}</small><small>${id === 'eclipse' ? (unlocked ? '✓ Portal awakened · Level 20 required to enter' : 'Locked · Defeat the Ashen Sovereign once') : `${id === 'hollow' ? 'West' : 'East'} of the Hearth · X at the portal`}</small></article>`,
      )
      .join('')}</div>
    <section class="elder-progression"><div class="elder-heading"><div><span class="eyebrow">A LEGACY THAT SURVIVES DEATH</span><h3>${masteryTitle(legacy?.highestDepth ?? 0)}</h3></div>${icon('crown')}</div><div class="legacy-stats"><span><strong>${legacy?.highestDepth ?? 0}<small> / ${MAX_DEPTH}</small></strong>Deepest clear</span><span><strong>${legacy?.clears ?? 0}</strong>Convergences</span><span><strong>${legacy?.shards ?? 0}</strong>Star shards</span><span><strong>${legacy?.relics.length ?? 0}<small> / ${Object.keys(BOSS_RELICS).length}</small></strong>Relics collected</span></div>
    <p>Each Elder clear unlocks the next depth. Three rotating modifiers change the storm. Star shards and your relic collection persist across lives; forge a specific relic after defeating its keeper.</p>
    <span class="section-label">CHOOSE YOUR NEXT ELDER DEPTH · ${legacy?.selectedDepth ?? 1} ATTUNED</span><div class="depth-grid">${Array.from(
      { length: MAX_DEPTH },
      (_, i) => {
        const depth = i + 1,
          open = unlocked && depth <= (legacy?.highestDepth ?? 0) + 1;
        const scaling = depthScaling(depth),
          time = legacy?.bestTimes[String(depth)];
        return `<button data-game="attune" data-id="${depth}" class="${depth === (legacy?.selectedDepth ?? 1) ? 'selected' : ''} ${time ? 'complete' : ''}" ${!open || !safe ? 'disabled' : ''} title="Depth ${depth}: +${Math.round((scaling.hp - 1) * 100)}% enemy health, +${Math.round((scaling.damage - 1) * 100)}% damage, plus expedition modifier"><strong>${depth}</strong><span>${time ? duration(time) : open ? 'Open' : 'Locked'}</span></button>`;
      },
    ).join(
      '',
    )}</div><small class="muted">Attune at the Hearth. Your selection applies when a new shared expedition starts. Every chamber must be completed for clear credit. After depth 12, replay for faster times, other modifiers, and the complete relic collection.</small>
    <button class="small-button" data-panel="forge">${icon('anvil')} Open relic workshop</button></section>
    ${chaseCollection(profile)}`;
}
