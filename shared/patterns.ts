import { ENEMIES } from './content.js';
import type { EnemyState } from './types.js';
export function attackPlan(e: Pick<EnemyState, 'kind' | 'phase' | 'angle' | 'attack'>) {
  const def = ENEMIES[e.kind];
  const turn = e.attack ?? 0;
  const cycle = turn % 3;
  if (def.elder) {
    const shots: { angle: number; speed: number }[] = [];
    const add = (angle: number, speed = 1) => shots.push({ angle, speed });
    if (e.kind === 'tideelder') {
      if (cycle === 1) {
        for (let i = -3; i <= 3; i++) add(e.angle + i * 0.16, 1.1);
      } else {
        const n = 18 + e.phase * 4;
        for (let i = 3; i < n; i++) {
          const angle = (i / n) * Math.PI * 2 + turn * 0.32;
          add(angle, 0.8);
          if (e.phase > 0) add(angle, 1.13);
        }
      }
      return {
        shots,
        pattern: cycle === 1 ? 'fan' : 'ring',
        name: cycle === 1 ? 'TIDAL RAKE' : 'RETURNING TIDE',
        hint:
          cycle === 1 ? 'Sidestep the locked fan' : 'Hold the open channel · Two tides share a gap',
      };
    }
    if (e.kind === 'cinderelder') {
      if (cycle === 1) {
        for (let i = -4; i <= 4; i++) {
          add(e.angle + i * 0.19, 1.1);
          if (e.phase > 0) add(e.angle + i * 0.19, 0.7);
        }
      } else {
        for (let arm = 0; arm < 6; arm++)
          for (let j = 0; j < 2 + e.phase; j++)
            add((arm * Math.PI) / 3 + turn * 0.22 + (j - (1 + e.phase) / 2) * 0.08, 0.78 + j * 0.1);
      }
      return {
        shots,
        pattern: cycle === 1 ? 'fan' : 'burst',
        name: cycle === 1 ? 'FURNACE BREATH' : 'SIXFOLD SUN',
        hint:
          cycle === 1
            ? 'Leave the marked fan before it fires'
            : 'Move between the six spokes · Avoid Sunfall circles',
      };
    }
    if (cycle === 1) {
      const n = 20 + e.phase * 4;
      for (let i = 3; i < n; i++) add((i / n) * Math.PI * 2 - turn * 0.28, 0.85);
    } else {
      for (let arm = 0; arm < 4; arm++)
        for (let j = -1 - e.phase; j <= 1 + e.phase; j++)
          add((arm * Math.PI) / 2 + turn * 0.24 + j * 0.09, 0.95);
    }
    return {
      shots,
      pattern: cycle === 1 ? 'spiral' : 'burst',
      name: cycle === 1 ? 'UNRAVELING SKY' : 'CROSS OF SILENCE',
      hint:
        cycle === 1
          ? 'Follow the rotating opening'
          : 'Keep to the diagonal gaps · Silent stars mark the floor',
    };
  }
  const pattern = !def.boss
    ? def.pattern
    : cycle === 1
      ? 'fan'
      : cycle === 2
        ? 'spiral'
        : def.pattern;
  const shots: { angle: number; speed: number }[] = [];
  const add = (angle: number, speed = 1) => shots.push({ angle, speed });
  if (pattern === 'aim') add(e.angle);
  if (pattern === 'fan') {
    const n = def.boss ? 7 + e.phase * 2 : 3;
    for (let i = 0; i < n; i++) add(e.angle + (i - (n - 1) / 2) * (def.boss ? 0.2 : 0.3), 1.1);
  }
  if (pattern === 'ring' || pattern === 'spiral') {
    const n = def.boss ? 16 + e.phase * 4 : pattern === 'ring' ? 8 : 5;
    // A rotating gap makes every ring a readable dodge decision.
    for (let i = 0; i < n; i++) {
      if (def.boss && i < 2) continue;
      add((i / n) * Math.PI * 2 + turn * 0.39);
      if (def.boss && e.phase === 2 && pattern === 'spiral')
        add((i / n) * Math.PI * 2 + turn * 0.39 + 0.12, 0.72);
    }
  }
  if (pattern === 'burst') {
    for (let j = 0; j < 3; j++)
      for (let i = 2; i < 14; i++)
        add((i / 14) * Math.PI * 2 + turn * 0.3 + j * 0.1, 0.65 + j * 0.22);
  }
  return {
    shots,
    pattern,
    name:
      pattern === 'fan'
        ? 'SUNDERING FAN'
        : pattern === 'spiral'
          ? 'SPIRAL BLOOM'
          : pattern === 'burst'
            ? 'THREEFOLD FLAME'
            : pattern === 'ring'
              ? 'RING OF ASH'
              : 'EMBER SHOT',
    hint:
      pattern === 'fan' || pattern === 'aim'
        ? 'Sidestep the marked direction'
        : 'Find the gap · Dodge through with Shift',
  };
}
