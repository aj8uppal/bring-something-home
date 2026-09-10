import { CLASSES } from '../shared/content';
import { LIBERATION_QUOTA } from '../shared/biomes';
import { PLACE_BY_ID, placeById } from '../shared/places';
import { templateName } from '../shared/templates';
import { templateOf } from '../shared/instances';
import type { Profile, RosterEntry, Snapshot } from '../shared/types';
import { icon, escapeHtml as esc } from './icons';

/**
 * The realm board at the Hearth: what this realm is doing right now.
 *
 * How far each place has been taken back, which doors are standing open and for how much
 * longer, what event is burning, who is out there, and which of them you keep track of.
 * A traveler who has just arrived should be able to decide where to go from this one panel.
 */
export function boardPanel(
  profile: Profile | null,
  snapshot: Snapshot | undefined,
  roster: RosterEntry[],
  selected: string,
) {
  const liberation = [...(snapshot?.liberation ?? [])].sort((a, b) => b.kills - a.kills);
  const portals = snapshot?.portals ?? [];
  const event = snapshot?.event;
  const friends = new Set(profile?.friends ?? []);
  const party = roster.find((r) => r.id === profile?.id)?.party;
  const ending = snapshot?.realm.ending;
  const season = snapshot?.realm.season;
  return `<p class="panel-intro">Everything this realm is doing, in one place. Liberation is shared: every creature anyone puts down counts.</p>
  ${
    ending !== undefined
      ? `<div class="notice-box ending">${icon('crown')} The third seal is broken. The Crown opens in <strong>${ending}s</strong>. <button class="small-button" data-game="travel" data-id="crown">Travel to the Crown</button></div>`
      : ''
  }
  ${season ? `<div class="notice-box">${icon('spark')} <strong>Season ${season.number}</strong> · ${esc(season.name)} — ${esc(season.description)}</div>` : ''}
  <h3 class="minor-heading">TAKING THE WORLD BACK</h3>
  <div class="liberation-list">${liberation
    .map((state) => {
      const place = PLACE_BY_ID.get(state.place);
      const share = Math.min(1, state.kills / (state.quota || LIBERATION_QUOTA));
      const stageLabel =
        state.stage >= 3
          ? 'Liberated · the fog has lifted'
          : state.stage === 2
            ? 'A second keeper is out'
            : state.stage === 1
              ? 'Its ruins stay awake'
              : 'Held against you';
      return `<article class="liberation ${state.stage >= 3 ? 'freed' : ''}" style="--place-color:${place?.color ?? '#98aa76'}"><div class="liberation-head"><strong>${esc(place?.name ?? state.place)}</strong><span>${Math.round(share * 100)}%</span></div><i><b style="width:${share * 100}%"></b></i><small>${stageLabel} · ${state.kills} / ${state.quota}${place ? ` · LV ${place.levels[0]}–${place.levels[1]}` : ''}</small></article>`;
    })
    .join('')}</div>
  <h3 class="minor-heading">DOORS STANDING OPEN</h3>
  ${
    portals.length
      ? `<div class="board-portals">${portals
          .map(
            (portal) =>
              `<article class="board-portal" style="--expedition-color:${portal.color}"><div><strong>${esc(portal.name)}</strong><small>${esc(placeById(portal.place)?.name ?? portal.place)} · dropped by ${esc(portal.openedBy)}</small></div><span class="portal-timer">${portal.remaining}s</span><button class="small-button" data-game="rally" data-id="${esc(portal.instance)}" ${snapshot?.self.safe ? '' : 'disabled'}>Join</button></article>`,
          )
          .join('')}</div>`
      : '<p class="muted">No doors are open. Hunt a family long enough and one of them drops its own.</p>'
  }
  <h3 class="minor-heading">LIVE NOW</h3>
  ${
    event?.active
      ? `<div class="notice-box">${icon('spark')} <strong>${esc(event.name ?? 'A realm event')}</strong> in ${esc(placeById(event.place)?.name ?? 'the wilds')} · ${event.kills}/${event.target} · ${Math.ceil(event.remaining)}s</div>`
      : '<p class="muted">Nothing is burning at the moment. Something will be.</p>'
  }
  ${
    (snapshot?.setpieces ?? []).some((s) => s.status === 'active')
      ? `<div class="board-setpieces">${(snapshot?.setpieces ?? [])
          .filter((s) => s.status === 'active')
          .map(
            (s) => `<span style="--place-color:${s.color}">${esc(s.name)} · ${esc(s.title)}</span>`,
          )
          .join('')}</div>`
      : ''
  }
  <h3 class="minor-heading">WHO IS WHERE</h3>
  <div class="board-roster">${
    roster.length
      ? roster
          .map((r) => {
            const where =
              r.dimension === 'wilds'
                ? (placeById(placeAtId(r)) ?? { name: 'the wilds' }).name
                : templateName(templateOf(r.dimension));
            const mine = r.id === profile?.id;
            return `<article class="board-traveler ${selected === r.id ? 'selected' : ''} ${party && r.party === party ? 'partied' : ''}"><span style="color:${CLASSES[r.classId].color}">${icon(CLASSES[r.classId].icon)}</span><div><strong>${esc(r.name)}${r.title ? ` <small>${esc(r.title)}</small>` : ''}</strong><small>LV ${r.level} · ${esc(where)}${r.party ? ' · in a party' : ''}</small></div>${
              mine
                ? '<span class="muted">You</span>'
                : `<button class="text-link" data-game="friend" data-id="${r.id}">${friends.has(r.id) ? '★' : '☆'}</button><button class="small-button" data-game="party" data-id="${party && r.party === party ? '' : r.id}">${party && r.party === party ? 'Leave' : 'Walk with'}</button><button class="small-button" data-game="travel" data-id="${r.id}" ${snapshot?.self.safe && r.dimension === 'wilds' ? '' : 'disabled'}>Travel</button>`
            }</article>`;
          })
          .join('')
      : '<p class="muted">Nobody else is in this realm right now.</p>'
  }</div>
  <div class="board-actions"><button class="small-button" data-panel="realms">${icon('compass')} Find another realm</button><button class="small-button" data-panel="rally">${icon('portal')} The door board</button><button class="small-button" data-panel="atlas">${icon('map')} Open the atlas</button></div>
  <p class="muted small-print">Walking with someone shares every kill you both make in the same dimension, at any distance. A star keeps them on your list between sessions.</p>`;
}
/** The place a roster entry is standing in, without importing the world into this file. */
function placeAtId(r: RosterEntry) {
  let best = 'meadow',
    gap = Infinity;
  for (const place of PLACE_BY_ID.values()) {
    if (place.kind !== 'wild' && place.kind !== 'sanctuary') continue;
    const d = Math.hypot(r.x - place.x, r.z - place.z);
    if (d < place.radius && d < gap) {
      gap = d;
      best = place.id;
    }
  }
  return best;
}
