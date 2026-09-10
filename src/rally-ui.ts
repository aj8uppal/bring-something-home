import { CLASSES, DUNGEONS, ENEMIES } from '../shared/content';
import { depthCap, legacyOf, MODIFIERS, type Modifier } from '../shared/endgame';
import { TEMPLATE_BY_ID } from '../shared/templates';
import { BOSS_RELICS } from '../shared/combat';
import { relicChase } from '../shared/chase';
import type { DungeonId, Profile, Snapshot } from '../shared/types';
import { icon, escapeHtml as esc } from './icons';
import { templateOf } from '../shared/instances';
import { placeById } from '../shared/places';

export const runDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export function invitationUrl(origin: string, realm: string, dimension?: DungeonId) {
  const url = new URL('/', origin);
  url.searchParams.set('realm', realm);
  if (dimension) url.searchParams.set('expedition', dimension);
  return url.toString();
}
/** The keepers whose white bags a template is worth running for. */
const keepersOf = (template: string) =>
  template === 'eclipse'
    ? ['tideelder', 'cinderelder', 'nullelder']
    : [TEMPLATE_BY_ID.get(template)?.keeper ?? ''].filter((k) => k && BOSS_RELICS[k]);

/**
 * The door board: everything actually open in this realm right now, joinable first.
 *
 * The three story dungeons are always here. Everything else on this board is a door
 * something dropped, with the time left on it and whoever is already inside.
 */
export function rallyPanel(profile: Profile | null, snapshot?: Snapshot, invited?: DungeonId) {
  const c = profile?.character,
    safe = !!snapshot?.self.safe;
  const legacy = profile ? legacyOf(profile) : undefined;
  const listings = [...(snapshot?.expeditions ?? [])];
  if (!listings.length)
    for (const template of ['hollow', 'crucible', 'eclipse'])
      listings.push({
        dimension: template,
        template,
        name: TEMPLATE_BY_ID.get(template)?.name ?? template,
        status: 'empty',
        depth: 1,
        stage: 1,
        started: false,
        population: 0,
        travelers: [],
        permanent: true,
      });
  const joinable = (l: (typeof listings)[number]) =>
    Number(l.population > 0) * 4 +
    Number(!!l.portal) * 3 +
    Number(l.status !== 'empty' && l.status !== 'cleared') * 2 +
    Number(!!l.permanent);
  listings.sort(
    (a, b) =>
      Number(b.instance === invited || b.template === invited) -
        Number(a.instance === invited || a.template === invited) ||
      joinable(b) - joinable(a) ||
      (a.portal ?? 9999) - (b.portal ?? 9999),
  );
  const invitedName = invited
    ? (listings.find((l) => l.instance === invited || l.template === invited)?.name ??
      TEMPLATE_BY_ID.get(templateOf(invited))?.name)
    : undefined;
  return `<p class="panel-intro">Every door open in this realm. Dropped doors close on their own; whoever is inside stays inside.</p>
    ${invitedName ? `<div class="notice-box">Your invitation leads to <strong>${esc(invitedName)}</strong>. Choose Join expedition below when you are ready.</div>` : ''}
    ${!safe ? '<div class="notice-box">R recalls you to the Hearth. You can join an expedition from there.</div>' : ''}
    ${profile?.lastExpedition ? '<button class="small-button" data-panel="recap">Review your last expedition</button>' : ''}<div class="rally-grid">${listings
      .map((listing) => {
        const template = listing.template ?? listing.dimension;
        const rows = TEMPLATE_BY_ID.get(template);
        const target = listing.instance ?? template;
        const here = snapshot?.self.dimension === listing.instance;
        const travelers = listing.travelers ?? [],
          population = listing.population ?? travelers.length,
          locked = template === 'eclipse' && (!profile?.victories || (c?.level ?? 0) < 20),
          best =
            template === 'eclipse'
              ? Math.max(legacy?.highestDepth ?? 0, legacy?.bestDepths?.eclipse ?? 0)
              : (legacy?.bestDepths?.[template] ?? 0),
          depthLocked = listing.status !== 'empty' && listing.depth > best + 1,
          cleared = listing.status === 'cleared',
          underway = listing.started && !cleared,
          chosen = Math.min(
            depthCap(template),
            best + 1,
            template === 'eclipse'
              ? Math.max(1, legacy?.selectedDepth ?? 1)
              : Math.max(1, legacy?.selectedDepths?.[template] ?? 1),
          ),
          depth = listing.status !== 'empty' ? listing.depth : chosen,
          modifier = MODIFIERS[listing.modifier as Modifier],
          status = cleared
            ? 'Collecting rewards'
            : underway
              ? `In progress · chamber ${listing.stage}/${listing.stages ?? '?'}`
              : travelers.length
                ? 'Gathering at the first altar'
                : listing.portal
                  ? 'A door in the world, standing open'
                  : 'Open for a new expedition';
        return `<article class="rally-card ${invited && (listing.instance === invited || template === invited) ? 'invited' : ''}" style="--expedition-color:${rows?.color ?? '#8fd8d2'}" data-expedition="${esc(template)}" data-instance="${esc(target)}">
        <span class="eyebrow">${listing.portal !== undefined ? `DOOR CLOSES IN ${listing.portal}s` : `RECOMMENDED LEVEL ${rows?.level ?? 5}`} · DEPTH ${depth}${modifier && depth > 1 ? ` · ${modifier.name.toUpperCase()}` : ''} · ${population} TRAVELERS</span>
        <h3>${esc(listing.name ?? template)}</h3><p class="rally-status">${icon('portal')} ${status}${listing.place ? ` · ${esc(placeById(listing.place)?.name ?? listing.place)}` : ''}</p>
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
        <div class="rally-treasure"><span class="section-label">THE WHITE BAG CHASE</span>${keepersOf(
          template,
        )
          .map((kind) => {
            const chase = profile && relicChase(profile, kind);
            return `<span><strong>${BOSS_RELICS[kind].name}</strong><small>${chase?.collected ? '✓ Collected · ' : ''}${chase?.untilGuaranteed ?? 6} keeper ${chase?.untilGuaranteed === 1 ? 'victory' : 'victories'} to guaranteed drop</small></span>`;
          })
          .join('')}</div>
        ${
          listing.status === 'empty' && !locked && depthCap(template) > 1
            ? `<div class="depth-dial"><span class="section-label">DEPTH · CLEARED ${best}</span>${Array.from(
                { length: depthCap(template) },
                (_, i) =>
                  `<button class="depth-pip ${i + 1 === chosen ? 'chosen' : ''}" data-game="attune" data-id="${template}:${i + 1}" ${i + 1 > best + 1 ? 'disabled' : ''} title="Depth ${i + 1}${i + 1 > best + 1 ? ' · clear the one before it' : ''}">${i + 1}</button>`,
              ).join('')}</div>`
            : ''
        }
        <small class="rally-requirement">${locked ? 'Requires a Sovereign victory and a level 20 traveler.' : depthLocked ? `Clear depth ${listing.depth - 1} of this door first.` : cleared ? 'A new expedition starts after every traveler recalls.' : underway ? 'Late arrivals get boss loot. The clear bonus requires every chamber.' : 'Wait for your friends before awakening the first altar.'}</small>
        <div class="rally-actions"><button class="primary-button" data-game="rally" data-id="${esc(target)}" ${!c || !safe || here || locked || depthLocked || cleared ? 'disabled' : ''}>${here ? 'You are here' : locked || depthLocked ? 'Locked' : 'Join expedition'} ${icon('arrow')}</button><button class="small-button" data-action="expedition-invite" data-id="${esc(target)}" aria-label="Invite to ${esc(listing.name ?? template)}">${icon('link')} Invite</button></div>
      </article>`;
      })
      .join(
        '',
      )}</div><p class="muted small-print">These are shared public expeditions in this realm. An invitation names the realm and the instance; if that instance has expired it opens a fresh one of the same kind. Entry requirements still apply.</p>`;
}
export function recapPanel(profile: Profile, snapshot?: Snapshot) {
  const result = profile.lastExpedition;
  if (!result) return '<p class="empty-state">Finish an expedition to keep its story here.</p>';
  const full = result.chambers === result.totalChambers,
    dim = result.dimension,
    safe = !!snapshot?.self.safe,
    listing = snapshot?.expeditions?.find((e) => e.dimension === dim),
    waiting = listing?.status === 'cleared';
  const rows = TEMPLATE_BY_ID.get(dim);
  return `<div class="recap-hero" style="--expedition-color:${rows?.color ?? '#8fd8d2'}"><span class="recap-sigil">${icon('crown')}</span><span class="eyebrow">${full ? 'EXPEDITION COMPLETE' : 'KEEPER DEFEATED · JOINED IN PROGRESS'}${result.personalBest ? ' · PERSONAL BEST' : ''}</span><h3>${esc(rows?.name ?? dim)}</h3><p>${result.depth > 1 ? `Depth ${result.depth} · ${MODIFIERS[result.modifier as Modifier]?.name} · ` : ''}${new Date(result.at).toLocaleDateString()} · ${result.crew.length} ${result.crew.length === 1 ? 'traveler' : 'travelers'}</p></div>
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
