import { BAG_REACH, bagItems } from '../shared/loot';
import { kitHud, bagHud, itemTooltip, statHud } from './hud-ui';
import { bagStyle, compareGear, gearNumber } from '../shared/gear';
import {
  REGIONS,
  huntContract,
  journeyGoal,
  journeyGoals,
  journeyTarget,
} from '../shared/progression';
import { CROWN_LORE, hearthBanner } from './progression-ui';
import { CAMERA } from './game/camera';
import { invitationUrl } from './rally-ui';
import { saveVictoryCard } from './victory-card';
import { MODIFIERS, type Modifier } from '../shared/endgame';
import type { GearFilter } from './equipment-ui';
import { attackPlan } from '../shared/patterns';
import { combatStats } from '../shared/combat';
import './style.css';
import './hud.css';
import './progression.css';
import {
  CLASSES,
  ENEMIES,
  DUNGEONS,
  LANDMARKS,
  RARITIES,
  distance,
  xpForLevel,
  zoneAt,
} from '../shared/content';
import type {
  Action,
  ChatLine,
  ClassId,
  DungeonId,
  Grave,
  Input,
  Item,
  Profile,
  RealmInfo,
  RosterEntry,
  ServerMessage,
  Snapshot,
  Vec,
} from '../shared/types';
import { icon, escapeHtml as esc } from './icons';
import { Connection, api } from './network';
import { readLocal, settings, writeLocal } from './storage';
import {
  isFullscreen,
  observeFullscreen,
  syncFullscreenControls,
  toggleFullscreen,
} from './fullscreen';
import { WorldView } from './game/scene';
import {
  ATLAS_ZOOM,
  drawMap,
  drawMinimapOverlay,
  fitCanvas,
  MINIMAP_SPANS,
  type MapHit,
  type MapPin,
} from './game/map';
import { placeById, threatOf } from '../shared/places';
import { ISLAND } from '../shared/world';
import { sound } from './game/audio';
import * as ui from './ui';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
$('app').innerHTML = ui.shell();
let view: WorldView | undefined;
let profile: Profile | null = null,
  token = readLocal<string>('token', ''),
  recoveryCode = readLocal<string>('recovery', '');
let classId: ClassId = readLocal<ClassId>('class', 'arcanist');
if (!CLASSES[classId]) classId = 'arcanist';
let realms: RealmInfo[] = [],
  realmId =
    new URLSearchParams(location.search).get('realm') || readLocal<string>('realm', 'hearth-1');
const invitedValue = new URLSearchParams(location.search).get('expedition');
const invitedDungeon =
  invitedValue && Object.hasOwn(DUNGEONS, invitedValue) ? (invitedValue as DungeonId) : undefined;
let invitationPending = !!invitedDungeon,
  pendingRecap = false,
  pendingRally = false;
let manualCopyValue = '';
const seenDrops = new Set<string>();
// The three-line banner above the hotbar: shown on entry, gone after 8 s or the first step.
let bannerUntil = 0,
  bannerMarkup = '',
  bannerFadeTimer: ReturnType<typeof setTimeout> | undefined;
let roster: RosterEntry[] = [],
  selectedTraveler = '',
  atlasHits: MapHit[] = [],
  lastWardens: number | undefined;
// The minimap draws its world at 2 Hz into an offscreen base, then blits it every frame with
// the player's interpolated offset, so movement is smooth without redrawing terrain at 60 fps.
let minimapBase: HTMLCanvasElement | undefined,
  minimapBaseAt = { x: 0, z: 0 },
  minimapDirty = true;
let pin: MapPin | null = null;
// Atlas framing. It fits the realm at 1; Phase 2's larger map is why pan and pinch exist.
let atlasZoom = 1,
  atlasPan = { x: 0, z: 0 },
  atlasDrag: { id: number; x: number; y: number; moved: number } | undefined,
  atlasPinch = 0;
// C is a tap for the bestiary panel and a hold for plates in the world.
let bestiaryHeldAt = 0;
// During the first ninety seconds only one toast is visible; the rest wait their turn.
const toastQueue: { message: string; tone: string }[] = [];
let toastShowing = false;
let cameraDrag: { id: number; x: number; y: number } | undefined;
let playing = false,
  entering = false,
  panel: ui.Panel | null = null,
  panelMarkup = '',
  selectedItem = '',
  gearFilter: GearFilter = 'all',
  groundLootId = '',
  groundLootSignature = '',
  kitSignature = '',
  dungeonSignature = '',
  snapshot: Snapshot | undefined,
  grave: Grave | undefined;
let leaderboard: Grave[] | null = null,
  previousFocus: HTMLElement | null = null,
  lastZone = '',
  totalPlaying = 0,
  moved = 0,
  shots = 0,
  seq = 0,
  sendTimer = 0,
  lastSentInput = '',
  quickEquipId = '',
  quickEquipUntil = 0,
  hudTimer = 0;
let fire = false,
  autofire = false,
  pointerX = innerWidth / 2,
  pointerY = innerHeight / 2;
let muted = readLocal<string[]>('muted', []),
  reportTarget = '',
  reportName = '';
const keys = new Set<string>(),
  connection = new Connection();
let touchMove = { x: 0, z: 0 },
  touchAim = { x: 0, z: 0 };
const text = (id: string, value: string) => {
  const el = $(id);
  if (el.textContent !== value) el.textContent = value;
};
function firstMinutes() {
  const c = profile?.character;
  return playing && totalPlaying < 90 && !!c && c.level < 3;
}
function toast(message: string, tone = 'info') {
  if (firstMinutes() && toastShowing) {
    if (toastQueue.length < 6) toastQueue.push({ message, tone });
    return;
  }
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.innerHTML = `${icon(tone === 'good' ? 'spark' : tone === 'bad' ? 'heart' : 'compass')}<span>${esc(message)}</span>`;
  $('toasts').append(el);
  toastShowing = true;
  setTimeout(
    () => {
      el.remove();
      toastShowing = $('toasts').children.length > 0;
      const next = toastQueue.shift();
      if (next) toast(next.message, next.tone);
    },
    firstMinutes() ? 4000 : 5000,
  );
  while ($('toasts').children.length > 4) $('toasts').firstElementChild?.remove();
}
function stopInput() {
  if (cameraDrag || keys.has('PageUp') || keys.has('PageDown')) writeLocal('settings', settings);
  cameraDrag = undefined;
  keys.clear();
  fire = false;
  touchMove = { x: 0, z: 0 };
  touchAim = { x: 0, z: 0 };
  const input = { x: 0, z: 0, angle: view?.localInput.angle ?? 0, fire: false, seq: ++seq };
  connection.input(input);
  view?.prediction.record(input, performance.now() / 1000);
  if (view) view.localInput = input;
}
observeFullscreen(stopInput);
try {
  view = new WorldView($<HTMLCanvasElement>('world'), $('world-labels'));
  view.onFailure = (message) => {
    stopInput();
    connection.close();
    toast(message, 'bad');
    $('connection-banner').textContent = message;
    $('connection-banner').classList.remove('hidden');
  };
} catch {
  $('entry-error').textContent =
    'Your browser could not start WebGL2. Enable hardware acceleration or use a current Chrome, Firefox, or Safari browser.';
  $<HTMLButtonElement>('enter-button').disabled = true;
}
function renderTitle() {
  $('invite-banner').classList.toggle('hidden', !invitedDungeon);
  if (invitedDungeon)
    $('invite-banner').innerHTML =
      `${icon('portal')}<span>You’re invited to <strong>${DUNGEONS[invitedDungeon].name}</strong><small>Enter the realm to meet your group at the entrance.</small></span>`;
  if (profile?.character) classId = profile.character.classId;
  $('class-cards').innerHTML = ui.classCards(classId, !!profile?.character);
  text(
    'class-description',
    profile?.character
      ? `Continue your level ${profile.character.level} ${CLASSES[classId].name}. Your story is still being written.`
      : CLASSES[classId].description,
  );
  const input = $<HTMLInputElement>('traveler-name');
  if (profile) {
    input.value = profile.name;
    input.readOnly = true;
  } else {
    input.readOnly = false;
    if (!input.value) input.value = readLocal('name', '');
  }
  $('enter-button').innerHTML =
    `<span>${entering ? 'Opening the way…' : profile?.character ? 'Continue journey' : 'Enter the wilds'}</span>${icon('arrow')}`;
  $<HTMLButtonElement>('enter-button').disabled = entering || !view;
  view?.setPreviewClass(classId);
}
function saveAccount(result: { token: string; recoveryCode?: string; profile: Profile }) {
  token = result.token;
  profile = result.profile;
  if (result.recoveryCode) recoveryCode = result.recoveryCode;
  const saved = writeLocal('token', token);
  writeLocal('recovery', recoveryCode);
  writeLocal('name', profile.name);
  if (!saved)
    toast(
      'Browser storage is unavailable. Save your recovery file in Settings before leaving.',
      'bad',
    );
}
async function enter() {
  if (entering || !view) return;
  entering = true;
  $('entry-error').textContent = '';
  renderTitle();
  sound.start();
  try {
    if (!token) {
      const name = $<HTMLInputElement>('traveler-name').value.trim();
      const result = await api<{ token: string; recoveryCode: string; profile: Profile }>(
        'account',
        { name },
      );
      saveAccount(result);
      toast('Your flame is saved. Keep your recovery code from Settings.');
    }
    connection.connect(token, classId, realmId);
    setTimeout(() => {
      if (entering) {
        entering = false;
        renderTitle();
      }
    }, 12000);
  } catch (e) {
    $('entry-error').textContent =
      e instanceof Error ? e.message : 'The realm could not be reached.';
    entering = false;
    renderTitle();
  }
}
function returnToTitle() {
  if (playing) connection.action('recall');
  connection.close();
  playing = false;
  entering = false;
  autofire = false;
  snapshot = undefined;
  stopInput();
  closePanel();
  $('hud').classList.add('hidden');
  document.body.classList.remove('in-world');
  $('title-screen').classList.remove('hidden');
  $('connection-banner').classList.add('hidden');
  view?.setPlaying(false);
  lastZone = '';
  renderTitle();
  void refreshRealms();
}
function onMessage(m: ServerMessage) {
  if (m.type === 'welcome') {
    if (profile?.id !== m.profile.id) seenDrops.clear();
    pendingRally = false;
    profile = m.profile;
    realmId = m.realm.id;
    writeLocal('realm', realmId);
    playing = true;
    entering = false;
    totalPlaying = 0;
    bannerUntil = performance.now() + 8000;
    bannerMarkup = '';
    clearTimeout(bannerFadeTimer);
    $('hearth-banner').classList.remove('fading');
    roster = [];
    selectedTraveler = '';
    lastWardens = undefined;
    pin = null;
    syncPin();
    minimapDirty = true;
    toastQueue.length = 0;
    moved = 0;
    shots = 0;
    $('title-screen').classList.add('hidden');
    $('hud').classList.remove('hidden');
    document.body.classList.add('in-world');
    localCooldowns.dash = 0;
    localCooldowns.ability = 0;
    quickEquipId = '';
    groundLootId = '';
    groundLootSignature = '';
    dungeonSignature = '';
    $('loot-card').classList.add('hidden');
    $('ground-loot').classList.add('hidden');
    $('connection-banner').classList.add('hidden');
    view?.setPlaying(true);
    (document.activeElement as HTMLElement)?.blur();
    classId = profile.character!.classId;
    renderProfile();
    closePanel();
    toast(`Welcome to ${m.realm.name}. R always brings you home.`, 'good');
  }
  if (m.type === 'profile') {
    if (m.profile.lastExpedition && m.profile.lastExpedition.id !== profile?.lastExpedition?.id)
      pendingRecap = true;
    const before = new Set(profile?.character?.inventory.map((i) => i.id) ?? []);
    const picked = m.profile.character?.inventory.find((i) => !before.has(i.id));
    if (
      picked &&
      !panel &&
      (m.profile.character?.inventory.length ?? 0) > (profile?.character?.inventory.length ?? 0)
    ) {
      quickEquipId =
        compareGear(m.profile.character!, picked).verdict === 'upgrade' ? picked.id : '';
      quickEquipUntil = performance.now() + 4000;
      $('loot-card').innerHTML = ui.pickupNotice(m.profile.character!, picked);
      $('loot-card').classList.remove('hidden');
      sound.play('loot');
    }
    if (quickEquipId && !m.profile.character?.inventory.some((i) => i.id === quickEquipId)) {
      quickEquipId = '';
      $('loot-card').classList.add('hidden');
    }
    profile = m.profile;
    syncPin();
    renderProfile();
    if (
      panel &&
      ['inventory', 'vault', 'forge', 'journal', 'codex', 'rally', 'recap'].includes(panel)
    )
      renderPanel();
  }
  if (m.type === 'snapshot') {
    const changedDimension = snapshot?.self.dimension !== m.self.dimension;
    snapshot = m;
    if (m.roster) {
      roster = m.roster;
      if (panel === 'realms' || panel === 'atlas') renderPanel();
    }
    // The Crown and the Elders are explained once, the first time a seal breaks while you watch.
    if (
      lastWardens !== undefined &&
      m.realm.wardens > lastWardens &&
      !readLocal('crownLore', false)
    ) {
      writeLocal('crownLore', true);
      toast(`A seal is broken. ${CROWN_LORE}`, 'good');
    }
    lastWardens = m.realm.wardens;
    if (view) view.latency = connection.latency;
    view?.update(m);
    for (const drop of m.loot) {
      const dropKey = `${drop.id}:${bagStyle(drop.item)}`;
      if (seenDrops.has(dropKey)) continue;
      seenDrops.add(dropKey);
      if (bagStyle(drop.item) === 'white') {
        sound.play('relic');
        toast(`WHITE BAG · ${drop.item.name}. Your keeper relic is on the ground.`, 'good');
        if (!settings.reducedMotion)
          view?.sparks.burst(drop.x, drop.z, '#fff1ce', 32, drop.dimension, 1.6);
      }
    }
    while (seenDrops.size > 2000) seenDrops.delete(seenDrops.values().next().value!);
    if (changedDimension && pendingRally) {
      pendingRally = false;
      closePanel();
    }
    if (invitationPending && m.self.safe) {
      invitationPending = false;
      openPanel('rally');
    } else if (pendingRecap && m.self.safe && !panel) {
      openPanel('recap');
    } else if (panel === 'rally' || panel === 'recap' || panel === 'journal') renderPanel();
    renderVitals();
    if (changedDimension || m.tick % 10 === 0) minimapDirty = true;
    if (panel === 'atlas') drawAtlas();
    const z = zoneAt(m.self.x, m.self.z, m.self.dimension);
    if (z.id !== lastZone) {
      lastZone = z.id;
      const r = REGIONS.find((r) => r.id === z.id);
      announce(z.name, r ? `LV ${r.level}–${r.end} · T${r.tier} drops · ${r.lesson}` : z.subtitle);
    }
  }
  if (
    m.type === 'notice' &&
    !m.text.endsWith('added to your satchel.') &&
    !m.text.endsWith(' collected.')
  )
    toast(m.text, m.tone);
  if (m.type === 'chat') addChat(m.line);
  if (m.type === 'death') {
    grave = m.grave;
    profile = m.profile;
    playing = false;
    autofire = false;
    stopInput();
    connection.close();
    sound.play('death');
    openPanel('death');
    $('hud').classList.add('hidden');
    document.body.classList.remove('in-world');
  }
  if (m.type === 'error') {
    entering = false;
    renderTitle();
    if (playing) {
      $('connection-banner').textContent = m.text;
      $('connection-banner').classList.remove('hidden');
    } else $('entry-error').textContent = m.text;
    toast(m.text, 'bad');
  }
}
connection.onMessage = onMessage;
connection.onStatus = (status) => {
  if (status === 'Connected') $('connection-banner').classList.add('hidden');
  else if (playing) {
    $('connection-banner').textContent = status;
    $('connection-banner').classList.remove('hidden');
    stopInput();
  }
};
function renderProfile() {
  const c = profile?.character;
  if (!c) return;
  if (view) view.character = c;
  renderKit();
  hideItemTooltip();
  $('portrait').innerHTML = icon(CLASSES[c.classId].icon);
  $('portrait').style.setProperty('--class-color', CLASSES[c.classId].color);
  text('player-name', profile!.name);
  text('player-level', `LV ${c.level}`);
  text('gold', `${c.gold}`);
  text('embers', `${profile!.embers}`);
  text('potions', `${c.potions}`);
  $('weapon-icon').innerHTML = icon(
    c.classId === 'arcanist' ? 'spark' : c.classId === 'ranger' ? 'bow' : 'sword',
  );
  $('ability-icon').innerHTML = icon(CLASSES[c.classId].icon);
  text('ability-label', CLASSES[c.classId].ability);
  $('xp-fill').style.width = `${c.level === 20 ? 100 : (c.xp / xpForLevel(c.level)) * 100}%`;
  const xp =
    c.level < 20
      ? `${c.xp} / ${xpForLevel(c.level)} XP → LV ${c.level + 1}`
      : 'LV 20 · Hunt relics and Elder depths';
  text('xp-label', xp);
  $('xp-track').title = xp;
  updateObjective();
}
function renderVitals() {
  if (!snapshot) return;
  const p = snapshot.self;
  $('health-fill').style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
  $('mana-fill').style.width = `${(p.mp / p.maxMp) * 100}%`;
  text('health-label', `${p.hp} / ${p.maxHp}`);
  text('mana-label', `${p.mp} / ${Math.round(p.maxMp)}`);
  $('safe-state').innerHTML =
    `${icon(p.safe ? 'shield' : 'compass')} ${p.safe ? 'Sanctuary' : 'In the wilds'}`;
  $('safe-state').classList.toggle('unsafe', !p.safe);
  text('zone-name', zoneAt(p.x, p.z, p.dimension).name);
  text('coordinates', `${Math.round(p.x)} / ${Math.round(-p.z)}`);
  text('population', `${snapshot.realm.players} / ${snapshot.realm.capacity} travelers`);
  text('ping', `${connection.latency || '—'} ms`);
  text('hud-realm', snapshot.realm.name);
  for (const key of ['ability', 'dash', 'potion'] as const) {
    const remaining = snapshot.cooldowns[key];
    text(`${key}-cooldown`, remaining > 0.1 ? remaining.toFixed(1) : '');
    $(`${key}-cooldown`).classList.toggle('active', remaining > 0.1);
  }
  document.body.classList.toggle(
    'in-combat',
    !p.safe && snapshot.enemies.some((e) => distance(p, e) < 24),
  );
  const bosses = snapshot.enemies
    .filter(
      (e) =>
        e.boss && distance(p, e) < 30 && (e.hp < e.maxHp || e.telegraph > 0 || distance(p, e) < 18),
    )
    .sort((a, b) => distance(p, a) - distance(p, b));
  const boss = bosses[0];
  $('boss-panel').classList.toggle('hidden', !boss);
  if (boss) {
    text('boss-name', boss.name);
    text(
      'boss-phase',
      boss.telegraph > 0.1
        ? `${attackPlan(boss).name} · ${attackPlan(boss).hint}`
        : `${ENEMIES[boss.kind].elder ? 'ELDER ONE' : 'ANCIENT ONE'} · PHASE ${boss.phase + 1}`,
    );
    text(
      'boss-hp',
      `${Math.max(0, Math.ceil(boss.hp)).toLocaleString()} / ${boss.maxHp.toLocaleString()}`,
    );
    $('boss-fill').style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
  }
  const e = snapshot.event;
  // One meter at a time: the star waits until the traveler is out in the wilds at level 3.
  $('event-banner').classList.toggle(
    'hidden',
    !e.active || p.dimension !== 'wilds' || p.safe || p.level < 3,
  );
  if (e.active)
    $('event-banner').innerHTML =
      `${icon('spark')} <span>THE WANDERING STAR<small>${e.kills}/${e.target} guardians · ${Math.ceil(e.remaining)}s · Cindermeadow east</small></span>`;
  const chain = snapshot.chain;
  $('chain-meter').classList.toggle('hidden', !chain || chain.kills < 2 || p.safe);
  if (chain) {
    text('chain-count', `${chain.kills} CHAIN`);
    text('chain-bonus', `+${Math.round((chain.multiplier - 1) * 100)}% XP`);
    $('chain-fill').style.width = `${(chain.remaining / 12) * 100}%`;
  }
  const hunt = profile?.character ? huntContract(profile.character) : undefined;
  document
    .querySelector('.hunt-card')
    ?.classList.toggle('hidden', (profile?.character?.quest ?? 0) < 1);
  if (hunt) {
    text('hunt-title', `HUNT ${hunt.round} · T${hunt.tier}+ CREATURES`);
    text('hunt-progress', `${hunt.kills} / ${hunt.target}`);
    text('hunt-reward', `T${hunt.rewardTier} ${hunt.slot} · ${hunt.xp} XP · ${hunt.region.name}`);
    $('hunt-fill').style.width = `${(hunt.kills / hunt.target) * 100}%`;
  }
  const region = REGIONS.find((r) => r.id === zoneAt(p.x, p.z, p.dimension).id);
  const recommended = p.dimension !== 'wilds' ? DUNGEONS[p.dimension].level : (region?.level ?? 1);
  text(
    'zone-threat',
    p.safe
      ? 'Sanctuary · heal, refill, bank spares'
      : `${p.level < recommended ? 'DANGER · ' : ''}LV ${recommended}+ · T${zoneAt(p.x, p.z, p.dimension).tier} treasure`,
  );
  $('zone-threat').classList.toggle('danger', !p.safe && p.level < recommended);
  const dungeon = snapshot.dungeon;
  $('dungeon-progress').classList.toggle('hidden', !dungeon);
  document.body.classList.toggle('in-dungeon', !!dungeon);
  if (dungeon) {
    const modifier = MODIFIERS[dungeon.modifier as Modifier];
    const signature = JSON.stringify([
      dungeon.dimension,
      dungeon.depth,
      dungeon.modifier,
      dungeon.stage,
      dungeon.status,
      dungeon.remaining,
      distance(snapshot.self, dungeon.altar) < 4,
    ]);
    if (signature !== dungeonSignature) {
      dungeonSignature = signature;
      $('dungeon-progress').innerHTML =
        `<span class="eyebrow">${dungeon.dimension === 'eclipse' ? `ELDER DEPTH ${dungeon.depth} · ${modifier?.name ?? ''}` : DUNGEONS[dungeon.dimension].name}</span><strong>${dungeon.status === 'cleared' ? 'Expedition complete' : `${dungeon.stage}/${dungeon.stages} · ${dungeon.name}`}</strong><span>${dungeon.status === 'active' ? `${dungeon.remaining} guardian${dungeon.remaining === 1 ? ' remains' : 's remain'}` : dungeon.next}</span><div class="chamber-pips">${Array.from({ length: dungeon.stages }, (_, i) => `<i class="${i < dungeon.stage - 1 || dungeon.status === 'cleared' ? 'done' : i === dungeon.stage - 1 ? 'current' : ''}"></i>`).join('')}</div>${dungeon.dimension === 'eclipse' ? `<small>${modifier?.description ?? ''} · <span id="dungeon-timer"></span></small>` : ''}${dungeon.status === 'ready' && distance(snapshot.self, dungeon.altar) < 4 ? '<button class="small-button" data-game="delve">Awaken altar</button>' : ''}${dungeon.status === 'cleared' && profile?.lastExpedition ? '<button class="small-button" data-panel="recap">Review expedition</button>' : ''}`;
    }
    if ($('dungeon-timer'))
      text(
        'dungeon-timer',
        `${Math.floor(dungeon.elapsed / 60)}:${String(Math.floor(dungeon.elapsed % 60)).padStart(2, '0')}`,
      );
  }
  renderKit();
  updateObjective();
  updateInteraction();
  if (tooltipTarget && !findHudItem(tooltipTarget.dataset.hudItem ?? '')) hideItemTooltip();
  $('damage-flash').classList.toggle('low-health', p.hp / p.maxHp < 0.25 && !p.safe);
  const standing = zoneAt(p.x, p.z, p.dimension);
  document.body.classList.toggle(
    'over-my-head',
    !p.safe && threatOf(p.level, standing) === 'deadly',
  );
}
/** The pin lives on the profile, so it survives a reconnect and a new device.
 * It names either a place from the atlas or a goal from the board. */
function syncPin() {
  const id = profile?.pinned;
  const place = placeById(id);
  if (place) {
    pin = { id: place.id, name: place.name, x: place.x, z: place.z };
    return;
  }
  const goal = id && profile ? journeyGoals(profile, snapshot).find((g) => g.id === id) : undefined;
  pin = goal ? { id: goal.id, name: goal.target.name, x: goal.target.x, z: goal.target.z } : null;
}
function mapView(mode: 'minimap' | 'atlas') {
  return {
    mode,
    snapshot,
    objective: view?.objective,
    roster,
    selected: selectedTraveler,
    span: settings.minimapSpan,
    pin,
    visited: profile?.character?.visited ?? [],
  } as const;
}
/** Keep the pan inside the island however far the player drags or pinches. */
function clampAtlasPan() {
  const reach = (ISLAND.radius * (atlasZoom - 1)) / atlasZoom + 8;
  atlasPan.x = Math.max(-reach, Math.min(reach, atlasPan.x));
  atlasPan.z = Math.max(-reach, Math.min(reach, atlasPan.z));
}
function zoomAtlas(factor: number) {
  const next = Math.max(ATLAS_ZOOM.min, Math.min(ATLAS_ZOOM.max, atlasZoom * factor));
  if (next === atlasZoom) return;
  atlasZoom = next;
  if (atlasZoom === 1) atlasPan = { x: 0, z: 0 };
  clampAtlasPan();
  drawAtlas();
}
function drawAtlas() {
  const canvas = document.getElementById('atlas') as HTMLCanvasElement | null;
  if (!canvas) return;
  fitCanvas(canvas);
  atlasHits = drawMap(canvas, {
    ...mapView('atlas'),
    self: snapshot?.self ?? null,
    atlasZoom,
    atlasPan,
  });
  canvas.dataset.hits = JSON.stringify(atlasHits);
}
/** Redraw the minimap world into the offscreen base, centred on where the player is now. */
function drawMinimapBase() {
  const live = view?.prediction.position ?? snapshot?.self;
  if (!snapshot || !live) return;
  const canvas = $<HTMLCanvasElement>('minimap');
  if (fitCanvas(canvas)) minimapDirty = true;
  if (!minimapBase) minimapBase = document.createElement('canvas');
  if (minimapBase.width !== canvas.width || minimapBase.height !== canvas.height) {
    minimapBase.width = canvas.width;
    minimapBase.height = canvas.height;
  }
  minimapBaseAt = { x: live.x, z: live.z };
  drawMap(minimapBase, {
    ...mapView('minimap'),
    self: { x: live.x, z: live.z, angle: snapshot.self.angle },
    overlay: false,
  });
  minimapDirty = false;
}
/** Every frame: blit the base by however far the player has moved since it was drawn. */
function paintMinimap() {
  if (!snapshot) return;
  if (minimapDirty || !minimapBase) drawMinimapBase();
  if (!minimapBase) return;
  const canvas = $<HTMLCanvasElement>('minimap');
  const ctx = canvas.getContext('2d');
  const live = view?.prediction.position ?? snapshot.self;
  if (!ctx) return;
  const scale = Math.min(canvas.width, canvas.height) / settings.minimapSpan;
  const dx = (live.x - minimapBaseAt.x) * scale,
    dz = (live.z - minimapBaseAt.z) * scale;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(minimapBase, -dx, -dz);
  drawMinimapOverlay(canvas, {
    ...mapView('minimap'),
    self: { x: live.x, z: live.z, angle: view?.localInput.angle ?? snapshot.self.angle },
  });
}
function cycleMinimapZoom() {
  const next = (MINIMAP_SPANS.indexOf(settings.minimapSpan) + 1) % MINIMAP_SPANS.length;
  settings.minimapSpan = MINIMAP_SPANS[next];
  writeLocal('settings', settings);
  minimapDirty = true;
  paintMinimap();
  text('minimap-zoom', `${settings.minimapSpan}m`);
}
/** A pin outranks the chapter goal until it is cleared. Clicking the same target clears it. */
function setPin(id: string) {
  const next = pin?.id === id ? undefined : id;
  if (profile) profile.pinned = next;
  syncPin();
  connection.action('pin', next ?? '');
  minimapDirty = true;
  if (panel === 'atlas' || panel === 'journal') renderPanel();
  updateObjective();
}
function updateObjective() {
  if (!snapshot || !view || !profile?.character) return;
  const p = snapshot.self,
    c = profile.character;
  const goals = journeyGoals(profile, snapshot);
  const pinnedGoal = goals.find((g) => g.id === profile!.pinned);
  const goal = pinnedGoal ?? goals[0] ?? journeyGoal(profile!, snapshot);
  text(
    'quest-chapter',
    pinnedGoal
      ? 'PINNED · J'
      : goal.chapter === 0
        ? 'YOUR NEXT STEP · J'
        : goal.chapter < 8
          ? `CHAPTER ${goal.chapter + 1}/8 · YOUR NEXT STEP · J`
          : 'YOUR ENDGAME · J',
  );
  text('quest-name', goal.title);
  text(
    'quest-text',
    `${goal.progressLabel} ${Math.min(goal.current, goal.total)}/${goal.total} · ${goal.target.name}`,
  );
  text('quest-reward', `Earn: ${goal.reward}`);
  $('quest-fill').style.width = `${Math.min(100, (goal.current / goal.total) * 100)}%`;
  $('quest-tracker').dataset.goal = goal.id;
  // Below the recommended level and outside the sanctuary, the health frame turns red-brown.
  $('player-panel').classList.toggle('underleveled', !p.safe && c.level <= goal.level - 3);
  const banner = $('hearth-banner');
  const showBanner = performance.now() < bannerUntil && moved < 0.25;
  if (showBanner) {
    const markup = hearthBanner(profile, snapshot);
    if (bannerMarkup !== markup) {
      bannerMarkup = markup;
      banner.innerHTML = markup;
    }
    banner.classList.remove('hidden');
  } else if (!banner.classList.contains('hidden') && !banner.classList.contains('fading')) {
    banner.classList.add('fading');
    clearTimeout(bannerFadeTimer);
    bannerFadeTimer = setTimeout(() => banner.classList.add('hidden'), 950);
  }
  let target: Vec & { name: string; hint: string } =
    pin && !pinnedGoal
      ? { x: pin.x, z: pin.z, name: pin.name, hint: 'Your pin · click it again to clear' }
      : journeyTarget(goal, snapshot);
  const drops = snapshot.loot
    .filter((l) => bagItems(l).some((item) => compareGear(c, item).verdict === 'upgrade'))
    .sort((a, b) => distance(a, p) - distance(b, p));
  if (!p.safe && drops[0] && distance(drops[0], p) < 22 && !goal.id.startsWith('first-')) {
    target = {
      ...drops[0],
      name: 'An upgrade is waiting',
      hint: 'X takes the bag · Click an ↑ satchel slot to equip',
    };
  } else if (p.dimension !== 'wilds') {
    const d = snapshot.dungeon;
    if (d?.status === 'ready')
      target = {
        ...d.altar,
        name: d.name,
        hint: `Chamber ${d.stage}/${d.stages} · X at the altar when ready`,
      };
    else if (d?.status === 'cleared')
      target = {
        x: 0,
        z: 25,
        name: 'Expedition complete',
        hint: 'Collect your bags · R to bank rewards and choose the next run',
      };
    else {
      const enemy = [...snapshot.enemies].sort((a, b) => distance(a, p) - distance(b, p))[0];
      target = enemy
        ? {
            ...enemy,
            hint: `${d?.remaining ?? snapshot.enemies.length} guardian${(d?.remaining ?? snapshot.enemies.length) === 1 ? '' : 's'} left · Clear the chamber`,
          }
        : {
            x: 0,
            z: -12,
            name: 'Clear the chamber',
            hint: 'Follow the remaining guardians on the map',
          };
    }
  }
  view.objective = target;
  text('objective-name', target.name);
  text('objective-hint', target.hint);
  text('objective-distance', `${Math.round(distance(p, target))}m · LV ${goal.level}`);
  const from = view.project(p.x, 0, p.z),
    to = view.project(target.x, 0, target.z);
  $('objective-arrow').style.transform =
    `rotate(${Math.atan2(to.y - from.y, to.x - from.x) + Math.PI / 2}rad)`;
  $('journey-compass').classList.toggle(
    'boss-near',
    snapshot.enemies.some((e) => e.boss && distance(e, p) < 30),
  );
}
const localCooldowns = { dash: 0, ability: 0 };
function gameAction(action: Action, id?: string) {
  if (action === 'rally') {
    pendingRally = true;
    autofire = false;
    stopInput();
  }
  if (action === 'dash' && view && snapshot && !panel) {
    const now = performance.now() / 1000;
    if (snapshot.cooldowns.dash > 0.08 || localCooldowns.dash > now) return;
    // Send the current direction before the action so a dodge uses this frame's intent.
    const input = { ...view.localInput, seq: ++seq };
    connection.input(input);
    view.prediction.record(input, now);
    view.prediction.dash(input, now);
    localCooldowns.dash = now + 2.2;
    view.sparks.burst(
      view.prediction.position.x,
      view.prediction.position.z,
      CLASSES[classId].color,
      12,
      view.dimension,
    );
    sound.play('dash');
    view.localEffects.dash = now;
  }
  if (action === 'ability' && view && snapshot && profile?.character && !panel) {
    const now = performance.now() / 1000,
      cls = CLASSES[classId];
    if (localCooldowns.ability > now) return;
    if (snapshot.cooldowns.ability <= 0.08 && snapshot.self.mp >= cls.abilityCost) {
      localCooldowns.ability = now + cls.abilityCooldown;
      view.localEffects.ability = now;
      view.addEffect({
        id: -1,
        kind: 'ability',
        ...view.prediction.position,
        color: cls.color,
        value: cls.ability,
        player: snapshot.self.id,
      });
      view.sparks.burst(
        view.prediction.position.x,
        view.prediction.position.z,
        cls.color,
        22,
        view.dimension,
        2,
      );
    }
  }
  connection.action(action, id);
}
function nearbyLoot() {
  return snapshot
    ? snapshot.loot
        .filter((l) => distance(snapshot!.self, l) < 4)
        .sort((a, b) => distance(snapshot!.self, a) - distance(snapshot!.self, b))
    : [];
}
function cycleLoot() {
  const drops = nearbyLoot(),
    index = drops.findIndex((d) => d.id === groundLootId);
  groundLootId = drops[(index + 1) % drops.length]?.id ?? '';
  updateInteraction();
}
function updateInteraction() {
  if (!snapshot) return;
  const p = snapshot.self;
  let html = '';
  const drops = nearbyLoot();
  const drop = drops.find((d) => d.id === groundLootId) ?? drops[0];
  groundLootId = drop?.id ?? '';
  const showLoot = !!drop && !!profile?.character && !panel;
  $('ground-loot').classList.toggle('hidden', !showLoot);
  document.body.classList.toggle('has-loot', showLoot);
  $('loot-card').classList.toggle('obscured', showLoot || !!panel);
  if (drop && profile?.character) {
    const signature = JSON.stringify([
      drop.id,
      bagItems(drop),
      profile.character.equipment,
      profile.character.level,
      profile.character.inventory.length,
      drops.length,
    ]);
    if (signature !== groundLootSignature) {
      groundLootSignature = signature;
      $('ground-loot').innerHTML = bagHud(profile.character, drop, drops.length);
    }
    if ($('loot-expiry'))
      text('loot-expiry', String(Math.max(0, Math.ceil(drop.expires - snapshot.time))));
    html = ''; // The bag's controls sit beside the satchel, leaving combat unobstructed.
  } else if (p.dimension === 'wilds') {
    const l = LANDMARKS.find((l) => distance(p, l) < 5);
    if (l)
      html = `<kbd>X</kbd><span>${l.id === 'forge' ? 'Meet' : l.id === 'vault' ? 'Open' : 'Enter'} <strong>${esc(l.name)}</strong>${l.id in DUNGEONS ? `<small>${l.id === 'eclipse' ? (profile?.victories ? 'Level 20 required · J for Elder depth' : 'Locked · Defeat the Ashen Sovereign') : 'R returns you home'}</small>` : ''}</span>${icon(l.icon)}`;
  } else if (snapshot.dungeon?.status === 'ready' && distance(p, snapshot.dungeon.altar) < 4)
    html = `<kbd>X</kbd><span>Awaken <strong>${snapshot.dungeon.name}</strong><small>Everyone in this dungeon joins the encounter</small></span>${icon('spark')}`;
  else if (distance(p, { x: 0, z: 23 }) < 5)
    html = `<kbd>X</kbd><span>Return to <strong>The Last Hearth</strong></span>${icon('home')}`;
  $('interaction').innerHTML = html;
  $('interaction').classList.toggle('hidden', !html || !!panel);
}
function interact() {
  if (!snapshot) return;
  const p = snapshot.self;
  const drops = nearbyLoot();
  const loot = drops.find((d) => d.id === groundLootId) ?? drops[0];
  if (loot) {
    gameAction('loot-all', loot.id);
    return;
  }
  if (!loot && p.dimension === 'wilds') {
    const l = LANDMARKS.find((l) => distance(p, l) < 5);
    if (l?.id === 'vault') {
      openPanel('vault');
      return;
    }
    if (l?.id === 'forge') {
      openPanel('forge');
      return;
    }
  }
  connection.action('interact');
}
let announcementTimer: ReturnType<typeof setTimeout>;
function announce(name: string, description: string) {
  const el = $('zone-announcement');
  el.innerHTML = `<span>${esc(name)}</span><p>${esc(description)}</p>`;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(announcementTimer);
  announcementTimer = setTimeout(() => el.classList.remove('show'), 4200);
}
function addChat(line: ChatLine) {
  if (line.senderId && muted.includes(line.senderId)) return;
  const el = document.createElement('div');
  el.className = `chat-line ${line.system ? 'system' : ''}`;
  if (line.senderId) el.dataset.sender = line.senderId;
  el.innerHTML = `<strong>${esc(line.name)}</strong><span>${esc(line.text)}</span>`;
  $('chat-lines').append(el);
  while ($('chat-lines').children.length > 40) $('chat-lines').firstElementChild?.remove();
  $('chat-lines').scrollTop = $('chat-lines').scrollHeight;
}
function openPanel(next: ui.Panel) {
  if (next === 'recap') pendingRecap = false;
  sound.play('click');
  stopInput();
  previousFocus = document.activeElement as HTMLElement;
  panel = next;
  hideItemTooltip();
  renderPanel();
  updateInteraction();
  updateObjective();
  const dialog = document.querySelector<HTMLElement>('.modal');
  dialog?.focus();
  if (next === 'leaderboard') {
    void api<Grave[]>('leaderboard')
      .then((rows) => {
        leaderboard = rows;
        if (panel === 'leaderboard') renderPanel();
      })
      .catch((e) => toast(e.message, 'bad'));
  }
  if (next === 'realms') void refreshRealms();
  if (next === 'atlas') {
    atlasZoom = 1;
    atlasPan = { x: 0, z: 0 };
  }
}
function closePanel() {
  // Embers and shards are named the first time the Smith or the vault is opened, then trusted.
  if ((panel === 'forge' || panel === 'vault') && playing) writeLocal('currencyIntro', true);
  panel = null;
  panelMarkup = '';
  $('modal-root').replaceChildren();
  previousFocus?.focus();
  previousFocus = null;
  if (snapshot) {
    updateInteraction();
    updateObjective();
  }
}
function renderPanel() {
  if (!panel) return;
  let title = '',
    eyebrow = '',
    content = '',
    wide = false;
  if (['inventory', 'vault', 'forge'].includes(panel)) {
    title =
      panel === 'inventory'
        ? 'What you carry'
        : panel === 'vault'
          ? 'What remains'
          : 'The Cinder Smith';
    eyebrow = 'THE LAST HEARTH · EQUIPMENT';
    wide = true;
    content = profile
      ? ui.inventoryPanel(panel, profile, selectedItem, snapshot, gearFilter)
      : '<p class="empty-state">Enter the realm to begin your journey.</p>';
    if ((panel === 'forge' || panel === 'vault') && profile && !readLocal('currencyIntro', false))
      content =
        `<div class="notice-box currency-intro">${icon('flame')} <strong>Embers</strong> outlast this life and temper gear at the Cinder Smith. ${icon('spark')} <strong>Star shards</strong> come from bosses and forge named relics. Gold stays with this traveler.</div>` +
        content;
  }
  if (panel === 'journal') {
    title = 'A thread through the ashes';
    eyebrow = 'YOUR JOURNEY';
    content = ui.journalPanel(profile, snapshot, profile?.pinned);
    wide = true;
  }
  if (panel === 'rally') {
    title = 'Meet me at the entrance';
    eyebrow = 'EXPEDITION RALLY BOARD';
    wide = true;
    content = ui.rallyPanel(profile, snapshot, invitedDungeon);
  }
  if (panel === 'recap') {
    title = 'A storm worth remembering';
    eyebrow = 'YOUR LAST EXPEDITION';
    wide = true;
    content = profile
      ? ui.recapPanel(profile, snapshot)
      : '<p class="empty-state">Enter the realm to begin.</p>';
  }
  if (panel === 'copy') {
    title = 'Copy and carry it with you';
    eyebrow = 'COPY TEXT';
    content = `<p class="panel-intro">Your browser could not access the clipboard. Select and copy the text below.</p><textarea id="manual-copy" rows="4" readonly aria-label="Text to copy">${esc(manualCopyValue)}</textarea>`;
  }
  if (panel === 'guide') {
    title = 'A guide to staying alight';
    eyebrow = 'THE FIELD GUIDE';
    content = ui.guidePanel();
    wide = true;
  }
  if (panel === 'settings') {
    title = 'Make yourself at home';
    eyebrow = 'SETTINGS & YOUR ACCOUNT';
    content = ui.settingsPanel(recoveryCode);
  }
  if (panel === 'recover') {
    title = 'Find your way back';
    eyebrow = 'RESTORE YOUR TRAVELER';
    content = ui.recoverPanel();
  }
  if (panel === 'codex') {
    title = 'The things that survived';
    eyebrow = `BESTIARY · ${profile?.discovered.length ?? 0} STORIES KEPT`;
    content = ui.codexPanel(profile);
    wide = true;
  }
  if (panel === 'leaderboard') {
    title = 'The Hall of Echoes';
    eyebrow = 'EVERY FLAME LEAVES A MEMORY';
    content = ui.leaderboardPanel(leaderboard);
    wide = true;
  }
  if (panel === 'realms') {
    title = 'Find your people';
    eyebrow = 'SHARED REALMS';
    content = ui.realmsPanel(
      realms,
      realmId,
      playing,
      snapshot?.players ?? [],
      muted,
      roster.filter((r) => r.id !== profile?.id),
      selectedTraveler,
      !!snapshot?.self.safe,
      snapshot?.cooldowns.travel ?? 0,
    );
  }
  if (panel === 'atlas') {
    title = 'A world still worth finding';
    eyebrow = 'BRING SOMETHING HOME · ATLAS';
    content = ui.atlasPanel(
      snapshot,
      roster.filter((r) => r.id !== profile?.id),
      selectedTraveler,
      snapshot?.cooldowns.travel ?? 0,
    );
    wide = true;
  }
  if (panel === 'report') {
    title = 'Help keep the Hearth welcoming';
    eyebrow = 'REPORT A TRAVELER';
    content = ui.reportPanel(reportName);
  }
  if (panel === 'delete') {
    title = 'Let this flame go';
    eyebrow = 'DELETE YOUR ACCOUNT';
    content = profile
      ? ui.deletePanel(profile.name)
      : '<p class="empty-state">No account is active in this browser.</p>';
  }
  if (panel === 'death' && grave && profile) {
    title = 'Your flame becomes a memory';
    eyebrow = 'THE END OF THIS JOURNEY';
    content = ui.deathPanel(grave, profile);
  }
  const markup = ui.modalFrame(title, eyebrow, content, wide);
  // Checkpoints often carry unchanged equipment. Keep the DOM, focus and touch scroll stable.
  if (markup === panelMarkup) return;
  panelMarkup = markup;
  const active = document.activeElement as HTMLElement | null;
  const hadFocus = !!active?.closest('.modal');
  const selector = hadFocus
    ? ['id', 'data-item', 'data-game', 'data-id', 'data-panel', 'data-action', 'data-gear-filter']
        .filter((attribute) => active!.hasAttribute(attribute))
        .map((attribute) => `[${attribute}="${CSS.escape(active!.getAttribute(attribute)!)}"]`)
        .join('')
    : '';
  const scroll = document.querySelector('.modal-body')?.scrollTop ?? 0;
  $('modal-root').innerHTML = markup;
  syncFullscreenControls();
  const body = document.querySelector('.modal-body');
  if (body) body.scrollTop = scroll;
  const dialog = document.querySelector<HTMLElement>('.modal');
  if (dialog) dialog.style.animation = 'none';
  if (hadFocus)
    (selector
      ? (document.querySelector<HTMLElement>(`.modal ${selector}`) ?? dialog)
      : dialog
    )?.focus({ preventScroll: true });
  if (panel === 'atlas') drawAtlas();
  updateInteraction();
}
async function refreshRealms() {
  try {
    realms = await api<RealmInfo[]>('realms');
    if (!playing && !entering && realms.length && !realms.some((r) => r.id === realmId)) {
      realmId = (realms.find((r) => r.players < r.capacity) ?? realms[0]).id;
      writeLocal('realm', realmId);
      toast('The previous realm has closed. An open realm is selected for your next journey.');
    }
    text(
      'realm-status',
      `${realms.reduce((n, r) => n + r.players, 0)} travelers · ${realms.length} open realm${realms.length === 1 ? '' : 's'}`,
    );
    if (panel === 'realms') renderPanel();
  } catch {
    text('realm-status', 'Realm unavailable · retry to enter');
  }
}
async function copyText(value: string, message: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast(message, 'good');
  } catch {
    const area = document.createElement('textarea');
    area.value = value;
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      /* use selectable text below */
    }
    area.remove();
    if (ok) toast(message, 'good');
    else {
      manualCopyValue = value;
      openPanel('copy');
      const field = $<HTMLTextAreaElement>('manual-copy');
      field.focus();
      field.select();
    }
  }
}
function renderKit() {
  const c = profile?.character;
  if (!c) return;
  const safe = snapshot?.self.safe ?? true,
    signature = JSON.stringify([c.equipment, c.inventory, c.level, safe]);
  if (kitSignature === signature) return;
  kitSignature = signature;
  $('hud-stats').innerHTML = statHud(c);
  $('hud-kit').innerHTML = kitHud(c, safe);
}
let tooltipTarget: HTMLElement | undefined, tooltipTimer: ReturnType<typeof setTimeout>;
function findHudItem(id: string) {
  const c = profile?.character;
  if (!c) return;
  const bag = nearbyLoot().find((b) => bagItems(b).some((i) => i.id === id));
  const item = [...c.inventory, ...Object.values(c.equipment), ...(bag ? bagItems(bag) : [])].find(
    (i) => i?.id === id,
  );
  return item ? { c, item, bag } : undefined;
}
function hideItemTooltip() {
  clearTimeout(tooltipTimer);
  tooltipTarget = undefined;
  $('item-tooltip').classList.add('hidden');
  applyStatDeltas(null);
}
/** Tint the build rows a hovered item would move, with the delta, using the same comparison
 * the tooltip and the inspector use. No second comparison system. */
function applyStatDeltas(item: Item | null) {
  const c = profile?.character;
  const rows = document.querySelectorAll<HTMLElement>('#hud-stats .stat-row');
  if (!rows.length) return;
  const changed = new Map<string, number>();
  if (c && item) for (const row of compareGear(c, item).changed) changed.set(row.key, row.delta);
  for (const row of rows) {
    const metric = row.dataset.metric ?? '';
    const delta = changed.get(metric);
    const label = row.querySelector<HTMLElement>('.stat-delta');
    row.classList.toggle('up', !!delta && delta > 0);
    row.classList.toggle('down', !!delta && delta < 0);
    if (label)
      label.textContent = delta
        ? `${delta > 0 ? '+' : '−'}${gearNumber(Math.abs(delta))}${metric === 'reduction' ? '%' : ''}`
        : '';
  }
}
function showItemTooltip(target: HTMLElement) {
  const found = findHudItem(target.dataset.hudItem ?? '');
  if (!found || panel) return;
  clearTimeout(tooltipTimer);
  tooltipTarget = target;
  applyStatDeltas(found.item);
  const el = $('item-tooltip');
  el.innerHTML = itemTooltip(found.c, found.item, found.bag);
  el.classList.remove('hidden');
  const rect = target.getBoundingClientRect(),
    bounds = el.getBoundingClientRect();
  const left =
    innerWidth > 900
      ? document.querySelector('.inventory-rail')!.getBoundingClientRect().left - bounds.width - 12
      : Math.max(8, Math.min(innerWidth - bounds.width - 8, rect.left + rect.width - bounds.width));
  const top =
    innerWidth > 900
      ? Math.max(8, Math.min(innerHeight - bounds.height - 8, rect.top))
      : Math.max(8, rect.top - bounds.height - 12);
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${top}px`;
}
$('hud').addEventListener('pointerover', (event) => {
  if (event.pointerType === 'touch') return;
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-hud-item]');
  if (target && tooltipTarget !== target) showItemTooltip(target);
  else if (target) clearTimeout(tooltipTimer);
});
$('hud').addEventListener('focusin', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-hud-item]');
  if (target) showItemTooltip(target);
});
$('hud').addEventListener('pointerout', (event) => {
  if ((event.target as HTMLElement).closest('[data-hud-item]'))
    tooltipTimer = setTimeout(hideItemTooltip, 220);
});
$('item-tooltip').addEventListener('pointerenter', () => clearTimeout(tooltipTimer));
$('item-tooltip').addEventListener('pointerleave', () => {
  tooltipTimer = setTimeout(hideItemTooltip, 160);
});
$('hud-kit').addEventListener('contextmenu', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-hud-item]');
  const item = profile?.character?.inventory.find((i) => i.id === target?.dataset.hudItem);
  if (!item) return;
  event.preventDefault();
  hideItemTooltip();
  gameAction('drop', item.id);
});
$('world').addEventListener('pointerdown', hideItemTooltip);
$('app').addEventListener('click', (event) => {
  const atlas = (event.target as HTMLElement).closest<HTMLCanvasElement>('canvas#atlas');
  if (atlas) {
    // Names on the large map are click targets; the travel control appears beneath the map.
    const rect = atlas.getBoundingClientRect(),
      x = ((event.clientX - rect.left) / rect.width) * atlas.width,
      y = ((event.clientY - rect.top) / rect.height) * atlas.height;
    // A drag that moved is a pan, not a pin.
    const dragged = (atlasDrag?.moved ?? 0) > 6;
    atlasDrag = undefined;
    if (dragged) return;
    const hit = atlasHits.find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
    if (hit?.kind === 'place') {
      setPin(hit.id);
      return;
    }
    selectedTraveler = hit ? hit.id : '';
    renderPanel();
    return;
  }
  const target = (event.target as HTMLElement).closest<HTMLElement>('button,[data-action]');
  if (!target || target.hasAttribute('disabled')) return;
  if (target.dataset.inspect) {
    selectedItem = target.dataset.inspect;
    openPanel('inventory');
    return;
  }
  if (target.dataset.hudItem) {
    const item = findHudItem(target.dataset.hudItem);
    if (!item) return;
    if (matchMedia('(hover: none)').matches || event.detail === 0) showItemTooltip(target);
    else if (item.bag) {
      hideItemTooltip();
      gameAction(event.shiftKey ? 'loot-equip' : 'loot', `${item.bag.id}:${item.item.id}`);
    } else if (compareGear(item.c, item.item).verdict !== 'equipped') {
      hideItemTooltip();
      gameAction('equip', item.item.id);
    } else {
      selectedItem = item.item.id;
      openPanel('inventory');
    }
    return;
  }
  const cls = target.dataset.class as ClassId | undefined;
  if (cls && !profile?.character) {
    classId = cls;
    writeLocal('class', cls);
    sound.play('click');
    renderTitle();
    return;
  }
  if (target.dataset.panel) {
    openPanel(target.dataset.panel as ui.Panel);
    return;
  }
  if (target.dataset.gearFilter) {
    gearFilter = target.dataset.gearFilter as GearFilter;
    renderPanel();
    return;
  }
  if (target.dataset.item) {
    selectedItem = target.dataset.item;
    renderPanel();
    return;
  }
  if (target.dataset.realm) {
    realmId = target.dataset.realm;
    writeLocal('realm', realmId);
    renderPanel();
    return;
  }
  if (target.dataset.game) {
    if (!playing) {
      toast('Enter the wilds to begin.');
      return;
    }
    const action = target.dataset.game as Action;
    hideItemTooltip();
    if (action === 'recall' || action === 'travel') {
      closePanel();
      autofire = false;
      stopInput();
    }
    if (action === 'interact') interact();
    else gameAction(action, target.dataset.id);
    return;
  }
  const a = target.dataset.action;
  if (a === 'fullscreen') {
    stopInput();
    void toggleFullscreen().catch(() =>
      toast('Fullscreen could not open. Try the fullscreen control in your browser menu.', 'bad'),
    );
    return;
  }
  if (a === 'follow-journey') {
    closePanel();
    (document.activeElement as HTMLElement)?.blur();
    updateObjective();
    return;
  }
  if (a === 'select-traveler') {
    selectedTraveler = target.dataset.id ?? '';
    renderPanel();
    return;
  }
  if (a === 'journey-rally' && profile?.character && snapshot?.self.safe) {
    const goal = journeyGoal(profile, snapshot);
    if (goal.dungeon) {
      if (goal.depth) gameAction('attune', String(goal.depth));
      gameAction('rally', goal.dungeon);
    }
    return;
  }
  if (a === 'pin-goal') {
    setPin(target.dataset.id ?? '');
    return;
  }
  if (a === 'minimap-zoom') {
    cycleMinimapZoom();
    return;
  }
  if (a === 'cycle-loot') cycleLoot();
  if (a === 'zoom-in') view?.changeZoom(0.85);
  if (a === 'zoom-out') view?.changeZoom(1 / 0.85);
  if (a === 'camera-reset') {
    view?.resetCamera();
    syncTiltControl();
    writeLocal('settings', settings);
  }
  if (a === 'rotate-left' || a === 'rotate-right')
    view?.orbit(a === 'rotate-left' ? 1 : -1, Math.PI / 8 / CAMERA.rotationSpeed);
  if (a === 'mute') {
    const id = target.dataset.id!;
    muted = muted.includes(id) ? muted.filter((x) => x !== id) : [...muted, id];
    writeLocal('muted', muted);
    for (const el of document.querySelectorAll<HTMLElement>('.chat-line'))
      if (el.dataset.sender && muted.includes(el.dataset.sender)) el.remove();
    renderPanel();
  }
  if (a === 'report') {
    reportTarget = target.dataset.id!;
    reportName = target.dataset.name!;
    openPanel('report');
  }
  if (a === 'close') {
    if (panel === 'death') returnToTitle();
    else closePanel();
  }
  if (a === 'title' || a === 'rise') returnToTitle();
  if (a === 'sound') {
    settings.volume = settings.volume > 0 ? 0 : 0.35;
    writeLocal('settings', settings);
    sound.start();
    sound.update();
    target.innerHTML = icon(settings.volume ? 'volume' : 'mute');
  }
  if (a === 'autofire') {
    autofire = !autofire;
    text('attack-label', autofire ? 'Auto on' : 'Attack');
    target.classList.toggle('active', autofire);
  }
  if (a === 'copy-recovery')
    void copyText(recoveryCode, 'Recovery code copied. Keep it somewhere private.');
  if (a === 'download-recovery') {
    const blob = new Blob(
      [
        `BRING SOMETHING HOME — YOUR PRIVATE RECOVERY CODE\n\nTraveler: ${profile?.name ?? 'Traveler'}\nServer: ${location.origin}\nCode: ${recoveryCode}\n\nKeep this file private. Anyone with this code can restore your account.\nOpen Settings → Restore a different traveler to recover your progress.\n`,
      ],
      { type: 'text/plain' },
    );
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = 'bring-something-home-recovery.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (a === 'invite') {
    void copyText(
      invitationUrl(location.origin, realmId),
      'Invitation copied. Your friends will join this realm.',
    );
  }
  if (
    a === 'expedition-invite' &&
    target.dataset.id &&
    Object.hasOwn(DUNGEONS, target.dataset.id)
  ) {
    const dim = target.dataset.id as DungeonId;
    void copyText(
      invitationUrl(location.origin, realmId, dim),
      `Invitation copied for ${DUNGEONS[dim].name}.`,
    );
  }
  if (a === 'save-victory' && profile?.lastExpedition) {
    target.setAttribute('disabled', '');
    void saveVictoryCard(
      profile.name,
      profile.lastExpedition,
      invitationUrl(location.origin, realmId, profile.lastExpedition.dimension),
    )
      .then(() => toast('Victory card saved. Share it with your next crew.', 'good'))
      .catch(() =>
        toast(
          'This browser could not save the card. You can still copy the run invitation.',
          'bad',
        ),
      )
      .finally(() => target.removeAttribute('disabled'));
  }
  if (a === 'dismiss-loot') {
    quickEquipId = '';
    $('loot-card').classList.add('hidden');
  }
  if (a === 'new-realm') {
    if (!token) {
      toast('Enter the world once to create your account, then open a realm.');
      return;
    }
    target.setAttribute('disabled', '');
    void api<RealmInfo>('realms', {}, token)
      .then((r) => {
        realmId = r.id;
        writeLocal('realm', realmId);
        toast(`${r.name} is ready.`, 'good');
        return refreshRealms();
      })
      .catch((e) => {
        toast(e.message, 'bad');
        renderPanel();
      });
  }
});
$('app').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  if (form.id === 'enter-form') void enter();
  if (form.id === 'chat-form') {
    const input = $<HTMLInputElement>('chat-input'),
      message = input.value.trim();
    if (message) connection.send({ type: 'chat', text: message });
    input.value = '';
    input.blur();
  }
  if (form.id === 'report-form') {
    const reason = $<HTMLTextAreaElement>('report-reason').value;
    const button = form.querySelector('button')!;
    button.disabled = true;
    void api('reports', { target: reportTarget, reason }, token)
      .then(() => {
        closePanel();
        toast('Report saved for the server operator.', 'good');
      })
      .catch((e) => {
        text('report-error', e.message);
        button.disabled = false;
      });
  }
  if (form.id === 'delete-form') {
    const name = $<HTMLInputElement>('delete-name').value;
    const button = form.querySelector('button')!;
    button.disabled = true;
    void api('account', { name }, token, 'DELETE')
      .then(() => {
        connection.close();
        playing = false;
        profile = null;
        token = '';
        recoveryCode = '';
        writeLocal('token', '');
        writeLocal('recovery', '');
        writeLocal('name', '');
        $<HTMLInputElement>('traveler-name').value = '';
        returnToTitle();
        toast('Your account and live progress have been deleted.');
      })
      .catch((e) => {
        text('delete-error', e.message);
        button.disabled = false;
      });
  }
  if (form.id === 'recover-form') {
    const code = $<HTMLTextAreaElement>('recovery-code').value.trim().toLowerCase();
    const button = form.querySelector('button')!;
    button.disabled = true;
    void api<{ token: string; profile: Profile }>('recover', { recoveryCode: code })
      .then((result) => {
        if (playing) returnToTitle();
        saveAccount({ ...result, recoveryCode: code });
        closePanel();
        renderTitle();
        toast(`Welcome back, ${profile!.name}.`, 'good');
      })
      .catch((e) => {
        text('recovery-error', e.message);
        button.disabled = false;
      });
  }
});
$('app').addEventListener('input', (event) => {
  const input = event.target as HTMLInputElement | HTMLSelectElement,
    key = input.dataset.setting as keyof typeof settings | undefined;
  if (!key) return;
  if (key === 'cameraTilt') {
    view?.setTilt(Number(input.value));
    syncTiltControl();
  } else if (key === 'volume' || key === 'allyShots') settings[key] = Number(input.value);
  else if (key === 'quality') settings.quality = input.value === 'low' ? 'low' : 'high';
  else (settings[key] as boolean) = (input as HTMLInputElement).checked;
  writeLocal('settings', settings);
  sound.start();
  sound.update();
  if (key === 'quality') view?.applySettings();
  document.body.classList.toggle('reduce-motion', settings.reducedMotion);
});
function syncTiltControl() {
  $<HTMLInputElement>('camera-tilt').value = String(settings.cameraTilt);
  text('tilt-value', `${Math.round(settings.cameraTilt)}°`);
}
$('camera-tilt').addEventListener('pointerup', () => $('camera-tilt').blur());
const atlasPointers = new Map<number, { x: number; y: number }>();
function atlasScale(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  return (
    ((Math.min(canvas.width, canvas.height) / (ISLAND.radius * 2 + 24)) * atlasZoom * rect.width) /
    canvas.width
  );
}
$('modal-root').addEventListener('pointerdown', (e) => {
  const canvas = (e.target as HTMLElement).closest<HTMLCanvasElement>('canvas#atlas');
  if (!canvas) return;
  atlasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  if (atlasPointers.size === 1)
    atlasDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
  else if (atlasPointers.size === 2) {
    const [a, b] = [...atlasPointers.values()];
    atlasPinch = Math.hypot(a.x - b.x, a.y - b.y);
    atlasDrag = undefined;
  }
});
$('modal-root').addEventListener('pointermove', (e) => {
  if (!atlasPointers.has(e.pointerId)) return;
  const canvas = document.getElementById('atlas') as HTMLCanvasElement | null;
  if (!canvas) return;
  atlasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (atlasPointers.size === 2 && atlasPinch) {
    const [a, b] = [...atlasPointers.values()];
    const spread = Math.hypot(a.x - b.x, a.y - b.y);
    if (spread > 4) {
      zoomAtlas(spread / atlasPinch);
      atlasPinch = spread;
    }
    return;
  }
  if (atlasDrag?.id !== e.pointerId) return;
  const scale = atlasScale(canvas);
  const dx = e.clientX - atlasDrag.x,
    dy = e.clientY - atlasDrag.y;
  atlasDrag.moved += Math.hypot(dx, dy);
  atlasDrag.x = e.clientX;
  atlasDrag.y = e.clientY;
  if (atlasZoom > 1) {
    atlasPan.x -= dx / scale;
    atlasPan.z -= dy / scale;
    clampAtlasPan();
    drawAtlas();
  }
});
for (const type of ['pointerup', 'pointercancel'] as const)
  $('modal-root').addEventListener(type, (e) => {
    atlasPointers.delete((e as PointerEvent).pointerId);
    if (atlasPointers.size < 2) atlasPinch = 0;
  });
$('modal-root').addEventListener(
  'wheel',
  (e) => {
    if (!(e.target as HTMLElement).closest('canvas#atlas')) return;
    e.preventDefault();
    zoomAtlas(Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) * 0.0016));
  },
  { passive: false },
);
$('modal-root').addEventListener('click', (e) => {
  if ((e.target as HTMLElement).classList.contains('modal-backdrop') && panel !== 'death')
    closePanel();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab' && panel) {
    const focusable = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.modal button:not([disabled]),.modal input,.modal select,.modal textarea,.modal a',
      ),
    ).filter((el) => el.offsetParent !== null);
    const first = focusable[0],
      last = focusable.at(-1);
    if (
      e.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === document.querySelector('.modal'))
    ) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
    return;
  }
  const typing = e.target instanceof HTMLElement && e.target.matches('input,textarea,select');
  if (e.code === 'Escape') {
    if (isFullscreen()) {
      stopInput();
      return;
    }
    e.preventDefault();
    if (typing) (e.target as HTMLElement).blur();
    else if (panel) {
      if (panel === 'death') returnToTitle();
      else closePanel();
    } else openPanel('settings');
    stopInput();
    return;
  }
  if (typing) return;
  if (
    ['Enter', 'Space'].includes(e.code) &&
    e.target instanceof HTMLElement &&
    e.target.closest('button,a,summary,[role="button"]')
  )
    return;
  if (!playing) return;
  if (e.code === 'KeyR') {
    e.preventDefault();
    closePanel();
    autofire = false;
    stopInput();
    connection.action('recall');
    return;
  }
  if (panel) return;
  if (
    [
      'Space',
      'ShiftLeft',
      'ShiftRight',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'PageUp',
      'PageDown',
    ].includes(e.code)
  )
    e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Space') gameAction('ability');
  if (
    (e.code === 'ShiftLeft' || e.code === 'ShiftRight') &&
    !document.elementFromPoint(pointerX, pointerY)?.closest('.inventory-rail, .item-tooltip')
  )
    gameAction('dash');
  if (e.code === 'KeyF') connection.action('potion');
  if (e.code === 'KeyX') interact();
  if (e.code === 'Tab' && nearbyLoot().length) {
    e.preventDefault();
    cycleLoot();
  }
  if (e.code === 'KeyG') {
    // G wears the best carried upgrade, not only the one on a fading pickup card.
    const c = profile?.character;
    const upgrade =
      quickEquipId ||
      c?.inventory.find((item) => compareGear(c, item).verdict === 'upgrade')?.id ||
      '';
    if (upgrade) gameAction('equip', upgrade);
  }
  if (e.code === 'KeyI') {
    autofire = !autofire;
    text('attack-label', autofire ? 'Auto on' : 'Attack');
    document.querySelector('.skill.weapon')?.classList.toggle('active', autofire);
  }
  if (e.code === 'KeyN') {
    cycleMinimapZoom();
    return;
  }
  if (e.code === 'KeyC') {
    bestiaryHeldAt = performance.now();
    if (view) view.bestiary = true;
    return;
  }
  const panels: Record<string, ui.Panel> = {
    KeyB: 'inventory',
    KeyM: 'atlas',
    KeyJ: 'journal',
    KeyP: 'rally',
  };
  if (panels[e.code]) openPanel(panels[e.code]);
  if (e.code === 'Enter') {
    e.preventDefault();
    stopInput();
    $<HTMLInputElement>('chat-input').focus();
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'KeyC' && bestiaryHeldAt) {
    const held = performance.now() - bestiaryHeldAt;
    bestiaryHeldAt = 0;
    if (view) view.bestiary = false;
    if (held < 250 && playing && !panel) openPanel('codex');
  }
  if (e.code === 'PageUp' || e.code === 'PageDown') writeLocal('settings', settings);
});
window.addEventListener('blur', stopInput);
document.addEventListener('visibilitychange', () => {
  stopInput();
  if (document.hidden) {
    if (playing) connection.action('recall');
    void sound.ctx?.suspend();
  } else if (playing) void sound.ctx?.resume();
});
window.addEventListener('pointermove', (e) => {
  if (cameraDrag?.id === e.pointerId && view && !panel) {
    view.orbit(((e.clientX - cameraDrag.x) * 0.005) / CAMERA.rotationSpeed, 1);
    view.setTilt(settings.cameraTilt + (e.clientY - cameraDrag.y) * 0.2);
    cameraDrag.x = e.clientX;
    cameraDrag.y = e.clientY;
    syncTiltControl();
  }
  if (e.pointerType === 'touch') return;
  pointerX = e.clientX;
  pointerY = e.clientY;
});
$('world').addEventListener('pointerdown', (e) => {
  if (!playing || panel) return;
  sound.start();
  if (e.button === 0) fire = true;
  if (e.button === 2) gameAction('dash');
  if (e.button === 1) {
    e.preventDefault();
    cameraDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    $('world').setPointerCapture(e.pointerId);
  }
});
window.addEventListener('pointerup', () => {
  fire = false;
  if (cameraDrag) {
    cameraDrag = undefined;
    writeLocal('settings', settings);
  }
});
$('world').addEventListener('contextmenu', (e) => e.preventDefault());
$('app').addEventListener(
  'wheel',
  (e) => {
    if (!playing || panel || (e.target as HTMLElement).closest('.chat-lines,input,textarea,select'))
      return;
    e.preventDefault();
    hideItemTooltip();
    if (view) view.changeZoom(Math.exp(Math.max(-120, Math.min(120, e.deltaY)) * 0.0015));
  },
  { passive: false },
);
$<HTMLInputElement>('chat-input').addEventListener('focus', stopInput);
for (const [id, isAim] of [
  ['move-stick', false],
  ['aim-stick', true],
] as const) {
  const el = $(id);
  let pointer = -1;
  const move = (e: PointerEvent) => {
    if (pointer !== e.pointerId) return;
    const r = el.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / 35,
      z = (e.clientY - r.top - r.height / 2) / 35;
    const n = Math.max(1, Math.hypot(x, z));
    x /= n;
    z /= n;
    if (isAim) touchAim = { x, z };
    else touchMove = { x, z };
    el.querySelector<HTMLElement>('i')!.style.transform = `translate(${x * 25}px,${z * 25}px)`;
  };
  el.addEventListener('pointerdown', (e) => {
    pointer = e.pointerId;
    el.setPointerCapture(pointer);
    sound.start();
    move(e);
  });
  el.addEventListener('pointermove', move);
  const end = () => {
    pointer = -1;
    if (isAim) touchAim = { x: 0, z: 0 };
    else touchMove = { x: 0, z: 0 };
    el.querySelector<HTMLElement>('i')!.style.transform = '';
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}
if (view)
  view.onFrame = (dt) => {
    if (connection.pendingSnapshot) {
      const pending = connection.pendingSnapshot;
      connection.pendingSnapshot = undefined;
      onMessage(pending);
    }
    if (!playing || !snapshot) return;
    if (quickEquipUntil && performance.now() > quickEquipUntil) {
      quickEquipId = '';
      quickEquipUntil = 0;
      $('loot-card').classList.add('hidden');
    }
    totalPlaying += dt;
    sendTimer += dt;
    hudTimer += dt;
    const typing = document.activeElement?.matches('input,textarea,select');
    let x = 0,
      z = 0;
    if (!panel && !typing) {
      const tilt = (keys.has('PageUp') ? 1 : 0) - (keys.has('PageDown') ? 1 : 0);
      if (tilt) {
        view!.setTilt(settings.cameraTilt + tilt * CAMERA.tiltSpeed * dt);
        syncTiltControl();
      }
      const rotation = (keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0);
      if (rotation) {
        view!.orbit(rotation, dt);
        updateObjective();
      }
      $('camera-north').style.transform = `rotate(${view!.yaw}rad)`;
      x =
        (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
        (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) +
        touchMove.x;
      z =
        (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
        (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) +
        touchMove.z;
    }
    const m = view!.screenMove(x, z),
      norm = Math.max(1, Math.hypot(m.x, m.z));
    const p = view!.prediction.position;
    const aim = view!.aim(pointerX, pointerY),
      ta = view!.screenMove(touchAim.x, touchAim.z);
    const touchFiring = Math.hypot(touchAim.x, touchAim.z) > 0.25;
    const firing = !panel && !typing && (fire || autofire || touchFiring);
    const input: Input = {
      x: m.x / norm,
      z: m.z / norm,
      angle: touchFiring ? Math.atan2(ta.z, ta.x) : Math.atan2(aim.z - p.z, aim.x - p.x),
      fire: firing,
      seq,
    };
    view!.aimDistance = distance(p, aim);
    const signature = `${input.x.toFixed(2)},${input.z.toFixed(2)},${firing}`;
    if (sendTimer >= 0.05 || signature !== lastSentInput) {
      sendTimer %= 0.05;
      input.seq = ++seq;
      lastSentInput = signature;
      connection.input(input);
      view!.prediction.record(input, performance.now() / 1000);
    }
    view!.control(input, dt, performance.now() / 1000);
    if (x || z) moved += dt;
    if (firing) shots += dt;
    paintMinimap();
    if (hudTimer > 0.3) {
      hudTimer = 0;
      const c = profile?.character;
      let hint = '';
      if (totalPlaying < 90 && c && c.level < 3) {
        if (moved < 2) hint = '<kbd>W A S D</kbd> A new world begins with a first step.';
        else if (snapshot.self.safe)
          hint = 'Trouble is at the gate. Head north. <kbd>M</kbd> opens your map.';
        else if (shots < 2)
          hint = '<kbd>LMB</kbd> Hold to fire. Keep moving between the glowing shots.';
        else hint = '<kbd>SPACE</kbd> Use your class ability. <kbd>R</kbd> always brings you home.';
      }
      if (!snapshot.self.safe && snapshot.self.hp < snapshot.self.maxHp * 0.3)
        hint = '<kbd>F</kbd> Drink a tonic · <kbd>R</kbd> Return safely to the Hearth';
      text('attack-label', autofire ? 'Auto on' : 'Attack');
      $('onboarding').innerHTML = hint;
      $('onboarding').classList.toggle('hidden', !hint);
    }
  };
renderTitle();
document.body.classList.toggle('reduce-motion', settings.reducedMotion);
void Promise.allSettled([
  refreshRealms(),
  token
    ? api<Profile>('profile', undefined, token)
        .then((p) => {
          profile = p;
          renderTitle();
        })
        .catch((e) => {
          $('entry-error').textContent = e.message;
          toast('Use your recovery code in Settings if your account is unavailable.', 'bad');
        })
    : Promise.resolve(),
]);
