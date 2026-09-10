import { CLASSES, MAX_INVENTORY, RARITIES } from '../shared/content';
import {
  activeSet,
  combatStats,
  hasTrait,
  TRAITS,
  itemSummary,
  weaponShots,
  type Trait,
} from '../shared/combat';
import { bagStyle, compareGear, gearNumber, LOOT_BAGS, VERDICTS } from '../shared/gear';
import { BAG_CAPACITY, bagItems, salvageable, salvageValue } from '../shared/loot';
import type { Character, Item, LootState } from '../shared/types';
import {
  ATTUNEMENTS,
  attunementCap,
  attunementCount,
  type AttunedStat,
} from '../shared/attunements';
import { icon, escapeHtml as esc } from './icons';
import { bagGlyph } from './loot-ui';

function slot(item: Item | undefined | null, c: Character, bag = '', empty = '') {
  if (!item)
    return `<span class="hud-slot empty" aria-label="Empty ${empty || 'slot'}">${empty ? icon(empty === 'weapon' ? 'sword' : empty === 'armor' ? 'armor' : 'spark') : ''}</span>`;
  const verdict = compareGear(c, item).verdict;
  return `<button class="hud-slot ${verdict}" style="--rarity:${RARITIES[item.rarity].color}" data-hud-item="${item.id}" ${bag ? `data-bag="${bag}"` : ''} data-verdict="${verdict}" aria-label="${esc(item.name)} · Tier ${item.tier} · ${VERDICTS[verdict].label}${item.locked ? ' · Locked' : ''}"><span class="hud-tier">T${item.tier}</span>${icon(item.icon)}<b class="slot-verdict ${verdict}">${VERDICTS[verdict].symbol}</b>${item.locked ? '<span class="item-lock" aria-hidden="true">◆</span>' : ''}</button>`;
}
/** The best power a slot can hold at a given tier: relic quality, before tempering.
 * Reaching it is the visible per-slot goal, marked with a filled ember pip. */
export function tierCeiling(tier: number) {
  return Math.round((3 + tier * 3) * RARITIES.relic.mult);
}
export interface StatRow {
  id: string;
  label: string;
  value: string;
  /** compareGear metric this row moves with, for live hover deltas. */
  metric?: string;
  /** The stat sits at the ceiling its equipped tier can provide. */
  maxed?: boolean;
  /** The draught this row can be raised with, and how far it has been. */
  attune?: { id: string; count: number; cap: number; color: string };
  hint: string;
}
/** Draught progress for a stat row, once this traveler has actually found one. */
function attuneOf(c: Character, stat: AttunedStat): StatRow['attune'] {
  const kind = ATTUNEMENTS.find((a) => a.stat === stat);
  if (!kind) return undefined;
  const count = attunementCount(c, kind.id);
  return { id: kind.id, count, cap: attunementCap(c.level), color: kind.color };
}
/** What the build actually does, in seven rows a beginner can read without a hover. */
export function statRows(c: Character): StatRow[] {
  const s = combatStats(c),
    cls = CLASSES[c.classId];
  const shots = weaponShots(c);
  const dps = (s.damage / s.rate) * shots.reduce((sum, shot) => sum + shot.damage, 0);
  const atCeiling = (slot: 'weapon' | 'armor' | 'charm') => {
    const item = c.equipment[slot];
    return !!item && item.power >= tierCeiling(item.tier);
  };
  return [
    {
      id: 'hp',
      attune: attuneOf(c, 'maxHp'),
      label: 'Health',
      value: Math.round(s.maxHp).toLocaleString(),
      metric: 'hp',
      maxed: atCeiling('armor'),
      hint: 'Damage you can take before this life ends.',
    },
    {
      id: 'mp',
      attune: attuneOf(c, 'maxMp'),
      label: 'Light',
      value: Math.round(s.maxMp).toLocaleString(),
      metric: 'mp',
      maxed: atCeiling('charm'),
      hint: `Fuel for ${cls.ability}. Recovers ${s.regen.toFixed(1)} per second.`,
    },
    {
      id: 'damage',
      attune: attuneOf(c, 'damage'),
      label: 'Damage',
      value: Math.round(s.damage).toLocaleString(),
      metric: 'bolt',
      maxed: atCeiling('weapon'),
      hint: 'Damage carried by a single bolt.',
    },
    {
      id: 'rate',
      attune: attuneOf(c, 'rate'),
      label: 'Rate',
      value: `${(1 / s.rate).toFixed(1)}/s`,
      maxed: hasTrait(c, 'swift'),
      hint: 'Shots per second. Quickening raises it by a quarter.',
    },
    {
      id: 'range',
      label: 'Range',
      value: `${cls.range}m`,
      hint: 'How far your bolts travel before they fade.',
    },
    {
      id: 'speed',
      attune: attuneOf(c, 'speed'),
      label: 'Speed',
      value: `${s.speed.toFixed(1)}m/s`,
      metric: 'speed',
      maxed: hasTrait(c, 'vigor'),
      hint: 'Movement speed. Waywind raises it by 8%.',
    },
    {
      id: 'reduction',
      attune: attuneOf(c, 'reduction'),
      label: 'Armour',
      value: `${Math.round(s.reduction * 100)}%`,
      metric: 'reduction',
      maxed: s.reduction >= 0.38 - 1e-6,
      hint: 'Share of incoming damage blocked. Caps at 38%.',
    },
    {
      id: 'dps',
      label: 'Damage / second',
      value: Math.round(dps).toLocaleString(),
      metric: 'dps',
      hint: 'Assumes every bolt hits one target, like the comparison tables.',
    },
  ];
}
/** The build panel in the rail: stats, ceiling pips, and the traits actually in play. */
export function statHud(c: Character) {
  const rows = statRows(c);
  const set = activeSet(c);
  // Nothing about draughts appears until the traveler has drunk one.
  const drank = ATTUNEMENTS.some((a) => attunementCount(c, a.id) > 0);
  const traits = [
    ...new Set(
      Object.values(c.equipment)
        .map((i) => i?.trait)
        .filter(Boolean),
    ),
  ] as Trait[];
  return `<div class="rail-heading"><span>YOUR BUILD</span><button data-panel="inventory" title="Full comparison tables · B">Compare <kbd>B</kbd></button></div><div class="stat-block" aria-label="Your combat stats">${rows
    .map(
      (row) =>
        `<div class="stat-row${row.id === 'dps' ? ' derived' : ''}" data-stat="${row.id}" ${row.metric ? `data-metric="${row.metric}"` : ''} title="${esc(row.hint)}"><span>${row.label}</span><b>${row.value}</b><i class="stat-pip${row.maxed ? ' maxed' : ''}" aria-hidden="true"></i><em class="stat-delta"></em>${
          drank && row.attune
            ? `<div class="attune-pips${row.attune.count >= row.attune.cap ? ' capped' : ''}" style="--attune-color:${row.attune.color}" title="${row.attune.count} of ${row.attune.cap} draughts at level ${c.level}" aria-label="${row.label} draughts ${row.attune.count} of ${row.attune.cap}">${Array.from(
                { length: Math.min(12, row.attune.cap) },
                (_, i) =>
                  `<i class="${i < Math.round((row.attune!.count / row.attune!.cap) * Math.min(12, row.attune!.cap)) ? 'filled' : ''}"></i>`,
              ).join('')}</div>`
            : ''
        }</div>`,
    )
    .join(
      '',
    )}</div>${set ? `<div class="set-line" title="${esc(set.description)}">${icon('crown')} ${esc(set.name)}</div>` : ''}${traits.length ? `<div class="trait-line" aria-label="Active effects">${traits.map((t) => `<span title="${esc(TRAITS[t].description)}">${TRAITS[t].name}</span>`).join('')}</div>` : '<div class="trait-line empty">No gear effects yet</div>'}`;
}
export function kitHud(c: Character, safe: boolean, capacity = MAX_INVENTORY) {
  const junk = salvageable(c),
    value = junk.reduce((n, i) => n + salvageValue(i), 0);
  return `<div class="rail-heading"><span>EQUIPPED</span><button data-panel="inventory" title="Inspect equipment · B">Inspect <kbd>B</kbd></button></div><div class="hud-equipment">${Object.entries(
    c.equipment,
  )
    .map(([key, item]) => `<div>${slot(item, c, '', key)}<small>${key}</small></div>`)
    .join(
      '',
    )}</div><div class="rail-heading"><span>SATCHEL</span><span class="${c.inventory.length === capacity ? 'negative' : ''}">${c.inventory.length} / ${capacity}</span></div><div class="hud-inventory" aria-label="Satchel slots">${Array.from({ length: capacity }, (_, i) => slot(c.inventory[i], c)).join('')}</div><div class="rail-salvage"><button data-game="salvage" ${!safe || !junk.length ? 'disabled' : ''} title="${safe ? 'Salvage strictly outclassed, unlocked gear. Named relics are kept.' : 'Salvage at the Hearth. You can drop gear anywhere.'}">${icon('anvil')} Salvage outclassed <b>${junk.length}</b><span>+${value}g</span></button><small>Click equip · Right-click drop · Hover compare</small></div>`;
}
export function bagHud(c: Character, bag: LootState, count: number, capacity = MAX_INVENTORY) {
  const items = bagItems(bag),
    style = bagStyle(bag.item),
    colors = LOOT_BAGS[style];
  return `<div class="bag-heading" style="--bag-color:${colors.color}">${bagGlyph(style)}<div><strong>${colors.name}</strong><small>Yours · <span id="loot-expiry"></span>s</small></div>${count > 1 ? `<button data-action="cycle-loot" title="Next nearby bag · Tab">${count} bags <kbd>TAB</kbd> ›</button>` : `<span>${items.length} / ${BAG_CAPACITY}</span>`}</div><div class="bag-grid" aria-label="Items in nearby bag">${Array.from({ length: BAG_CAPACITY }, (_, i) => slot(items[i], c, bag.id)).join('')}</div><div class="bag-footer"><button class="small-button" data-game="loot-all" data-id="${bag.id}" ${c.inventory.length >= capacity ? 'disabled' : ''}><kbd>X</kbd> ${c.inventory.length >= capacity ? 'Satchel full' : 'Take all'}</button><span class="desktop-hint">Click take<br>Shift-click equip</span><span class="touch-hint">Tap to inspect</span></div>`;
}
export function itemTooltip(c: Character, item: Item, bag?: LootState, capacity = MAX_INVENTORY) {
  const comparison = compareGear(c, item),
    rows = comparison.changed;
  // A concise hover summary; the full build table belongs in the explicit inspector.
  return `<div class="tooltip-heading" style="color:${RARITIES[item.rarity].color}">${icon(item.icon)}<div><small>T${item.tier} ${RARITIES[item.rarity].label} ${item.slot}${item.locked ? ' · Locked' : ''}</small><strong>${esc(item.name)}</strong></div></div><div class="tooltip-verdict"><span class="gear-verdict ${comparison.verdict}">${comparison.symbol} ${comparison.label}</span><span>${esc(itemSummary(item))}</span></div>${item.trait ? `<p>${TRAITS[item.trait].description}</p>` : ''}${
    rows.length
      ? `<div class="tooltip-deltas">${rows
          .slice(0, 3)
          .map(
            (row) =>
              `<span>${row.label}<b class="${row.delta > 0 ? 'positive' : 'negative'}">${row.delta > 0 ? '+' : '−'}${gearNumber(Math.abs(row.delta))}${row.unit}</b></span>`,
          )
          .join(
            '',
          )}${rows.length > 3 ? `<small>+${rows.length - 3} more changes in Inspect</small>` : ''}</div>`
      : ''
  }<small class="tooltip-against">${comparison.verdict === 'equipped' ? 'You are wearing this item.' : comparison.equipped ? `With ${esc(comparison.equipped.name)} equipped` : `Your ${item.slot} slot is empty`}</small><div class="tooltip-actions">${bag ? `<button class="small-button" data-game="loot" data-id="${bag.id}:${item.id}" ${c.inventory.length >= capacity ? 'disabled' : ''}>Take</button><button class="small-button" data-game="loot-equip" data-id="${bag.id}:${item.id}">Equip / swap</button>` : comparison.verdict !== 'equipped' ? `<button class="small-button" data-game="equip" data-id="${item.id}">Equip</button><button class="text-link" data-game="drop" data-id="${item.id}" ${item.locked ? 'disabled' : ''}>Drop</button>` : ''}<button class="text-link" data-inspect="${item.id}">Inspect</button></div>`;
}
