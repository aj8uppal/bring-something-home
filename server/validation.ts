import type { Action, ClientMessage } from '../shared/types.js';
const actions = new Set<Action>([
  'dash',
  'ability',
  'potion',
  'recall',
  'interact',
  'loot',
  'loot-all',
  'loot-equip',
  'drop',
  'lock',
  'salvage',
  'equip',
  'unequip',
  'store',
  'withdraw',
  'sell',
  'buy',
  'upgrade',
  'attune',
  'craft',
  'delve',
  'rally',
  'track',
  'pin',
  'travel',
]);
export function parseMessage(raw: string): ClientMessage | null {
  if (raw.length > 4096) return null;
  let m: any;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  if (
    m.type === 'join' &&
    typeof m.token === 'string' &&
    m.token.length <= 100 &&
    ['arcanist', 'ranger', 'sentinel'].includes(m.classId) &&
    (m.realm === undefined || (typeof m.realm === 'string' && /^[a-z0-9-]{1,32}$/.test(m.realm)))
  )
    return m;
  if (
    m.type === 'input' &&
    m.input &&
    ['x', 'z', 'angle', 'seq'].every(
      (k) => typeof m.input[k] === 'number' && Number.isFinite(m.input[k]),
    ) &&
    Math.abs(m.input.x) <= 1 &&
    Math.abs(m.input.z) <= 1 &&
    Math.abs(m.input.angle) <= 100 &&
    Number.isSafeInteger(m.input.seq) &&
    m.input.seq >= 0 &&
    typeof m.input.fire === 'boolean'
  )
    return m;
  if (
    m.type === 'action' &&
    actions.has(m.action) &&
    (m.id === undefined || (typeof m.id === 'string' && m.id.length <= 100))
  )
    return m;
  if (m.type === 'chat' && typeof m.text === 'string' && m.text.length > 0 && m.text.length <= 200)
    return m;
  if (m.type === 'ping' && typeof m.time === 'number' && Number.isFinite(m.time)) return m;
  return null;
}
export function cleanName(value: unknown) {
  return typeof value === 'string'
    ? value
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N} _-]/gu, '')
        .trim()
        .slice(0, 18)
    : '';
}
export class RateLimiter {
  entries = new Map<string, { count: number; reset: number }>();
  constructor(
    public limit: number,
    public window: number,
  ) {}
  take(key: string, now = Date.now()) {
    let e = this.entries.get(key);
    if (!e || now >= e.reset) {
      e = { count: 0, reset: now + this.window };
      this.entries.set(key, e);
    }
    return ++e.count <= this.limit;
  }
  prune(now = Date.now()) {
    for (const [k, v] of this.entries) if (now >= v.reset) this.entries.delete(k);
  }
}
