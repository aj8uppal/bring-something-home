import { CLASSES, DUNGEONS, ENEMIES } from '../shared/content';
import { legacyOf, MODIFIERS, type Modifier } from '../shared/endgame';
import { BOSS_RELICS } from '../shared/combat';
import { relicChase } from '../shared/chase';
import type { DungeonId, Profile, Snapshot } from '../shared/types';
import { icon, escapeHtml as esc } from './icons';

export const runDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export function invitationUrl(origin: string, realm: string, dimension?: DungeonId) {
  const url = new URL('/', origin);
  url.searchParams.set('realm', realm);
  if (dimension) url.searchParams.set('expedition', dimension);
  return url.toString();
}
const keepers: Record<DungeonId, string[]> = {
  hollow: ['archivist'],
  crucible: ['forgemother'],
  eclipse: ['tideelder', 'cinderelder', 'nullelder'],
};
export function rallyPanel(profile: Profile | null, snapshot?: Snapshot, invited?: DungeonId) {
  const c = profile?.character,
    safe = !!snapshot?.self.safe;
  const order: DungeonId[] =
    profile?.victories && (c?.level ?? 0) >= 20
      ? ['eclipse', 'hollow', 'crucible']
      : ['hollow', 'crucible', 'eclipse'];
  if (invited) order.sort((a, b) => Number(b === invited) - Number(a === invited));
  return `<p class="panel-intro">Gather at an entrance. Awaken the first altar together. Every traveler earns personal loot.</p>
    ${invited ? `<div class="notice-box">Your invitation leads to <strong>${DUNGEONS[invited].name}</strong>. Choose Join expedition below when you are ready.</div>` : ''}
    ${!safe ? '<div class="notice-box">R recalls you to the Hearth. You can join an expedition from there.</div>' : ''}
    ${profile?.lastExpedition ? '<button class="small-button" data-panel="recap">Review your last expedition</button>' : ''}<div class="rally-grid">${order
      .map((dim) => {
        const def = DUNGEONS[dim],
          listing = snapshot?.expeditions?.find((e) => e.dimension === dim),
          here = snapshot?.self.dimension === dim,
          travelers = listing?.travelers ?? [],
          population = listing?.population ?? travelers.length,
          locked = dim === 'eclipse' && (!profile?.victories || (c?.level ?? 0) < 20),
          depthLocked =
            dim === 'eclipse' &&
            profile &&
            listing &&
            listing.status !== 'empty' &&
            listing.depth > legacyOf(profile).highestDepth + 1,
          cleared = listing?.status === 'cleared',
          underway = listing?.started && !cleared,
          status = cleared
            ? 'Collecting rewards'
            : underway
              ? `In progress · chamber ${listing!.stage}`
              : travelers.length
                ? 'Gathering at the first altar'
                : 'Open for a new expedition';
        return `<article class="rally-card ${invited === dim ? 'invited' : ''}" style="--expedition-color:${def.color}" data-expedition="${dim}">
        <span class="eyebrow">${dim === 'eclipse' ? `ELDER DEPTH ${listing?.status !== 'empty' && listing ? listing.depth : profile ? legacyOf(profile).selectedDepth : 1}` : `RECOMMENDED LEVEL ${def.level}`} · ${population} TRAVELERS</span>
        <h3>${def.name}</h3><p class="rally-status">${icon('portal')} ${status}</p>
        <div class="rally-crew">${
          travelers.length
            ? travelers
                .slice(0, 8)
                .map(
                  (p) =>
                    `<span>${icon(CLASSES[p.classId].icon)}${esc(p.name)} <small>LV${p.level}</small></span>`,
                )
                .join('') +
              (population > 8 ? `<small>+${population - 8} more travelers</small>` : '')
            : underway || cleared
              ? '<small>No travelers are connected inside. The expedition stays open briefly.</small>'
              : '<small>Be the first light. Invite someone to meet you here.</small>'
        }</div>
        <div class="rally-treasure"><span class="section-label">THE WHITE BAG CHASE</span>${keepers[
          dim
        ]
          .map((kind) => {
            const chase = profile && relicChase(profile, kind);
            return `<span><strong>${BOSS_RELICS[kind].name}</strong><small>${chase?.collected ? '✓ Collected · ' : ''}${chase?.untilGuaranteed ?? 6} keeper ${chase?.untilGuaranteed === 1 ? 'victory' : 'victories'} to guaranteed drop</small></span>`;
          })
          .join('')}</div>
        <small class="rally-requirement">${locked ? 'Requires a Sovereign victory and a level 20 traveler.' : depthLocked ? `Clear Elder depth ${listing!.depth - 1} first.` : cleared ? 'A new expedition starts after every traveler recalls.' : underway ? 'Late arrivals get boss loot. The clear bonus requires every chamber.' : 'Wait for your friends before awakening the first altar.'}</small>
        <div class="rally-actions"><button class="primary-button" data-game="rally" data-id="${dim}" ${!c || !safe || here || locked || depthLocked || cleared ? 'disabled' : ''}>${here ? 'You are here' : locked || depthLocked ? 'Locked' : 'Join expedition'} ${icon('arrow')}</button><button class="small-button" data-action="expedition-invite" data-id="${dim}" aria-label="Invite to ${def.name}">${icon('link')} Invite</button></div>
      </article>`;
      })
      .join(
        '',
      )}</div><p class="muted small-print">These are shared public expeditions in this realm. Invitations select the realm and dungeon; entry requirements still apply. All three dungeon entrances remain accessible on foot.</p>`;
}
export function recapPanel(profile: Profile, snapshot?: Snapshot) {
  const result = profile.lastExpedition;
  if (!result) return '<p class="empty-state">Finish an expedition to keep its story here.</p>';
  const full = result.chambers === result.totalChambers,
    dim = result.dimension,
    safe = !!snapshot?.self.safe,
    listing = snapshot?.expeditions?.find((e) => e.dimension === dim),
    waiting = listing?.status === 'cleared';
  return `<div class="recap-hero" style="--expedition-color:${DUNGEONS[dim].color}"><span class="recap-sigil">${icon('crown')}</span><span class="eyebrow">${full ? 'EXPEDITION COMPLETE' : 'KEEPER DEFEATED · JOINED IN PROGRESS'}${result.personalBest ? ' · PERSONAL BEST' : ''}</span><h3>${DUNGEONS[dim].name}</h3><p>${dim === 'eclipse' ? `Depth ${result.depth} · ${MODIFIERS[result.modifier as Modifier]?.name} · ` : ''}${new Date(result.at).toLocaleDateString()} · ${result.crew.length} ${result.crew.length === 1 ? 'traveler' : 'travelers'}</p></div>
    <div class="recap-stats"><span><strong>${runDuration(result.elapsed)}</strong>Expedition time</span><span><strong>${result.chambers}/${result.totalChambers}</strong>Your chambers</span><span><strong>+${result.shards}</strong>Permanent shards</span><span><strong>+${result.gold}</strong>Carried gold</span></div>
    <p class="muted small-print">${full ? 'Shards and gold shown are the clear bonus, in addition to individual kill rewards.' : 'You earned keeper rewards. Complete every chamber in one expedition for the clear bonus.'}</p>
    <div class="recap-crew"><span class="section-label">LIGHTS IN THE STORM</span>${result.crew.map((p) => `<span>${icon(CLASSES[p.classId].icon)}${esc(p.name)}</span>`).join('')}</div>
    <div class="notice-box">${safe ? 'Star shards and discoveries are kept forever. Bank spare equipment before your next run.' : 'Collect your personal floor drops before recalling. Satchel and equipped gear remain at risk until stored in the vault.'}</div>
    <div class="recap-actions"><button class="primary-button" data-game="rally" data-id="${dim}" ${!safe || waiting ? 'disabled' : ''}>${dim === 'eclipse' && full ? `Run depth ${legacyOf(profile).selectedDepth}` : 'Run again'} ${icon('arrow')}</button><button class="small-button" data-panel="rally">Find a group</button><button class="small-button" data-panel="vault">Bank spare gear</button></div>
    ${waiting && safe ? '<p class="muted">Waiting for the previous crew to recall. You can choose another expedition on the rally board.</p>' : ''}
    <div class="recap-share"><button class="small-button" data-action="save-victory">${icon('spark')} Save victory card</button><button class="text-link" data-action="expedition-invite" data-id="${dim}">${icon('link')} Copy run invitation</button></div>`;
}
export function chaseCollection(profile: Profile | null) {
  if (!profile) return '';
  return `<section class="chase-collection"><span class="eyebrow">CHOOSE SOMETHING WORTH CHASING</span><h3>A white bag with your name on it.</h3><p class="muted">Named relics change how your build plays. Track one to guide your compass. Every sixth victory against its keeper guarantees a drop; any earlier victory has a 16% chance. Craft the same item with shards after learning its recipe.</p><div class="chase-grid">${Object.entries(
    BOSS_RELICS,
  )
    .map(([kind, relic]) => {
      const chase = relicChase(profile, kind)!;
      return `<article class="chase-card ${profile.trackedRelic === kind ? 'tracked' : ''}"><small>${ENEMIES[kind].name} · T${ENEMIES[kind].tier} ${relic.slot}</small><strong>${relic.name}</strong><div class="chase-pips" aria-label="${chase.untilGuaranteed} keeper ${chase.untilGuaranteed === 1 ? 'victory' : 'victories'} until guaranteed relic">${Array.from({ length: 6 }, (_, i) => `<i class="${i < 6 - chase.untilGuaranteed ? 'done' : ''}"></i>`).join('')}</div><span>${chase.untilGuaranteed} ${chase.untilGuaranteed === 1 ? 'victory' : 'victories'} to guaranteed white bag</span><small>${chase.collected ? '✓ Collected · ' : ''}${chase.known ? `${chase.shards}/${chase.cost} shards to craft` : 'Defeat keeper to learn recipe'}</small><button class="text-link" data-game="track" data-id="${profile.trackedRelic === kind ? '' : kind}">${profile.trackedRelic === kind ? '✓ Tracking · clear target' : 'Track this relic'} ${icon('compass')}</button></article>`;
    })
    .join('')}</div></section>`;
}
