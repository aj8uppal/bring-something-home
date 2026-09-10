import { bagStyle, compareGear } from './gear.js';
import type { Character, Item, LootState } from './types.js';

export const BAG_CAPACITY = 8;
export const BAG_REACH = 4;
const rank = { brown: 0, purple: 1, blue: 2, cyan: 3, gold: 4, white: 5 };
export function bagItems(bag: LootState): Item[] {
  return bag.items ?? [bag.item];
}
export function bagRepresentative(items: Item[]): Item {
  if (!items.length) throw new Error('An empty bag has no representative item.');
  return items.reduce((best, item) =>
    rank[bagStyle(item)] > rank[bagStyle(best)] ||
    (rank[bagStyle(item)] === rank[bagStyle(best)] && item.tier > best.tier)
      ? item
      : best,
  );
}
/** Bulk salvage never guesses about effects or consumes a protected collectible. */
export function salvageable(c: Character): Item[] {
  return c.inventory.filter(
    (item) => !item.locked && !item.relicId && compareGear(c, item).verdict === 'outclassed',
  );
}
export const salvageValue = (item: Item) => item.power * 3;
