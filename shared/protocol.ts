import { CLASSES, ENEMIES } from './content.js';
import type {
  BulletState,
  Dimension,
  EnemyState,
  PlayerState,
  RosterEntry,
  Snapshot,
} from './types.js';
/** Wire format revision. 2 adds the optional 1 Hz realm roster; older frames still decode. */
export const PROTOCOL_VERSION = 2;
const classes = Object.keys(CLASSES) as (keyof typeof CLASSES)[],
  kinds = Object.keys(ENEMIES),
  dimensions: Dimension[] = ['wilds', 'hollow', 'crucible', 'eclipse'];
const round = (n: number) => Math.round(n * 1000) / 1000;
type PlayerRow = [
  string,
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
type EnemyRow = [string, number, number, number, number, number, number, number, number, number];
type BulletRow = [number, number, number, number, number, number, number, string, string, number?];
type RosterRow = [string, string, number, number, number, number, number];
export interface Frame extends Omit<
  Snapshot,
  'type' | 'self' | 'players' | 'enemies' | 'bullets' | 'roster'
> {
  type: 'frame';
  self: PlayerRow;
  players: PlayerRow[];
  enemies: EnemyRow[];
  shots: BulletRow[];
  removed: number[];
  reset: boolean;
  roster?: RosterRow[];
}
const rosterRow = (r: RosterEntry): RosterRow => [
  r.id,
  r.name,
  classes.indexOf(r.classId),
  r.level,
  dimensions.indexOf(r.dimension),
  Math.round(r.x * 10) / 10,
  Math.round(r.z * 10) / 10,
];
const rosterEntry = (r: RosterRow): RosterEntry => ({
  id: r[0],
  name: r[1],
  classId: classes[r[2]],
  level: r[3],
  dimension: dimensions[r[4]],
  x: r[5],
  z: r[6],
});
const playerRow = (p: PlayerState): PlayerRow => [
  p.id,
  p.name,
  classes.indexOf(p.classId),
  round(p.x),
  round(p.z),
  round(p.angle),
  p.hp,
  p.maxHp,
  p.mp,
  p.maxMp,
  p.level,
  dimensions.indexOf(p.dimension),
  (p.safe ? 1 : 0) | (p.invulnerable ? 2 : 0) | (p.connected ? 4 : 0) | (p.attacking ? 8 : 0),
];
const playerState = (p: PlayerRow): PlayerState => ({
  id: p[0],
  name: p[1],
  classId: classes[p[2]],
  x: p[3],
  z: p[4],
  angle: p[5],
  hp: p[6],
  maxHp: p[7],
  mp: p[8],
  maxMp: p[9],
  level: p[10],
  dimension: dimensions[p[11]],
  safe: !!(p[12] & 1),
  invulnerable: !!(p[12] & 2),
  connected: !!(p[12] & 4),
  attacking: !!(p[12] & 8),
});
/** WebSockets are ordered and reliable. Fixed-velocity shots need one spawn and one removal.
 * Every two seconds, and after a skipped frame, a full baseline self-heals the stream. */
export class Encoder {
  private bullets = new Set<number>();
  private dimension?: Dimension;
  private lastBaseline = -Infinity;
  reset() {
    this.bullets.clear();
    this.dimension = undefined;
    this.lastBaseline = -Infinity;
  }
  encode(s: Snapshot): Frame {
    const reset = this.dimension !== s.self.dimension || s.time - this.lastBaseline >= 2;
    if (reset) {
      this.bullets.clear();
      this.lastBaseline = s.time;
      this.dimension = s.self.dimension;
    }
    const current = new Set(s.bullets.map((b) => b.id)),
      removed = [...this.bullets].filter((id) => !current.has(id));
    const shots: BulletRow[] = s.bullets
      .filter((b) => !this.bullets.has(b.id))
      .map((b) => [
        b.id,
        round(b.x),
        round(b.z),
        round(b.vx),
        round(b.vz),
        b.friendly ? 1 : 0,
        b.radius,
        b.color,
        b.owner,
        ...(b.style !== undefined ? ([b.style] as [number]) : ([] as [])),
      ]);
    this.bullets = current;
    const enemies: EnemyRow[] = s.enemies.map((e) => [
      e.id,
      kinds.indexOf(e.kind),
      round(e.x),
      round(e.z),
      Math.ceil(e.hp),
      e.maxHp,
      round(e.angle),
      e.phase,
      round(e.telegraph),
      e.attack ?? 0,
    ]);
    const { type, self, players, bullets, roster, ...rest } = s;
    return {
      ...rest,
      type: 'frame',
      self: playerRow(self),
      players: players.map(playerRow),
      enemies,
      shots,
      removed,
      reset,
      ...(roster ? { roster: roster.map(rosterRow) } : {}),
    };
  }
}
export class Decoder {
  private bullets = new Map<number, { row: BulletRow; time: number }>();
  reset() {
    this.bullets.clear();
  }
  decode(f: Frame): Snapshot {
    if (f.reset) this.bullets.clear();
    for (const id of f.removed) this.bullets.delete(id);
    for (const row of f.shots) this.bullets.set(row[0], { row, time: f.time });
    const self = playerState(f.self),
      dimension = self.dimension;
    const bullets: BulletState[] = [...this.bullets.values()].map(({ row: b, time }) => ({
      id: b[0],
      x: b[1] + b[3] * (f.time - time),
      z: b[2] + b[4] * (f.time - time),
      vx: b[3],
      vz: b[4],
      friendly: !!b[5],
      radius: b[6],
      color: b[7],
      owner: b[8],
      ...(b[9] !== undefined ? { style: b[9] } : {}),
      dimension,
    }));
    const enemies: EnemyState[] = f.enemies.map((e) => {
      const kind = kinds[e[1]],
        def = ENEMIES[kind];
      return {
        id: e[0],
        kind,
        name: def.name,
        x: e[2],
        z: e[3],
        hp: e[4],
        maxHp: e[5],
        angle: e[6],
        phase: e[7],
        telegraph: e[8],
        attack: e[9],
        radius: def.radius,
        boss: !!def.boss,
        dimension,
      };
    });
    const { type, shots, removed, reset, roster, ...rest } = f;
    return {
      ...rest,
      type: 'snapshot',
      self,
      players: f.players.map(playerState),
      enemies,
      bullets,
      ...(roster ? { roster: roster.map(rosterEntry) } : {}),
    };
  }
}
