import { LOOT_BAGS, type BagStyle } from '../shared/gear';
export function bagGlyph(style: BagStyle) {
  const bag = LOOT_BAGS[style];
  return `<svg class="bag-glyph" viewBox="0 0 48 52" fill="none" aria-hidden="true"><path d="M18 15 13 4l9 3 5-3 8 2-5 10c1 5 12 10 12 23 0 8-9 10-18 10S6 47 6 39c0-13 11-18 12-24Z" fill="${bag.color}" stroke="${bag.trim}" stroke-width="1.4"/><path d="m17 25-4 15m18-15 4 15M17 17h14" stroke="${bag.trim}" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"/><path d="M24 17c-10-9-14 1-3 1m3-1c10-9 14 1 3 1m-3 0-4 10m4-10 5 8" stroke="${bag.trim}" stroke-width="2" stroke-linecap="round"/><path d="m24 30 4 5-4 5-4-5Z" fill="${bag.trim}"/></svg>`;
}
export function bagLegend() {
  return `<div class="bag-legend">${(Object.keys(LOOT_BAGS) as BagStyle[]).map((style) => `<span>${bagGlyph(style)}<strong>${LOOT_BAGS[style].name}</strong><small>${LOOT_BAGS[style].hint}</small></span>`).join('')}</div>`;
}
