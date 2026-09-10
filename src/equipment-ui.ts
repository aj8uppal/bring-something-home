import { bagItems, BAG_REACH, salvageable, salvageValue } from '../shared/loot';
import { distance } from '../shared/content';
import { CLASSES, ENEMIES, MAX_TIER, RARITIES, SHOP } from '../shared/content';
import { BOSS_RELICS, TRAITS, itemSummary } from '../shared/combat';
import { compareGear, gearNumber, VERDICTS, type GearVerdict } from '../shared/gear';
import {
  ATTUNEMENTS,
  ATTUNEMENT_SHARD_COST,
  attunementCap,
  attunementCount,
} from '../shared/attunements';
import { hasPerk, PERKS, satchelSize, vaultSize } from '../shared/perks';
import { legacyOf, relicCost } from '../shared/endgame';
import type { Character, Item, Profile, Snapshot } from '../shared/types';
import { escapeHtml as esc, icon } from './icons';
import { statRows } from './hud-ui';

export type GearFilter = 'all' | 'upgrade' | 'tradeoff' | 'outclassed';
export function verdictBadge(c: Character, item: Item) {
  const comparison = compareGear(c, item);
  return `<span class="gear-verdict ${comparison.verdict}" title="${comparison.hint}">${comparison.symbol} ${comparison.label}</span>`;
}
export function comparisonTable(c: Character, item: Item, compact = false) {
  const comparison = compareGear(c, item);
  if (comparison.verdict === 'equipped') return '<p class="muted">Currently equipped.</p>';
  const rows = comparison.changed;
  const previousTrait = comparison.equipped?.trait;
  const retained =
    previousTrait &&
    Object.entries(c.equipment).some(
      ([slot, gear]) => slot !== item.slot && gear?.trait === previousTrait,
    );
  return `${verdictBadge(c, item)}<span class="compare-against">${comparison.equipped ? `Compared with ${esc(comparison.equipped.name)}` : `Fills your empty ${item.slot} slot`}</span>
    ${rows.length ? `<table class="gear-comparison ${compact ? 'compact' : ''}"><thead><tr><th>Build stat</th><th>Now</th><th>With item</th><th>Change</th></tr></thead><tbody>${rows.map((row) => `<tr><th>${row.label}</th><td>${gearNumber(row.before)}${row.unit}</td><td>${gearNumber(row.after)}${row.unit}</td><td class="${row.delta > 0 ? 'positive' : 'negative'}">${row.delta > 0 ? '+' : '−'}${gearNumber(Math.abs(row.delta))}${row.unit}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No change to your current combat stats.</p>'}
    ${rows.some((row) => row.key === 'dps') ? '<small class="comparison-note">DPS assumes all bolts hit. Ability power affects damaging abilities.</small>' : ''}
    ${comparison.equipped?.trait && comparison.equipped.trait !== item.trait ? `<small class="effect-swap">${retained ? `${TRAITS[comparison.equipped.trait].name} remains active from another equipped item.` : `Replaces ${TRAITS[comparison.equipped.trait].name}: ${TRAITS[comparison.equipped.trait].description}`}</small>` : ''}`;
}
export function pickupNotice(c: Character, item: Item) {
  const comparison = compareGear(c, item);
  return `${icon(item.icon)}<span><strong>${esc(item.name)}</strong><small>${comparison.symbol} ${comparison.label} · T${item.tier} ${item.slot}</small></span>${comparison.verdict === 'upgrade' ? `<button data-game="equip" data-id="${item.id}"><kbd>G</kbd> Equip</button>` : ''}<button data-action="dismiss-loot" aria-label="Dismiss pickup">×</button>`;
}
function itemButton(
  item: Item | null,
  c: Character,
  selectedId: string,
  equipped = false,
  empty = '',
) {
  const comparison = item ? compareGear(c, item) : undefined;
  const verdict = comparison?.verdict ?? 'equivalent';
  return `<button class="item-slot ${selectedId === item?.id ? 'selected' : ''} ${equipped ? 'worn' : verdict}" ${item ? `style="--rarity:${RARITIES[item.rarity].color}" data-item="${item.id}" data-verdict="${verdict}" aria-label="${esc(item.name)}" aria-description="Tier ${item.tier} ${RARITIES[item.rarity].label} ${item.slot} · ${comparison!.label}" title="${esc(item.name)} · ${comparison!.label}\n${esc(itemSummary(item))}"` : 'disabled aria-label="Empty slot"'}>${item ? `${icon(item.icon)}${item.locked ? '<i class="item-lock">◆</i>' : ''}<span>T${item.tier}</span><b class="slot-verdict ${verdict}">${VERDICTS[verdict].symbol}</b><small>${item.slot}</small>` : empty}</button>`;
}
function relicWorkshop(profile: Profile, safe: boolean) {
  const legacy = legacyOf(profile),
    c = profile.character!;
  return `<h3 class="minor-heading">RELIC WORKSHOP</h3><p class="muted">Defeat a boss to learn its recipe. Bosses award star shards; complete expeditions for more. Crafted relics have the same power and effect as their boss drops.</p><div class="relic-workshop">${Object.entries(
    BOSS_RELICS,
  )
    .map(([kind, relic]) => {
      const known = profile.discovered.includes(kind),
        cost = relicCost(kind);
      return `<article class="relic-recipe ${legacy.relics.includes(kind) ? 'collected' : ''}"><span style="color:${ENEMIES[kind].color}">${icon(relic.slot === 'weapon' ? CLASSES[c.classId].icon : relic.slot === 'armor' ? 'armor' : 'spark')}</span><div><strong>${relic.name}</strong><small>T${ENEMIES[kind].tier} ${relic.slot} · ${TRAITS[relic.trait].description}</small><small>${known ? (legacy.relics.includes(kind) ? '✓ In your permanent collection' : 'Recipe learned') : `Defeat ${ENEMIES[kind].name}`}</small></div><button class="small-button" data-game="craft" data-id="${kind}" ${!safe || !known || legacy.shards < cost || c.inventory.length >= satchelSize(profile) ? 'disabled' : ''}>${cost} shards</button></article>`;
    })
    .join('')}</div>${draughtExchange(profile, safe)}${emberBench(profile, safe)}`;
}
/**
 * What embers are for. None of these buys power: they buy room, a quicker rebuild, and a
 * name. Everything here survives every death, exactly as embers always have.
 */
function emberBench(profile: Profile, safe: boolean) {
  return `<h3 class="minor-heading">THE EMBER BENCH</h3><p class="muted">Embers outlive every traveler you will ever be. These are permanent and account-wide, and not one of them makes you stronger.</p><div class="perk-bench">${PERKS.map(
    (perk) => {
      const owned = hasPerk(profile, perk.id);
      return `<article class="perk ${owned ? 'owned' : ''}"><span class="shop-icon">${icon(perk.icon)}</span><div><strong>${perk.name}</strong><small>${perk.description}</small></div><button class="small-button" data-game="buy" data-id="perk:${perk.id}" ${owned || !safe || profile.embers < perk.cost ? 'disabled' : ''}>${owned ? '✓ Yours' : `${icon('flame')} ${perk.cost}`}</button></article>`;
    },
  ).join('')}</div>`;
}
/**
 * The exchange. Draughts are meant to be found; this is the floor for a traveler the
 * keepers have been unkind to, and the rate says so.
 */
function draughtExchange(profile: Profile, safe: boolean) {
  const legacy = legacyOf(profile),
    c = profile.character!;
  return `<h3 class="minor-heading">THE DRAUGHT BENCH</h3><p class="muted">Draughts raise one stat permanently, for this life only. Keepers pour them freely; the Smith will trade one for ${ATTUNEMENT_SHARD_COST} star shards, which is a poor deal and is meant to be.</p><div class="draught-bench">${ATTUNEMENTS.map(
    (kind) => {
      const count = attunementCount(c, kind.id),
        cap = attunementCap(c.level),
        capped = count >= cap;
      return `<article class="draught ${capped ? 'capped' : ''}" style="--attune-color:${kind.color}"><div><strong>${kind.label}</strong><small>${count} / ${cap} for this life · LV ${c.level}</small></div><button class="small-button" data-game="craft" data-id="draught:${kind.id}" ${!safe || capped || legacy.shards < ATTUNEMENT_SHARD_COST ? 'disabled' : ''}>${capped ? 'At cap' : `${ATTUNEMENT_SHARD_COST} shards`}</button></article>`;
    },
  ).join('')}</div>`;
}
export function inventoryPanel(
  panel: string,
  profile: Profile,
  selectedId: string,
  snapshot?: Snapshot,
  filter: GearFilter = 'all',
) {
  const c = profile.character;
  if (!c) return '<p class="empty-state">Enter the wilds to begin a traveler.</p>';
  const ground = snapshot?.loot
    .filter((b) => distance(b, snapshot.self) < BAG_REACH)
    .find((b) => bagItems(b).some((i) => i.id === selectedId));
  const junk = salvageable(c);
  const selected = [
    ...c.inventory,
    ...profile.vault,
    ...Object.values(c.equipment),
    ...(ground ? bagItems(ground) : []),
  ].find((i) => i?.id === selectedId);
  const inVault = profile.vault.some((i) => i.id === selectedId),
    equipped = Object.values(c.equipment).some((i) => i?.id === selectedId);
  const safe = snapshot?.self.safe ?? true;
  const tabs = `<div class="panel-tabs">${['inventory', 'vault', 'forge'].map((p) => `<button data-panel="${p}" class="${p === panel ? 'active' : ''}">${icon(p === 'inventory' ? 'bag' : p === 'vault' ? 'chest' : 'anvil')}${p === 'inventory' ? 'Satchel' : p === 'vault' ? 'Memory vault' : 'The forge'}</button>`).join('')}</div>`;
  const build = `<div class="panel-build" aria-label="Your combat stats">${statRows(c)
    .map(
      (row) =>
        `<span title="${esc(row.hint)}"><small>${row.label}</small><b>${row.value}</b>${row.maxed ? '<i class="stat-pip maxed" aria-label="At its tier ceiling"></i>' : ''}</span>`,
    )
    .join('')}</div>`;
  const currency = `<div class="panel-currency"><span>${icon('coin')} ${c.gold} gold</span><span>${icon('flame')} ${profile.embers} embers</span><span>${icon('spark')} ${legacyOf(profile).shards} shards</span><small>${safe ? 'At the Hearth' : 'The realm is live · R to recall'}</small></div>`;
  if (panel === 'forge')
    return `${tabs}${currency}<p class="panel-intro">A better blade. A remembered star. A reason to venture out again.</p>${!safe ? '<div class="notice-box">Return to the Hearth to trade, temper, and craft.</div>' : ''}<div class="shop-grid">${SHOP.map((p) => `<div class="shop-item"><span class="shop-icon">${icon(p.icon)}</span><div><h3>${p.name}</h3><p>${p.description}</p></div><button class="small-button" data-game="buy" data-id="${p.id}" ${!safe || c.gold < p.cost ? 'disabled' : ''}>${icon('coin')} ${p.cost}</button></div>`).join('')}</div><h3 class="minor-heading">TEMPER EQUIPMENT</h3><p class="muted">Each tier adds +4 power. Costs gold and 5 persistent embers. Maximum tier ${MAX_TIER}.</p><div class="temper-list">${Object.entries(
      c.equipment,
    )
      .map(
        ([slot, item]) =>
          `<div>${icon(item?.icon ?? 'spark')}<span>${item ? esc(item.name) : `No ${slot} equipped`}<small>${item ? `Tier ${item.tier} · ${esc(itemSummary(item))}` : ''}</small></span><button class="small-button" data-game="upgrade" data-id="${slot}" ${!safe || !item || item.tier >= MAX_TIER || c.gold < item.tier * 50 || profile.embers < 5 ? 'disabled' : ''}>${item ? `${item.tier * 50} gold + 5 embers` : '—'}</button></div>`,
      )
      .join('')}</div>${relicWorkshop(profile, safe)}`;
  const allItems = panel === 'vault' ? profile.vault : c.inventory;
  const priority: Record<GearVerdict, number> = {
    upgrade: 0,
    tradeoff: 1,
    equivalent: 2,
    outclassed: 3,
    equipped: 4,
  };
  const items = allItems
    .filter((i) => filter === 'all' || compareGear(c, i).verdict === filter)
    .sort(
      (a, b) =>
        priority[compareGear(c, a).verdict] - priority[compareGear(c, b).verdict] ||
        b.tier - a.tier ||
        b.power - a.power,
    );
  const max = panel === 'vault' ? vaultSize(profile) : satchelSize(profile);
  const filters = `<div class="gear-filters" aria-label="Filter equipment">${(['all', 'upgrade', 'tradeoff', 'outclassed'] as const).map((f) => `<button data-gear-filter="${f}" class="${f === filter ? 'active' : ''}">${f === 'all' ? 'All gear' : `${VERDICTS[f].symbol} ${VERDICTS[f].label}`} <small>${allItems.filter((i) => f === 'all' || compareGear(c, i).verdict === f).length}</small></button>`).join('')}</div>`;
  return `${tabs}${currency}<div class="inventory-layout"><div>${
    panel === 'inventory'
      ? `${build}<h3 class="minor-heading">CARRIED INTO THE STORM</h3><div class="equipment-row">${Object.entries(
          c.equipment,
        )
          .map(
            ([slot, item]) =>
              `<div>${itemButton(item, c, selectedId, true, icon(slot === 'weapon' ? 'sword' : slot === 'armor' ? 'armor' : 'spark'))}<span>${slot}</span></div>`,
          )
          .join('')}</div>`
      : '<p class="panel-intro">What you leave here lives on.<br>Your vault is shared by every life you’ll lead.</p>'
  }
    <div class="section-label"><span>${panel === 'vault' ? 'MEMORIES KEPT' : 'YOUR SATCHEL'}</span><span>${allItems.length} / ${max}</span></div>${filters}${panel === 'inventory' ? `<div class="bulk-salvage"><button class="small-button" data-game="salvage" ${!safe || !junk.length ? 'disabled' : ''}>${icon('anvil')} Salvage outclassed (${junk.length}) · +${junk.reduce((n, i) => n + salvageValue(i), 0)} gold</button><small>${safe ? 'Locked gear, named relics and tradeoffs are kept.' : 'Salvage at the Hearth. Drop gear anywhere.'}</small></div>` : ''}<div class="inventory-grid">${Array.from({ length: filter === 'all' ? (panel === 'vault' ? Math.min(vaultSize(profile), Math.max(24, Math.ceil((items.length + 1) / 6) * 6)) : max) : items.length }, (_, i) => itemButton(items[i] ?? null, c, selectedId)).join('')}</div>${!items.length && filter !== 'all' ? '<p class="empty-state">No items match this filter.</p>' : ''}<p class="muted item-footnote">Upgrades first. ↔ means a real tradeoff, including effects.<br>↓ means your equipped gear matches or beats every measured stat.${panel === 'inventory' ? '<br>Satchel and worn gear are lost on death. Bank spares at the Hearth.' : ''}</p></div>
    <aside class="item-detail">${selected ? `<div class="detail-glyph" style="color:${RARITIES[selected.rarity].color}">${icon(selected.icon)}</div><span class="eyebrow" style="color:${RARITIES[selected.rarity].color}">${RARITIES[selected.rarity].label} · TIER ${selected.tier} ${selected.slot}</span><h3>${esc(selected.name)}</h3><p>${esc(selected.description)}</p><div class="item-stat-line">${esc(itemSummary(selected))}</div>${selected.trait ? `<div class="trait-detail"><strong>${TRAITS[selected.trait].name}</strong><span>${TRAITS[selected.trait].description}</span></div>` : ''}${comparisonTable(c, selected)}<div class="item-actions">${ground ? `<button class="primary-button" data-game="loot" data-id="${ground.id}:${selected.id}" ${c.inventory.length >= satchelSize(profile) ? 'disabled' : ''}>Take from bag</button><button class="small-button" data-game="loot-equip" data-id="${ground.id}:${selected.id}">Equip from bag / swap</button>` : inVault ? `<button class="primary-button" data-game="withdraw" data-id="${selected.id}" ${!safe || c.inventory.length >= satchelSize(profile) ? 'disabled' : ''}>Withdraw</button>` : equipped ? `<button class="primary-button" data-game="unequip" data-id="${selected.slot}">Unequip</button>` : `<button class="primary-button" data-game="equip" data-id="${selected.id}">Equip ${icon('arrow')}</button><button class="small-button" data-game="store" data-id="${selected.id}" ${!safe ? 'disabled' : ''}>${icon('chest')} Store in vault</button><button class="text-link" data-game="drop" data-id="${selected.id}" ${selected.locked ? 'disabled' : ''}>Drop into personal bag</button><button class="text-link" data-game="sell" data-id="${selected.id}" ${!safe || selected.locked ? 'disabled' : ''}>Salvage for ${selected.power * 3} gold</button>`}${!ground ? `<button class="text-link item-lock-action" data-game="lock" data-id="${selected.id}">${selected.locked ? '◆ Unlock item' : '◇ Lock item'}</button>` : ''}</div>` : `<div class="detail-glyph muted">${icon('bag')}</div><h3>Choose your next upgrade.</h3><p>Select any item to see exactly what changes in your build.</p><div class="gear-legend">${(['upgrade', 'tradeoff', 'outclassed'] as const).map((v) => `<span class="gear-verdict ${v}">${VERDICTS[v].symbol} ${VERDICTS[v].label}</span>`).join('')}</div>`}</aside></div>`;
}
