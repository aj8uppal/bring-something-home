import { regionGuide } from './progression-ui';
import { templateOf } from '../shared/instances';
import { templateName } from '../shared/templates';
export { inventoryPanel, pickupNotice, comparisonTable } from './equipment-ui';
export { journalPanel } from './expedition-ui';
export { rallyPanel, recapPanel } from './rally-ui';
export { boardPanel } from './board-ui';
import { bagLegend } from './loot-ui';
import { CAMERA } from './game/camera';
import { legacyOf } from '../shared/endgame';
import { TRAITS, BOSS_RELICS } from '../shared/combat';
import {
  CLASSES,
  DUNGEONS,
  ENEMIES,
  QUESTS,
  RARITIES,
  SHOP,
  ZONES,
  xpForLevel,
} from '../shared/content';
import type {
  ClassId,
  Grave,
  Item,
  Profile,
  RealmInfo,
  RosterEntry,
  Snapshot,
  PlayerState,
} from '../shared/types';
import { isSafe, zoneAt } from '../shared/content';
import { escapeHtml as esc, icon } from './icons';
import { settings } from './storage';
import { fullscreenButton } from './fullscreen';
export function shell() {
  return `
  <canvas id="world" aria-label="Bring Something Home 3D game world"></canvas>
  <div class="world-vignette"></div><div id="world-labels" aria-hidden="true"></div><div id="damage-flash"></div>
  <main id="title-screen" class="title-screen">
    <header class="title-nav"><a class="brand" href="/" aria-label="Bring Something Home home">${icon('home')}<span>BRING SOMETHING HOME<small>COOPERATIVE EXPEDITIONS</small></span></a><nav><button data-panel="guide">Field guide</button><button data-panel="leaderboard">Hall of echoes</button><span class="nav-divider"></span>${fullscreenButton()}<button class="icon-button" data-action="sound" aria-label="Toggle sound">${icon('volume')}</button><button class="icon-button" data-panel="settings" aria-label="Settings">${icon('settings')}</button></nav></header>
    <div class="title-content"><div class="eyebrow"><span class="live-dot"></span><span id="title-status">A SHARED WORLD. A SINGLE LIFE.</span></div><h1>Bring Something<br><em>Home</em></h1><p class="title-lede">Every life is temporary.<br>What you bring home can outlast it.</p><p class="title-vow">Fight together. Die alone. Keep what you bank.</p>
      <div id="invite-banner" class="invite-banner hidden"></div><form id="enter-form"><div class="section-label"><span>CHOOSE YOUR CALLING</span><span>01 — 03</span></div><div id="class-cards" class="class-cards"></div><p id="class-description" class="class-description"></p>
        <div class="enter-row"><label class="name-field"><span>TRAVELER NAME</span><input id="traveler-name" name="name" maxlength="18" minlength="2" placeholder="What will they call you?" autocomplete="nickname" required aria-label="Traveler name" /></label><button class="enter-button" type="submit" id="enter-button"><span>Enter the wilds</span>${icon('arrow')}</button></div>
        <div id="entry-error" class="inline-error" role="alert"></div><p class="play-note">Personal loot <span>·</span> Shared expeditions <span>·</span> Lasting legacy</p>
      </form>
      <button class="text-link recovery-link" data-panel="recover">Already have a flame? Restore your traveler ${icon('chevron')}</button>
    </div>
    <div class="scene-caption"><span class="caption-line"></span><div><span class="eyebrow">YOUR JOURNEY BEGINS HERE</span><h2>The Last Hearth</h2><p>Some things are worth keeping alive.</p></div></div>
    <footer class="title-footer"><span>${icon('compass')} WASD to move <i>·</i> Mouse to aim <i>·</i> Courage to continue</span><button data-panel="realms"><span class="live-dot"></span><span id="realm-status">Connecting to the Hearth</span>${icon('chevron')}</button><span class="version">BRING SOMETHING HOME / 1.4</span></footer>
  </main>
  <main id="hud" class="hud hidden" aria-label="Game interface">
    <section class="objective-stack" aria-label="Current objectives"><button id="quest-tracker" class="quest-tracker" data-panel="journal"><span class="eyebrow" id="quest-chapter">YOUR NEXT STEP</span><strong id="quest-name"></strong><span id="quest-text"></span><div class="quest-progress"><i id="quest-fill"></i></div><small id="quest-reward"></small></button><div class="hunt-card hidden"><span id="hunt-title">HUNT 1 · TIER 1+</span><strong id="hunt-progress">0 / 8</strong><i><b id="hunt-fill"></b></i><small id="hunt-reward">Astral gear · Gold · Tonic</small></div><div id="dungeon-progress" class="dungeon-progress hidden"></div><div id="event-banner" class="event-banner hidden"></div><div id="setpiece-banner" class="event-banner hidden"></div><div id="muster-banner" class="event-banner muster hidden"></div></section>




    <div id="chain-meter" class="chain-meter hidden"><strong id="chain-count"></strong><span id="chain-bonus"></span><i><b id="chain-fill"></b></i></div>

    <div class="combat-guidance"><div id="hearth-banner" class="hearth-banner hidden" role="status" aria-live="polite"></div><div id="loot-card" class="pickup-toast hidden"></div><div id="interaction" class="interaction hidden"></div><div id="journey-compass" class="journey-compass"><span id="objective-arrow">↑</span><div><strong id="objective-name">Trouble at the gate</strong><small id="objective-hint">Head north</small></div><span id="objective-distance"></span></div></div><aside class="inventory-rail" aria-label="Equipment and nearby loot"><section class="map-panel"><div class="map-heading"><span id="zone-name">The Last Hearth</span><div class="map-tools">${fullscreenButton()}<button class="icon-button" data-panel="board" aria-label="Open the realm board" title="The realm board · K">${icon('crown')}</button><button class="icon-button" data-panel="atlas" aria-label="Open realm map">${icon('map')}</button></div></div><div id="zone-threat" class="zone-threat">Sanctuary · heal and bank gear</div><div class="minimap-frame"><button class="minimap-button" data-panel="atlas" aria-label="Open realm map"><canvas id="minimap" width="360" height="280"></canvas><span class="map-coordinate" id="coordinates"></span></button><button class="minimap-zoom" data-action="minimap-zoom" title="Minimap range · N" aria-label="Change minimap range"><span id="minimap-zoom">${settings.minimapSpan}m</span><kbd>N</kbd></button></div><button class="realm-population" data-panel="realms"><span class="live-dot"></span><span id="population"></span><span id="ping">— ms</span></button></section><nav class="side-tools" aria-label="Game menus"><button data-panel="inventory" title="Satchel · B" aria-label="Open satchel">${icon('bag')}<kbd>B</kbd></button><button data-panel="journal" title="Journey · J" aria-label="Open journey">${icon('book')}<kbd>J</kbd></button><button data-panel="codex" title="Bestiary · C" aria-label="Open bestiary">${icon('eye')}<kbd>C</kbd></button><button data-panel="settings" title="Settings · Esc" aria-label="Open settings">${icon('settings')}<kbd>ESC</kbd></button></nav><div class="camera-tools" aria-label="Camera controls"><button data-action="rotate-left" title="Rotate counterclockwise · Q" aria-label="Rotate camera left">↶</button><button data-action="camera-reset" title="Reset camera" aria-label="Reset camera"><span id="camera-north">N</span></button><button data-action="rotate-right" title="Rotate clockwise · E" aria-label="Rotate camera right">↷</button><span></span><button data-action="zoom-in" title="Zoom in · Scroll up" aria-label="Zoom in">+</button><button data-action="zoom-out" title="Zoom out · Scroll down" aria-label="Zoom out">−</button><label class="camera-tilt"><span>TILT</span><input id="camera-tilt" type="range" min="${CAMERA.minPitch}" max="${CAMERA.maxPitch}" step="1" value="${settings.cameraTilt}" data-setting="cameraTilt" aria-label="Camera tilt" title="Tilt camera · Page Up / Page Down · Middle mouse drag" /><output id="tilt-value">${Math.round(settings.cameraTilt)}°</output></label></div><div class="currencies"><span title="Gold is carried by this traveler">${icon('coin')}<b id="gold">0</b></span><span title="Embers persist through death">${icon('flame')}<b id="embers">0</b></span><span id="safe-state">${icon('shield')} Sanctuary</span></div><div id="hud-stats"></div><div id="hud-kit"></div><div id="ground-loot" class="ground-loot hidden" aria-label="Nearby loot bag"></div></aside>
    <div id="boss-panel" class="boss-panel hidden"><span class="eyebrow" id="boss-phase"></span><strong id="boss-name"></strong><div class="boss-track"><i id="boss-fill"></i></div><span id="boss-hp"></span></div>


    <div id="zone-announcement" class="zone-announcement"><span>THE LAST HEARTH</span><p>A little light, held against the dark.</p></div>




    <section class="chat-panel"><div id="chat-lines" class="chat-lines" aria-live="polite"></div><form id="chat-form"><span>${icon('chat')}</span><input id="chat-input" placeholder="Enter to speak to the realm…" maxlength="200" autocomplete="off" aria-label="Realm chat" /><button type="submit" aria-label="Send message">${icon('arrow')}</button></form></section>
    <div class="bottom-center"><section class="player-panel" id="player-panel"><div class="portrait" id="portrait"></div><div class="player-vitals"><div class="name-line"><strong id="player-name"></strong><span id="player-level"></span></div><div class="bar health"><div id="health-fill"></div><span id="health-label"></span>${icon('heart')}</div><div class="bar mana"><div id="mana-fill"></div><span id="mana-label"></span>${icon('spark')}</div><div class="xp-track" id="xp-track"><div id="xp-fill"></div></div><span id="xp-label" class="xp-label"></span></div></section><div id="onboarding" class="onboarding"></div><div class="hotbar"><button class="skill weapon" data-action="autofire" title="Hold mouse to fire · I toggles autofire"><kbd>LMB</kbd><span id="weapon-icon"></span><small id="attack-label">Attack</small></button><span class="hotbar-divider"></span><button class="skill" data-game="ability" title="Class ability · Space"><kbd>SPACE</kbd><span id="ability-icon"></span><small id="ability-label">Astral nova</small><b id="ability-cooldown" class="cooldown"></b></button><button class="skill" data-game="dash" title="Invulnerable dodge · Shift"><kbd>SHIFT</kbd>${icon('dash')}<small>Dodge</small><b id="dash-cooldown" class="cooldown"></b></button><span class="hotbar-divider"></span><button class="skill" data-game="potion" title="Restore 45% health · F"><kbd>F</kbd>${icon('potion')}<small>Tonic <span id="potions">3</span></small><b id="potion-cooldown" class="cooldown"></b></button><button class="skill recall" data-game="recall" title="Instantly return to the safe Hearth · R"><kbd>R</kbd>${icon('home')}<small>Recall</small></button></div><span class="controls-hint">WASD move <i>·</i> Hold mouse to fire <i>·</i> X interact <i>·</i> Q / E rotate <i>·</i> I autofire <i>·</i> P rally</span></div>
    <div class="hearth-mark">${icon('home')}<span>BRING SOMETHING HOME<small id="hud-realm"></small></span></div>
    <div id="touch-controls"><div id="move-stick" class="joystick" aria-label="Move joystick"><i></i></div><div id="aim-stick" class="joystick" aria-label="Aim and fire joystick"><i></i></div><button data-game="interact" aria-label="Interact">X</button></div>
  </main>
  <div id="connection-banner" class="connection-banner hidden" role="status"></div>
  <div id="toasts" class="toasts" role="status" aria-live="polite"></div>
  <div id="item-tooltip" class="item-tooltip hidden" role="dialog" aria-label="Item details"></div><div id="modal-root"></div>
`;
}
export function classCards(selected: ClassId, locked = false) {
  return Object.entries(CLASSES)
    .map(
      ([id, cls]) =>
        `<button type="button" class="class-card ${selected === id ? 'selected' : ''}" data-class="${id}" aria-pressed="${selected === id}" ${locked ? 'disabled' : ''} style="--class-color:${cls.color}"><span class="class-glyph">${icon(cls.icon)}</span><span>${cls.name}</span><small>${id === 'arcanist' ? 'Arcane storm' : id === 'ranger' ? 'True aim' : 'Iron resolve'}</small>${selected === id ? `<i>${icon('check')}</i>` : ''}</button>`,
    )
    .join('');
}
export type Panel =
  | 'copy'
  | 'rally'
  | 'recap'
  | 'inventory'
  | 'vault'
  | 'forge'
  | 'board'
  | 'atlas'
  | 'journal'
  | 'codex'
  | 'guide'
  | 'settings'
  | 'recover'
  | 'leaderboard'
  | 'realms'
  | 'death'
  | 'report'
  | 'delete';
export function modalFrame(title: string, eyebrow: string, content: string, wide = false) {
  return `<div class="modal-backdrop"><section class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1"><header class="modal-header"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2></div><button class="icon-button close-button" data-action="close" aria-label="Close dialog">${icon('close')}</button></header><div class="modal-body">${content}</div></section></div>`;
}
export function guidePanel() {
  return `<div class="guide-lede">The fire took the world.<br><em>It didn’t take everything.</em></div><p class="panel-intro">Hunt for gear and levels, defeat three realm wardens to open the Crown, then defeat the Ashen Sovereign to unlock the Elder Convergence. Your journal gives you a route from your first hunt through twelve Elder depths.</p><div class="guide-cards"><article>${icon('compass')}<h3>Follow the light</h3><p>Trouble waits just north of the Hearth. Fight creatures, earn levels, equip better gear, and follow your journey in the journal. Signposts at each road fork show the level ahead, and the minimap keeps a chevron on your objective wherever you are.</p></article><article>${icon('dash')}<h3>Read the storm</h3><p>Enemy shots glow warm. Yours glow with your class. Slip through gaps and dodge through danger. Bosses wind up before each attack.</p></article><article>${icon('chest')}<h3>Bring something home</h3><p>Press R to return instantly. Heal, refill 3 tonics for free, and bank spare gear in the memory vault.</p></article><article>${icon('flame')}<h3>A life, a little longer</h3><p>Death ends your traveler. Equipped gear, gold, and your satchel are lost. Vault items, embers, star shards, Elder depths, relic discoveries, and memories remain.</p></article></div><div class="notice-box">Nearby rewards gather into personal cloth bags of up to eight items. Brown → purple → blue → cyan → gold. A white bag holds a named keeper relic. A bag takes the color of its best item. Walk near one to open its slots beside your satchel. Hover to compare, click to take, or Shift-click to equip directly. Tap an item on touch screens. ↑ Upgrade · ↔ Tradeoff · ↓ Outclassed. TAB cycles nearby bags. X takes everything that fits; remaining items stay in the bag.</div><div class="notice-box">Click carried gear to equip it. Right-click a satchel slot to drop it into a recoverable personal bag. B opens full inspection, item locking, and explicit drop controls. At the Hearth, Salvage outclassed clears weaker spares in one click. Locked items, named relics, and tradeoffs are kept. Bags fade after two minutes and are lost on death.</div>${bagLegend()}<div class="notice-box">White bags have their own light and sound. Every sixth victory against a keeper guarantees its relic; track your progress in J.</div><h3 class="minor-heading">YOUR HANDS, YOUR INSTINCTS</h3><div class="controls-grid">${[
    ['W A S D / arrows', 'Move'],
    ['Mouse / LMB', 'Aim / hold to fire'],
    ['SPACE', 'Class ability'],
    ['SHIFT', 'Dodge · brief invulnerability'],
    ['F', 'Drink a health tonic'],
    ['Q / E', 'Rotate counterclockwise / clockwise'],
    ['PAGE UP / DOWN', 'Tilt camera · or drag the middle mouse button'],
    ['P', 'Expedition rally board · invite friends'],
    ['R', 'Instant recall to safety'],
    ['X', 'Take all that fits / enter a portal / use an altar'],
    ['TAB', 'Cycle nearby loot bags'],
    ['G', 'Equip the item on your pickup card'],
    ['I', 'Toggle autofire'],
    ['B / M / J', 'Satchel / atlas / objective board'],
    ['C', 'Tap for the bestiary · hold to read nearby creatures'],
    ['N', 'Minimap range · 60 / 120 / 240 metres'],
    ['ENTER', 'Realm chat'],
    ['ESC', 'Close panel / settings'],
    ['SCROLL', 'Zoom camera · Q/E orbit · compass button resets'],
  ]
    .map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`)
    .join(
      '',
    )}</div><div class="notice-box">The world keeps moving while menus are open. Recall first if you need a breather. Switching to another tab recalls your traveler automatically. On touch screens, the left stick moves and the right stick aims and fires.</div><div class="notice-box">The rail shows what your build actually does: health, light, damage, rate, range, speed, armour, and damage per second. A filled ember pip means that stat is as high as its tier can go, so the slot is worth replacing rather than tempering. Hover any item to see which rows it would move. <kbd>J</kbd> lists every objective open to you; pin one and the compass and minimap follow it instead of the chapter.</div><h3 class="minor-heading">WHERE TO GROW STRONGER</h3>${regionGuide()}<h3 class="minor-heading">BETTER TOGETHER</h3><p class="muted">Up to 48 travelers share each realm. Nearby allies share experience and receive personal loot. Every traveler is named on the map (M); from the Hearth, click a name to travel to them in the wilds. Press P to gather at a dungeon entrance and copy a direct expedition invitation. Recall first to travel. Wait for friends before awakening the first altar. Three fallen wardens open the Crown; two side portals lead to chamber expeditions. Defeat the Sovereign and reach level 20 to enter the violet Elder Convergence portal south of the Hearth.</p>`;
}
export function settingsPanel(recoveryCode: string) {
  return `<div class="settings-list"><label><span>Fullscreen<small>Fill your display · Esc exits fullscreen</small></span>${fullscreenButton(true)}</label><label><span>Camera tilt<small>32° cinematic to 78° overhead · saved on this device</small></span><input type="range" min="${CAMERA.minPitch}" max="${CAMERA.maxPitch}" step="1" data-setting="cameraTilt" value="${settings.cameraTilt}" aria-label="Camera tilt setting" /></label><label><span>Ally projectile visibility<small>Keep hostile attacks clear in a crowded fight</small></span><input type="range" min="0" max="1" step="0.1" data-setting="allyShots" value="${settings.allyShots}" aria-label="Ally projectile visibility" /></label><label><span>Master volume<small>Combat and ambient sound</small></span><input type="range" min="0" max="1" step="0.05" data-setting="volume" value="${settings.volume}" aria-label="Master volume" /></label><label><span>Ambient music<small>A little quiet between storms</small></span><input type="checkbox" data-setting="music" ${settings.music ? 'checked' : ''} /></label><label><span>Graphics quality<small>Lower settings help on older devices</small></span><select data-setting="quality" aria-label="Graphics quality"><option value="high" ${settings.quality === 'high' ? 'selected' : ''}>High</option><option value="low" ${settings.quality === 'low' ? 'selected' : ''}>Low</option></select></label>${[
    ['shake', 'Camera shake', 'Impact feedback when you take damage'],
    ['damageNumbers', 'Combat numbers', 'Show damage, healing, and level-ups'],
    ['reducedMotion', 'Reduce motion', 'Disable camera drift and decorative animation'],
  ]
    .map(
      ([k, n, d]) =>
        `<label><span>${n}<small>${d}</small></span><input type="checkbox" data-setting="${k}" ${settings[k as keyof typeof settings] ? 'checked' : ''} /></label>`,
    )
    .join(
      '',
    )}</div><div class="account-box"><span class="eyebrow">KEEP YOUR FLAME</span><h3>Your traveler belongs to you.</h3><p>Progress saves automatically to this server. Keep your recovery code somewhere private to restore this account on another device. Anyone with the code can access your traveler.</p>${recoveryCode ? `<button class="small-button" data-action="copy-recovery">${icon('link')} Copy recovery code</button><button class="text-link" data-action="download-recovery">Save recovery file</button>` : '<p class="muted">Your recovery code was provided when this account was created. Enter the world to create an account, or use your saved code to restore one.</p>'}<button class="text-link" data-panel="recover">Restore a different traveler</button><button class="text-link" data-panel="delete">Delete this account and its progress</button></div><div class="settings-footer"><button class="small-button" data-panel="guide">Field guide ${icon('book')}</button><button class="small-button" data-action="title">Return to title ${icon('home')}</button></div><p class="muted small-print">Returning to the title recalls and saves your traveler. On an unexpected disconnect, your traveler remains in the world for 8 seconds before leaving. <a href="/privacy.html" target="_blank" rel="noopener">Privacy &amp; support</a>.</p>`;
}
export function recoverPanel() {
  return `<p class="panel-intro">Every flame leaves a trace. Enter the recovery code you saved to bring your traveler, vault, and memories to this browser.</p><form id="recover-form"><label class="form-label" for="recovery-code">YOUR PRIVATE RECOVERY CODE</label><textarea id="recovery-code" required rows="3" spellcheck="false" autocomplete="off" placeholder="xxxxx-xxxxx-xxxxx-xxxxx-…"></textarea><div id="recovery-error" class="inline-error" role="alert"></div><button type="submit" class="primary-button">Restore my traveler ${icon('arrow')}</button></form><p class="muted small-print">This switches accounts in this browser and signs the restored account out of its other window. Save your current recovery code first.</p>`;
}
export function codexPanel(profile: Profile | null) {
  return `<p class="panel-intro">A field guide to the things that survived. Defeat a creature to keep its story.</p><div class="codex-grid">${Object.entries(
    ENEMIES,
  )
    .map(([id, e]) => {
      const seen = profile?.discovered.includes(id);
      return `<article class="codex-card ${seen ? '' : 'undiscovered'}"><span class="codex-glyph" style="color:${e.color}">${icon(e.boss ? 'crown' : id === 'wisp' ? 'spark' : id === 'scarab' ? 'shield' : 'flame')}</span><span class="eyebrow">${e.elder ? 'ELDER ONE' : e.boss ? 'ANCIENT ONE' : `TIER ${e.tier} CREATURE`}${seen ? ' · DISCOVERED' : ''}</span><h3>${e.name}</h3><p>${seen ? e.lore : 'Its story is still out in the wilds.'}</p><small>${e.hp.toLocaleString()} base health · ${e.pattern} pattern</small>${BOSS_RELICS[id] ? `<div class="codex-relic"><span>SIGNATURE RELIC · 16% / GUARANTEED EVERY 6TH KILL</span><strong>${BOSS_RELICS[id].name}</strong><small>${profile && legacyOf(profile).relics.includes(id) ? '✓ Collected forever' : 'Find or craft to complete your collection'} · ${profile ? (legacyOf(profile).bossKills[id] ?? 0) : 0} victories</small><small>${TRAITS[BOSS_RELICS[id].trait].description}</small></div>` : ''}</article>`;
    })
    .join('')}</div>`;
}
export function leaderboardPanel(graves: Grave[] | null) {
  return `<p class="panel-intro">Not every light lasts forever. Some are remembered.</p>${graves === null ? '<p class="empty-state">Listening for echoes…</p>' : graves.length ? `<div class="leaderboard"><div class="leaderboard-head"><span>TRAVELER</span><span>LEVEL</span><span>FAME</span></div>${graves.map((g, i) => `<div class="leaderboard-row"><span><b class="rank">${String(i + 1).padStart(2, '0')}</b>${icon(CLASSES[g.classId].icon)}<span>${esc(g.name)}<small>${CLASSES[g.classId].name} · ${g.kills} creatures defeated</small></span></span><span>${g.level}</span><strong>${g.fame.toLocaleString()}</strong></div>`).join('')}</div>` : '<div class="empty-state">' + icon('flame') + '<h3>The first stories are still being written.</h3><p>Fallen travelers are remembered here, ranked by the fame they earned.</p></div>'}`;
}
/** Where a traveler is, in words a newcomer already has. */
export function travelerPlace(p: RosterEntry) {
  return p.dimension === 'wilds'
    ? isSafe(p, 'wilds')
      ? 'At the Hearth'
      : zoneAt(p.x, p.z).name
    : templateName(templateOf(p.dimension));
}
/** The travel-to control. Eligibility is only advisory here; the server decides. */
export function travelRow(
  target: RosterEntry | undefined,
  safe: boolean,
  cooldown = 0,
  hasCharacter = true,
) {
  if (!target) return '';
  const inWilds = target.dimension === 'wilds' && !isSafe(target, 'wilds');
  const ready = safe && inWilds && cooldown <= 0 && hasCharacter;
  return `<div class="travel-row" data-traveler="${target.id}"><span>${icon(CLASSES[target.classId].icon)}<strong>${esc(target.name)}</strong><small>Level ${target.level} ${CLASSES[target.classId].name} · ${esc(travelerPlace(target))}</small></span><button class="primary-button" data-game="travel" data-id="${target.id}" ${ready ? '' : 'disabled'}>${icon('portal')} Travel to ${esc(target.name)}</button><small>${!safe ? 'Travel leaves from the Hearth · R recalls' : !inWilds ? 'They are somewhere you can’t follow right now' : cooldown > 0 ? `Travel again in ${Math.ceil(cooldown)} s` : 'You arrive beside them · 20 s between travels'}</small></div>`;
}
export function realmsPanel(
  realms: RealmInfo[],
  current: string | undefined,
  playing: boolean,
  peers: PlayerState[] = [],
  muted: string[] = [],
  roster: RosterEntry[] = [],
  selected = '',
  safe = false,
  travelCooldown = 0,
) {
  const listed: RosterEntry[] = roster.length
    ? roster
    : peers.map((p) => ({
        id: p.id,
        name: p.name,
        classId: p.classId,
        level: p.level,
        dimension: p.dimension,
        x: p.x,
        z: p.z,
      }));
  return `<p class="panel-intro">A shared horizon. Choose a realm, or invite a friend to yours.</p>${playing ? '<button class="primary-button" data-panel="rally">Find a dungeon group <kbd>P</kbd></button>' : ''}<div class="realm-list">${realms.map((r) => `<button class="realm-card ${current === r.id ? 'selected' : ''}" data-realm="${r.id}" ${playing ? 'disabled' : ''}><span class="realm-orb">${icon('flame')}</span><span><strong>${esc(r.name)}</strong><small>${r.wardens}/3 seals broken · ${r.id}</small></span><span>${r.players} / ${r.capacity}<small>${current === r.id ? 'Your realm' : r.players >= r.capacity ? 'Full' : 'Open realm'}</small></span></button>`).join('') || '<p class="empty-state">No realms could be reached.</p>'}</div><div class="settings-footer"><button class="primary-button" data-action="invite">${icon('link')} Copy invitation</button><button class="small-button" data-action="new-realm" ${playing ? 'disabled' : ''}>Open a new realm</button></div><p class="muted small-print">${playing ? 'Return to the title to choose a different realm. Your traveler returns to the Hearth when you join.' : 'Realm selection applies when you enter. A traveler reconnects to their current realm for 8 seconds after leaving.'} All listed realms are public.</p>${
    playing
      ? `<h3 class="minor-heading">TRAVELERS IN THIS REALM</h3>${travelRow(
          listed.find((p) => p.id === selected),
          safe,
          travelCooldown,
        )}<div class="peer-list">${listed.length ? listed.map((p) => `<div class="${p.id === selected ? 'selected' : ''}"><button class="traveler-name" data-action="select-traveler" data-id="${p.id}" title="Show travel option">${icon(CLASSES[p.classId].icon)}<strong>${esc(p.name)}<small>Level ${p.level} ${CLASSES[p.classId].name} · ${esc(travelerPlace(p))}</small></strong></button><button class="text-link" data-action="mute" data-id="${p.id}">${muted.includes(p.id) ? 'Unmute' : 'Mute'}</button><button class="text-link" data-action="report" data-id="${p.id}" data-name="${esc(p.name)}">Report</button></div>`).join('') : '<p class="muted">No other travelers are in this realm. Share an invitation to meet at the Hearth.</p>'}</div>`
      : ''
  }`;
}
export function deathPanel(grave: Grave, profile: Profile) {
  return `<div class="death-sigil">${icon('flame')}</div><p class="death-quote">“A little light is never wasted.”</p><p class="panel-intro centered">${esc(grave.name)} fell to ${esc(grave.cause)}.<br>Their journey ends. Yours carries on.</p><div class="death-stats"><div><strong>${grave.level}</strong><span>LEVEL REACHED</span></div><div><strong>${grave.kills}</strong><span>CREATURES SLAIN</span></div><div><strong>${grave.fame}</strong><span>FAME EARNED</span></div></div><div class="notice-box centered">+${Math.floor(grave.fame / 10)} embers kept · ${profile.vault.length} items safe in your vault<br>Your equipment, satchel, and carried gold have returned to the wilds.</div><button class="primary-button full-width" data-action="rise">Carry the light again ${icon('arrow')}</button><button class="text-link full-width" data-panel="leaderboard">Visit the Hall of Echoes</button>`;
}
export function atlasPanel(
  snapshot?: Snapshot,
  roster: RosterEntry[] = [],
  selected = '',
  travelCooldown = 0,
) {
  const safe = !!snapshot?.self.safe;
  const target = roster.find((p) => p.id === selected);
  return `<div class="atlas-wrap"><canvas id="atlas" width="900" height="720" aria-label="Map of the shared realm"></canvas></div>${travelRow(target, safe, travelCooldown)}<div class="atlas-caption">${snapshot?.self.dimension !== 'wilds' && snapshot ? `You are in ${templateName(templateOf(snapshot.self.dimension))}. Press R to return to the Hearth.` : roster.length > 1 ? 'Click a traveler’s name to travel to them from the Hearth. Click a place to pin it: the compass and minimap follow your pin until you click it again.' : 'Click a place to pin it. Signposts at each road fork show the level ahead, and warden light columns mark the seals still standing.'}</div>${regionGuide()}<button class="small-button" data-panel="journal">Your next step <kbd>J</kbd></button><button class="small-button" data-game="recall">${icon('home')} Recall to the Last Hearth <kbd>R</kbd></button>`;
}

export function reportPanel(name: string) {
  return `<p class="panel-intro">Report an issue involving ${esc(name)} to this server’s operator. Include the message or behavior and approximate time. Reports are stored for operator review.</p><form id="report-form"><label class="form-label" for="report-reason">WHAT HAPPENED?</label><textarea id="report-reason" required minlength="5" maxlength="500" rows="4" placeholder="Describe the issue…"></textarea><div id="report-error" class="inline-error" role="alert"></div><button type="submit" class="primary-button">Send report</button></form><p class="muted small-print">Mute immediately hides this traveler’s chat in your browser. Reporting does not automatically suspend an account.</p>`;
}
export function deletePanel(name: string) {
  return `<p class="panel-intro">This permanently deletes your traveler, vault, embers, discoveries, death history, and recovery credentials from the live server. The operator’s backups may retain older copies until they expire.</p><div class="notice-box">This cannot be undone. To confirm, type <strong>${esc(name)}</strong> exactly.</div><form id="delete-form"><label class="form-label" for="delete-name">TRAVELER NAME</label><input id="delete-name" class="text-input" required autocomplete="off" aria-label="Confirm traveler name" /><div id="delete-error" class="inline-error" role="alert"></div><button type="submit" class="primary-button danger-button">Permanently delete my account</button></form>`;
}
