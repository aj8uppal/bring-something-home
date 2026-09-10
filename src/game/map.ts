import { CLASSES, HAVEN } from '../../shared/content';
import { ISLAND, propsInBox, PROPS } from '../../shared/world';
import { WILDS_RADIUS } from '../../shared/places';
import { templateOf } from '../../shared/instances';
import {
  DUNGEON_PLACES,
  OVERWORLD,
  PLACES,
  ROADS,
  SETPIECES,
  WANDERING_STAR,
  type Place,
} from '../../shared/places';
import { WARDENS } from '../../shared/progression';
import { bagStyle, LOOT_BAGS } from '../../shared/gear';
import type { RosterEntry, Snapshot, Vec } from '../../shared/types';

/** The three minimap framings, in world units across the canvas. `N` cycles them. */
export const MINIMAP_SPANS = [60, 120, 240];

/** One shared palette for both maps and the atlas legend, so nothing drifts. */
export const MAP_COLORS = {
  ground: '#5c6e5b',
  backdrop: '#172a2b',
  grid: '#79938818',
  road: '#cabe9277',
  rim: '#b7c1a655',
  self: '#fff0bd',
  traveler: '#a7dcd2',
  enemy: '#e49987',
  boss: '#f2be86',
  loot: '#ded1a8',
  objective: '#ffe2a5',
  pin: '#c9a6f0',
  event: '#edc177',
  sealBroken: '#77938d',
  sealStanding: '#dfbd85',
} as const;

/** A clickable region on the atlas, in canvas pixels. */
export interface MapHit {
  kind: 'traveler' | 'place';
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapPin {
  id: string;
  name: string;
  x: number;
  z: number;
}

export interface MapView {
  mode: 'minimap' | 'atlas';
  snapshot?: Snapshot;
  objective?: (Vec & { name: string }) | null;
  roster?: RosterEntry[];
  selected?: string;
  /** Minimap framing in world units across. Ignored by the atlas. */
  span?: number;
  pin?: MapPin | null;
  /** Places this character has entered, for the atlas fog of discovery. */
  visited?: string[];
  /** Interpolated player position, so the dot moves at frame rate between snapshots. */
  self?: (Vec & { angle: number }) | null;
  /** False draws the world only, leaving the arrow and chevrons to the per-frame overlay. */
  overlay?: boolean;
  /** Atlas pan and zoom, for touch and the wheel. 1 fits the realm. */
  atlasZoom?: number;
  atlasPan?: Vec;
}
export const ATLAS_ZOOM = { min: 1, max: 4 };

type Project = (x: number, z: number) => readonly [number, number];

/** Everyone in this dimension, at any distance: the roster (1 Hz) refreshed by live neighbours. */
function travelers(snapshot: Snapshot, roster: RosterEntry[]) {
  const live = new Map(snapshot.players.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const list: RosterEntry[] = [];
  for (const r of roster) {
    if (r.id === snapshot.self.id || r.dimension !== snapshot.self.dimension) continue;
    const p = live.get(r.id);
    list.push(p ? { ...r, x: p.x, z: p.z, level: p.level } : r);
    seen.add(r.id);
  }
  for (const p of snapshot.players)
    if (!seen.has(p.id))
      list.push({
        id: p.id,
        name: p.name,
        classId: p.classId,
        level: p.level,
        dimension: p.dimension,
        x: p.x,
        z: p.z,
      });
  return list;
}

function drawTravelers(
  ctx: CanvasRenderingContext2D,
  list: RosterEntry[],
  at: Project,
  large: boolean,
  selected: string,
  hits: MapHit[],
  width: number,
) {
  // Light density shading where three or more travelers gather.
  for (const p of list) {
    const near = list.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < 12).length;
    if (near < 3) continue;
    const [x, y] = at(p.x, p.z);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, large ? 30 : 14);
    glow.addColorStop(0, '#a7dcd22a');
    glow.addColorStop(1, '#a7dcd200');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 30, y - 30, 60, 60);
  }
  for (const p of list) {
    const [x, y] = at(p.x, p.z),
      color = CLASSES[p.classId]?.color ?? MAP_COLORS.traveler,
      r = large ? 4.5 : 3;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#122522';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (p.id === selected) {
      ctx.strokeStyle = MAP_COLORS.objective;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (!large) continue;
    ctx.font = '600 10px system-ui';
    ctx.textAlign = 'center';
    const label = `${p.name} · ${p.level}`,
      w = ctx.measureText(label).width + 10,
      lx = Math.max(w / 2 + 2, Math.min(width - w / 2 - 2, x)),
      ly = y - 10;
    ctx.fillStyle = p.id === selected ? '#3a4d33ee' : '#152b28d8';
    ctx.fillRect(lx - w / 2, ly - 11, w, 15);
    ctx.fillStyle = p.id === selected ? MAP_COLORS.objective : color;
    ctx.fillText(label, lx, ly);
    hits.push({ kind: 'traveler', id: p.id, name: p.name, x: lx - w / 2, y: ly - 11, w, h: 15 });
  }
}

/** The player arrow, drawn last so nothing hides it. */
function drawSelf(ctx: CanvasRenderingContext2D, px: number, py: number, angle: number) {
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle + Math.PI / 2);
  ctx.fillStyle = MAP_COLORS.self;
  ctx.shadowColor = '#f1c97a';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 5);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Anything worth walking toward that has left the viewport, pinned to the edge as a chevron. */
interface Marker {
  x: number;
  z: number;
  color: string;
  glyph?: string;
}
function drawEdgeMarkers(
  ctx: CanvasRenderingContext2D,
  markers: Marker[],
  at: Project,
  w: number,
  h: number,
) {
  const pad = 11;
  for (const m of markers) {
    const [mx, my] = at(m.x, m.z);
    const inside = mx >= pad && mx <= w - pad && my >= pad && my <= h - pad;
    if (inside) continue;
    // Clamp along the ray from the centre so the chevron sits on the bearing to the target.
    const cx = w / 2,
      cy = h / 2;
    const dx = mx - cx,
      dy = my - cy;
    const scale = Math.min(
      Math.abs(dx) < 1e-6 ? Infinity : (w / 2 - pad) / Math.abs(dx),
      Math.abs(dy) < 1e-6 ? Infinity : (h / 2 - pad) / Math.abs(dy),
    );
    const ex = cx + dx * scale,
      ey = cy + dy * scale;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, 4.5);
    ctx.lineTo(-4, -4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (m.glyph) {
      ctx.fillStyle = m.color;
      ctx.font = 'bold 8px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const gx = Math.max(9, Math.min(w - 9, ex - dx * 0.06));
      const gy = Math.max(9, Math.min(h - 9, ey - dy * 0.06));
      ctx.fillText(m.glyph, gx, gy);
      ctx.textBaseline = 'alphabetic';
    }
  }
}

/** Enemies, loot and the objective ring: the live layer both framings share. */
function drawLive(
  ctx: CanvasRenderingContext2D,
  snapshot: Snapshot,
  at: Project,
  large: boolean,
  bossRings: boolean,
) {
  for (const l of snapshot.loot) {
    const [x, y] = at(l.x, l.z);
    ctx.fillStyle = LOOT_BAGS[bagStyle(l.item)]?.color ?? MAP_COLORS.loot;
    ctx.fillRect(x - 1.5, y - 1.5, 4, 4);
  }
  for (const e of snapshot.enemies) {
    const [x, y] = at(e.x, e.z);
    ctx.fillStyle = e.boss ? MAP_COLORS.boss : MAP_COLORS.enemy;
    ctx.beginPath();
    ctx.arc(x, y, e.boss ? (large ? 5 : 4) : 2, 0, Math.PI * 2);
    ctx.fill();
    if (e.boss && bossRings) {
      // A ring that empties as the boss does: a fight in progress reads at a glance.
      ctx.strokeStyle = MAP_COLORS.boss;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, e.hp / e.maxHp));
      ctx.stroke();
    }
  }
}

function drawObjective(
  ctx: CanvasRenderingContext2D,
  target: Vec & { name: string },
  at: Project,
  px: number,
  py: number,
  large: boolean,
  w: number,
  color: string,
) {
  const [tx, ty] = at(target.x, target.z);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = large ? 2 : 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(tx, ty, large ? 10 : 6, 0, Math.PI * 2);
  ctx.stroke();
  if (large) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px system-ui';
    const labelWidth = ctx.measureText(target.name).width;
    const labelX = Math.max(labelWidth / 2 + 10, Math.min(w - labelWidth / 2 - 10, tx));
    ctx.fillStyle = '#182c29ee';
    ctx.fillRect(labelX - labelWidth / 2 - 7, ty - 38, labelWidth + 14, 20);
    ctx.fillStyle = color;
    ctx.fillText(target.name, labelX, ty - 24);
  }
  ctx.restore();
}

/** A dungeon interior: a plain room box, since there is no terrain to place. */
function drawInterior(
  ctx: CanvasRenderingContext2D,
  view: MapView,
  snapshot: Snapshot,
  w: number,
  h: number,
  hits: MapHit[],
) {
  const large = view.mode === 'atlas';
  const cx = w / 2,
    cy = h * (large ? 0.51 : 0.5);
  const s = (Math.min(w, h) / (large ? 196 : 189)) * 2;
  const at: Project = (x, z) => [cx + x * s, cy + z * s] as const;
  const template = templateOf(snapshot.self.dimension);
  ctx.fillStyle =
    template === 'hollow' ? '#455e5b' : template === 'eclipse' ? '#49445f' : '#615246';
  ctx.strokeStyle = '#bea779';
  ctx.lineWidth = 2;
  ctx.fillRect(cx - 30 * s, cy - 30 * s, 60 * s, 60 * s);
  ctx.strokeRect(cx - 30 * s, cy - 30 * s, 60 * s, 60 * s);
  drawLive(ctx, snapshot, at, large, large);
  if (snapshot.dungeon?.status === 'ready') {
    const [ax, ay] = at(snapshot.dungeon.altar.x, snapshot.dungeon.altar.z);
    ctx.fillStyle = '#dcc1ff';
    ctx.beginPath();
    ctx.arc(ax, ay, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  drawTravelers(
    ctx,
    travelers(snapshot, view.roster ?? []),
    at,
    large,
    view.selected ?? '',
    hits,
    w,
  );
  const self = view.self ?? snapshot.self;
  const [px, py] = at(self.x, self.z);
  drawSelf(ctx, px, py, self.angle);
  // The way home, always in the same corner of the room.
  ctx.fillStyle = '#addad2';
  ctx.fillRect(cx - 4, cy + 25 * s - 4, 8, 8);
  return hits;
}

/** Match the backing store to the element box so circles stay circles at any rail width. */
export function fitCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const ratio = Math.min(2, devicePixelRatio || 1);
  const w = Math.round(rect.width * ratio),
    h = Math.round(rect.height * ratio);
  if (canvas.width === w && canvas.height === h) return false;
  canvas.width = w;
  canvas.height = h;
  return true;
}

export function drawMap(canvas: HTMLCanvasElement, view: MapView): MapHit[] {
  const hits: MapHit[] = [];
  const ctx = canvas.getContext('2d');
  if (!ctx) return hits;
  const w = canvas.width,
    h = canvas.height;
  const large = view.mode === 'atlas';
  const snapshot = view.snapshot;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = MAP_COLORS.backdrop;
  ctx.fillRect(0, 0, w, h);
  if (snapshot && snapshot.self.dimension !== 'wilds')
    return drawInterior(ctx, view, snapshot, w, h, hits);

  const self = view.self ?? snapshot?.self ?? { x: 0, z: 22, angle: -Math.PI / 2 };
  // The minimap follows the player; the atlas fits the island.
  const span = view.span ?? MINIMAP_SPANS[1];
  const zoom = large ? Math.max(ATLAS_ZOOM.min, Math.min(ATLAS_ZOOM.max, view.atlasZoom ?? 1)) : 1;
  const scale = large ? (Math.min(w, h) / (WILDS_RADIUS * 2 + 16)) * zoom : w / span;
  const pan = large ? (view.atlasPan ?? { x: 0, z: 0 }) : { x: 0, z: 0 };
  const originX = (large ? 0 : self.x) + pan.x;
  const originZ = (large ? ISLAND.z : self.z) + pan.z;
  const cx = w / 2,
    cy = large ? h * 0.51 : h / 2;
  const at: Project = (x, z) => [cx + (x - originX) * scale, cy + (z - originZ) * scale] as const;

  // Visible world box, used to skip everything off screen.
  const halfW = w / 2 / scale,
    halfH = h / 2 / scale;
  const minX = originX - halfW,
    maxX = originX + halfW,
    minZ = originZ - halfH,
    maxZ = originZ + halfH;
  const onScreen = (p: Vec, pad = 0) =>
    p.x >= minX - pad && p.x <= maxX + pad && p.z >= minZ - pad && p.z <= maxZ + pad;

  ctx.strokeStyle = MAP_COLORS.grid;
  ctx.lineWidth = 1;
  const step = large ? 20 : span <= 60 ? 10 : 20;
  for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
    const [px] = at(x, 0);
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
  }
  for (let z = Math.ceil(minZ / step) * step; z <= maxZ; z += step) {
    const [, pz] = at(0, z);
    ctx.beginPath();
    ctx.moveTo(0, pz);
    ctx.lineTo(w, pz);
    ctx.stroke();
  }

  const visited = new Set(view.visited ?? []);
  const here = OVERWORLD.find((p) => Math.hypot(self.x - p.x, self.z - p.z) < p.radius);
  const known = (p: Place) =>
    !large || p.kind === 'sanctuary' || p.id === here?.id || visited.has(p.id);

  ctx.save();
  // Ground: the island disc, then one soft wash per place so the biome under you reads by colour.
  ctx.beginPath();
  const [ix, iy] = at(ISLAND.x, ISLAND.z);
  ctx.arc(ix, iy, WILDS_RADIUS * scale, 0, Math.PI * 2);
  ctx.fillStyle = MAP_COLORS.ground;
  ctx.fill();
  ctx.clip();
  for (const place of [...OVERWORLD, ...SETPIECES].reverse()) {
    if (!onScreen(place, place.radius)) continue;
    const [x, y] = at(place.x, place.z);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, place.radius * scale * 1.25);
    const alpha = known(place) ? '99' : '33';
    grad.addColorStop(0, place.color + alpha);
    grad.addColorStop(1, place.color + '00');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.lineWidth = large ? 4 : Math.max(2, 6 / (span / 60));
  ctx.strokeStyle = MAP_COLORS.road;
  ctx.beginPath();
  for (const [a, b] of ROADS) {
    const [ax, ay] = at(a.x, a.z),
      [bx, by] = at(b.x, b.z);
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();
  // Place boundary arcs: the edge of a biome is a real thing to see coming.
  if (!large)
    for (const place of OVERWORLD) {
      if (place.kind === 'sanctuary') continue;
      if (!onScreen(place, place.radius + 10)) continue;
      const [x, y] = at(place.x, place.z);
      ctx.strokeStyle = place.color + '66';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, place.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
  const [hx, hy] = at(HAVEN.x, HAVEN.z);
  ctx.fillStyle = '#daceac44';
  ctx.strokeStyle = '#e2cc9766';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(hx, hy, HAVEN.radius * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Props: only the cells the viewport touches, so a 240-unit frame is not 1,300 iterations.
  const specks = large ? PROPS : propsInBox(minX - 2, minZ - 2, maxX + 2, maxZ + 2);
  const speckSize = large ? 3 : span <= 60 ? 3 : span <= 120 ? 2 : 1.5;
  for (const p of specks) {
    if (p.kind === 'grass' || p.kind === 'signpost') continue;
    const [x, y] = at(p.x, p.z);
    ctx.fillStyle =
      p.kind === 'water'
        ? '#4e838c88'
        : p.kind === 'wall'
          ? '#8d8674aa'
          : p.kind === 'tree'
            ? '#203f3666'
            : '#d5c7a333';
    const size = p.kind === 'water' || p.kind === 'wall' ? speckSize * 1.8 : speckSize;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();

  ctx.strokeStyle = MAP_COLORS.rim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(ix, iy, (WILDS_RADIUS + 1) * scale, 0, Math.PI * 2);
  ctx.stroke();
  // The island's shore still reads as a boundary: inside it is the story, outside it the ring.
  ctx.strokeStyle = MAP_COLORS.rim + '77';
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.arc(ix, iy, ISLAND.radius * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Place names. The atlas labels every place; the minimap labels the one you are in.
  ctx.textAlign = 'center';
  if (large) {
    for (const place of PLACES) {
      if (place.kind === 'dungeon') continue;
      // Setpieces are named on the atlas once discovered, and always while they are live.
      if (place.kind === 'setpiece') {
        const live = snapshot?.setpieces?.find((sp) => sp.id === place.id);
        if (!live && place.id === 'wandering-star' && !snapshot?.event.active) continue;
        if (live && live.status !== 'active' && !visited.has(place.id)) continue;
      }
      const [x, y] = at(place.x, place.z - place.radius * 0.28);
      const seen = known(place);
      ctx.font = '600 12px system-ui';
      ctx.fillStyle = seen ? '#ede0bd' : '#ede0bd77';
      ctx.fillText(place.name.toUpperCase(), x, y);
      ctx.font = '9px system-ui';
      ctx.fillStyle = seen ? '#d4ceb5' : '#d4ceb555';
      ctx.fillText(
        !seen
          ? 'UNCHARTED'
          : place.kind === 'sanctuary'
            ? 'SANCTUARY'
            : `LV ${place.levels[0]}–${place.levels[1]} · T${place.tier} DROPS`,
        x,
        y + 16,
      );
      const label = place.name,
        lw = ctx.measureText(label).width + 20;
      hits.push({
        kind: 'place',
        id: place.id,
        name: place.name,
        x: x - lw / 2,
        y: y - 14,
        w: lw,
        h: 34,
      });
    }
  } else if (here) {
    ctx.font = '600 10px system-ui';
    ctx.fillStyle = '#ede0bdcc';
    ctx.fillText(here.name.toUpperCase(), cx, 14);
  }

  // Dungeon portals, with live population and stage when someone is inside.
  for (const place of DUNGEON_PLACES) {
    if (!onScreen(place, 12)) continue;
    const [x, y] = at(place.x, place.z);
    const listing = snapshot?.expeditions?.find((e) => e.dimension === place.dimension);
    const busy = !!listing && listing.status !== 'empty';
    ctx.strokeStyle = place.color;
    ctx.lineWidth = busy ? 3 : 2;
    ctx.beginPath();
    ctx.ellipse(x, y, large ? 5 : 4, large ? 8 : 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (!large) continue;
    ctx.font = '10px system-ui';
    ctx.fillStyle = place.color;
    ctx.fillText(place.name, x, y + 22);
    if (busy) ctx.fillText(`${listing!.population} inside · chamber ${listing!.stage}`, x, y + 34);
    const lw = ctx.measureText(place.name).width + 20;
    hits.push({
      kind: 'place',
      id: place.id,
      name: place.name,
      x: x - lw / 2,
      y: y + 12,
      w: lw,
      h: 16,
    });
  }

  // Wardens and the Crown, with their seal state.
  for (const { x, z, kind } of [...WARDENS, { x: 0, z: -66, kind: 'sovereign' }]) {
    if (!onScreen({ x, z }, 8)) continue;
    const [a, b] = at(x, z);
    const fallen =
      snapshot?.realm.seals?.includes(kind) ||
      (kind === 'sovereign' && snapshot?.realm.crown === 'restoring');
    ctx.fillStyle = fallen ? MAP_COLORS.sealBroken : MAP_COLORS.sealStanding;
    ctx.beginPath();
    ctx.moveTo(a, b - 5);
    ctx.lineTo(a + 5, b);
    ctx.lineTo(a, b + 5);
    ctx.lineTo(a - 5, b);
    ctx.closePath();
    ctx.fill();
    // A wounded warden anywhere in the realm reads as a fight worth joining.
    const live = snapshot?.realm.bosses?.find((x) => x.kind === kind);
    if (live && live.hp < 0.995) {
      ctx.strokeStyle = MAP_COLORS.boss;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(a, b, large ? 10 : 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * live.hp);
      ctx.stroke();
    }
    if (fallen) {
      ctx.fillStyle = '#d4ece1';
      ctx.font = 'bold 10px system-ui';
      ctx.fillText('✓', a, b + 3);
    }
  }

  if (snapshot) {
    drawLive(ctx, snapshot, at, large, large);
    drawTravelers(
      ctx,
      travelers(snapshot, view.roster ?? []),
      at,
      large,
      view.selected ?? '',
      hits,
      w,
    );
    // Live setpieces: a ring you can see from anywhere on the atlas, with its own progress.
    for (const piece of snapshot.setpieces ?? []) {
      if (piece.status !== 'active') continue;
      const [x, y] = at(piece.x, piece.z);
      ctx.strokeStyle = piece.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 13 * scale, 0, Math.PI * 2);
      ctx.stroke();
      if (large) {
        ctx.font = 'bold 9px system-ui';
        ctx.fillStyle = piece.color;
        ctx.fillText(
          `${piece.name.toUpperCase()} · ${piece.current}/${piece.total}`,
          x,
          y - 13 * scale - 5,
        );
      }
    }
    if (snapshot.event.active) {
      const at2 = {
        x: snapshot.event.x ?? WANDERING_STAR.x,
        z: snapshot.event.z ?? WANDERING_STAR.z,
      };
      const [x, y] = at(at2.x, at2.z);
      ctx.strokeStyle = snapshot.event.beacon ?? MAP_COLORS.event;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, WANDERING_STAR.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
      if (large) {
        ctx.font = 'bold 10px system-ui';
        ctx.fillStyle = snapshot.event.beacon ?? MAP_COLORS.event;
        ctx.fillText(
          `${(snapshot.event.name ?? WANDERING_STAR.name).toUpperCase()} · ${Math.ceil(snapshot.event.remaining)}s · ${snapshot.event.kills}/${snapshot.event.target}`,
          x,
          y - WANDERING_STAR.radius * scale - 6,
        );
      }
    }
  }

  const [px, py] = at(self.x, self.z);
  // A pin outranks the chapter goal: the player asked for it.
  const target = view.pin ?? view.objective;
  if (target)
    drawObjective(
      ctx,
      target,
      at,
      px,
      py,
      large,
      w,
      view.pin ? MAP_COLORS.pin : MAP_COLORS.objective,
    );

  if (!large && view.overlay !== false) drawEdgeMarkers(ctx, edgeMarkers(view), at, w, h);

  if (large || view.overlay !== false) drawSelf(ctx, px, py, self.angle);

  if (large) {
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c0bc9f';
    ctx.fillText('N', cx, 18);
    ctx.fillText('BRING SOMETHING HOME', cx, h - 18);
    drawLegend(ctx, h);
  } else {
    ctx.font = '9px system-ui';
    ctx.fillStyle = '#c0bc9fcc';
    ctx.fillText('N', cx, 10);
    ctx.textAlign = 'right';
    ctx.fillText(`${span}m`, w - 6, h - 6);
  }
  return hits;
}

/** What earns a chevron when it leaves the frame: your target, the event, live portals,
 * a boss, and whoever you have selected. This is what makes a large world navigable. */
function edgeMarkers(view: MapView): Marker[] {
  const snapshot = view.snapshot;
  const markers: Marker[] = [];
  const target = view.pin ?? view.objective;
  if (target)
    markers.push({
      x: target.x,
      z: target.z,
      color: view.pin ? MAP_COLORS.pin : MAP_COLORS.objective,
    });
  if (snapshot?.event.active)
    markers.push({
      x: snapshot.event.x ?? WANDERING_STAR.x,
      z: snapshot.event.z ?? WANDERING_STAR.z,
      color: snapshot.event.beacon ?? MAP_COLORS.event,
      glyph: '★',
    });
  // Live setpieces are the other reason to leave the road, so they get an edge chevron too.
  for (const piece of snapshot?.setpieces ?? [])
    if (piece.status === 'active')
      markers.push({ x: piece.x, z: piece.z, color: piece.color, glyph: '✦' });
  for (const place of DUNGEON_PLACES) {
    const listing = snapshot?.expeditions?.find((e) => e.dimension === place.dimension);
    if (listing && listing.status !== 'empty')
      markers.push({ x: place.x, z: place.z, color: place.color, glyph: '◇' });
  }
  for (const e of snapshot?.enemies ?? [])
    if (e.boss) markers.push({ x: e.x, z: e.z, color: MAP_COLORS.boss, glyph: '✦' });
  if (view.selected) {
    const friend = (view.roster ?? []).find((r) => r.id === view.selected);
    if (friend && friend.dimension === snapshot?.self.dimension)
      markers.push({
        x: friend.x,
        z: friend.z,
        color: CLASSES[friend.classId]?.color ?? MAP_COLORS.traveler,
      });
  }
  return markers;
}

/** Per-frame pass over a blitted base: the arrow sits still at centre while the world scrolls. */
export function drawMinimapOverlay(canvas: HTMLCanvasElement, view: MapView) {
  const ctx = canvas.getContext('2d');
  const self = view.self;
  if (!ctx || !self) return;
  const w = canvas.width,
    h = canvas.height;
  const scale = w / (view.span ?? MINIMAP_SPANS[1]);
  const cx = w / 2,
    cy = h / 2;
  const at: Project = (x, z) => [cx + (x - self.x) * scale, cy + (z - self.z) * scale] as const;
  if (view.snapshot?.self.dimension === 'wilds') drawEdgeMarkers(ctx, edgeMarkers(view), at, w, h);
  drawSelf(ctx, cx, cy, self.angle);
}

/** Five rows, drawn from the same constants the map uses. No prose. */
function drawLegend(ctx: CanvasRenderingContext2D, h: number) {
  const rows: [string, string][] = [
    [MAP_COLORS.self, 'You'],
    [MAP_COLORS.traveler, 'Travelers'],
    [MAP_COLORS.enemy, 'Creatures'],
    [MAP_COLORS.boss, 'Boss · health ring'],
    [MAP_COLORS.objective, 'Objective · pin'],
  ];
  const x = 14,
    top = h - 14 - rows.length * 14;
  ctx.save();
  ctx.fillStyle = '#132523cc';
  ctx.fillRect(x - 8, top - 12, 132, rows.length * 14 + 16);
  ctx.textAlign = 'left';
  ctx.font = '9px system-ui';
  rows.forEach(([color, label], i) => {
    const y = top + i * 14;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cfd7c4';
    ctx.fillText(label, x + 10, y + 3);
  });
  ctx.restore();
}
