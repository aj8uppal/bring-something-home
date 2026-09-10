import { BOSS_RELICS } from './combat.js';
import { legacyOf, relicCost } from './endgame.js';
import type { Profile } from './types.js';

export function relicChase(profile: Profile, kind: string) {
  if (!Object.hasOwn(BOSS_RELICS, kind)) return;
  const legacy = legacyOf(profile),
    kills = legacy.bossKills[kind] ?? 0;
  return {
    relic: BOSS_RELICS[kind],
    kills,
    untilGuaranteed: 6 - (kills % 6),
    collected: legacy.relics.includes(kind),
    known: profile.discovered.includes(kind),
    shards: legacy.shards,
    cost: relicCost(kind),
  };
}
