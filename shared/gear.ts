import { combatStats, hasTrait, weaponShots } from './combat.js';
import type { Character, Item } from './types.js';

export type GearVerdict = 'upgrade' | 'tradeoff' | 'outclassed' | 'equivalent' | 'equipped';
export const VERDICTS: Record<GearVerdict, { label: string; symbol: string; hint: string }> = {
  upgrade: {
    label: 'Upgrade',
    symbol: '↑',
    hint: 'Improves your build without losing another measured stat.',
  },
  tradeoff: {
    label: 'Tradeoff',
    symbol: '↔',
    hint: 'Gains and losses. Choose the effects that suit your playstyle.',
  },
  outclassed: {
    label: 'Outclassed',
    symbol: '↓',
    hint: 'Your equipped item matches or beats every measured stat.',
  },
  equivalent: {
    label: 'Equivalent',
    symbol: '=',
    hint: 'The same combat stats with your current equipment.',
  },
  equipped: { label: 'Equipped', symbol: '✓', hint: 'You are wearing this item.' },
};
const metrics = {
  dps: { label: 'Primary DPS', unit: '' },
  bolt: { label: 'Single bolt', unit: '' },
  ability: { label: 'Ability power', unit: '' },
  pierce: { label: 'Extra targets / bolt', unit: '' },
  hp: { label: 'Max health', unit: '' },
  reduction: { label: 'Damage blocked', unit: '%' },
  mp: { label: 'Max light', unit: '' },
  regen: { label: 'Light / second', unit: '' },
  speed: { label: 'Move speed', unit: 'm/s' },
  heal: { label: 'Health / kill', unit: '' },
} as const;
type Metric = keyof typeof metrics;
function buildMetrics(c: Character): Record<Metric, number> {
  const s = combatStats(c),
    shots = weaponShots(c);
  return {
    dps: (s.damage / s.rate) * shots.reduce((sum, shot) => sum + shot.damage, 0),
    bolt: s.damage * shots[0].damage,
    ability: c.classId === 'sentinel' ? 0 : s.damage * 1.8,
    pierce: shots[0].pierce,
    hp: s.maxHp,
    reduction: s.reduction * 100,
    mp: s.maxMp,
    regen: s.regen,
    speed: s.speed,
    heal: hasTrait(c, 'leech') ? 3 : 0,
  };
}
/** Compare whole builds, including effects supplied by another equipped item.
 * Dominance requires no losses; DPS assumes every bolt connects with one target. */
export function compareGear(c: Character, item: Item) {
  const equipped = c.equipment[item.slot];
  const before = buildMetrics(c);
  const after = buildMetrics({ ...c, equipment: { ...c.equipment, [item.slot]: item } });
  const rows = (Object.keys(metrics) as Metric[]).map((key) => ({
    key,
    ...metrics[key],
    before: before[key],
    after: after[key],
    delta: after[key] - before[key],
  }));
  const changed = rows.filter((row) => Math.abs(row.delta) > 0.001);
  const gains = changed.some((row) => row.delta > 0),
    losses = changed.some((row) => row.delta < 0);
  const verdict: GearVerdict =
    equipped?.id === item.id
      ? 'equipped'
      : gains && losses
        ? 'tradeoff'
        : gains
          ? 'upgrade'
          : losses
            ? 'outclassed'
            : 'equivalent';
  return { verdict, ...VERDICTS[verdict], equipped, rows, changed };
}
export function gearNumber(value: number) {
  return Math.abs(value - Math.round(value)) < 0.05 ? String(Math.round(value)) : value.toFixed(1);
}
export const LOOT_BAGS = {
  brown: { name: 'Brown bag', color: '#b9936b', trim: '#e8c99b', hint: 'Weathered equipment' },
  purple: { name: 'Purple bag', color: '#b488e6', trim: '#e2ccff', hint: 'Verdant equipment' },
  blue: { name: 'Blue bag', color: '#67b4ef', trim: '#c5edff', hint: 'Astral equipment · T1–4' },
  cyan: { name: 'Cyan bag', color: '#6ce7d4', trim: '#d9fff1', hint: 'Astral equipment · T5–6' },
  gold: { name: 'Gold bag', color: '#f5bd5b', trim: '#fff1cb', hint: 'Relic equipment' },
  white: { name: 'White bag', color: '#fff4dc', trim: '#edbe65', hint: 'Named keeper relic' },
} as const;
export type BagStyle = keyof typeof LOOT_BAGS;
/** A white bag always promises a named relic. Tier remains explicit on every label. */
export function bagStyle(item: Item): BagStyle {
  if (item.relicId && item.rarity === 'relic') return 'white';
  if (item.rarity === 'relic') return 'gold';
  if (item.rarity === 'rare') return item.tier >= 5 ? 'cyan' : 'blue';
  return item.rarity === 'uncommon' ? 'purple' : 'brown';
}
