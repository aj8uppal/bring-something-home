import type { Dimension } from '../shared/types.js';

/**
 * A uniform bucket grid over the wilds and every instance, rebuilt once per broadcast.
 *
 * `broadcast()` used to filter every entity for every player, which is fine for forty
 * creatures on one island and quadratic once the outer ring is populated. Cells are four
 * times the width of the prop collision grid, so a 48-unit visibility query touches
 * forty-nine buckets instead of six hundred.
 */
export const CELL = 16;

export class Grid<T extends { x: number; z: number; dimension: Dimension }> {
  private cells = new Map<string, T[]>();
  clear() {
    this.cells.clear();
  }
  add(item: T) {
    const key = `${item.dimension}|${Math.floor(item.x / CELL)},${Math.floor(item.z / CELL)}`;
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(item);
    else this.cells.set(key, [item]);
  }
  fill(items: Iterable<T>) {
    this.clear();
    for (const item of items) this.add(item);
    return this;
  }
  /** Everything within `radius` of a point in the same dimension, exactly. */
  near(dimension: Dimension, x: number, z: number, radius: number): T[] {
    const found: T[] = [];
    const minX = Math.floor((x - radius) / CELL),
      maxX = Math.floor((x + radius) / CELL);
    const minZ = Math.floor((z - radius) / CELL),
      maxZ = Math.floor((z + radius) / CELL);
    const r2 = radius * radius;
    for (let cx = minX; cx <= maxX; cx++)
      for (let cz = minZ; cz <= maxZ; cz++) {
        const bucket = this.cells.get(`${dimension}|${cx},${cz}`);
        if (!bucket) continue;
        for (const item of bucket) {
          const dx = item.x - x,
            dz = item.z - z;
          if (dx * dx + dz * dz < r2) found.push(item);
        }
      }
    return found;
  }
}
