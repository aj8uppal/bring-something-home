import type { Dimension } from './types.js';

/**
 * A dimension is either the wilds or one live instance, written `template:seed`.
 *
 * Everything that used to switch on a fixed union now asks for the template instead, so a
 * generated Thornling Warren and the realm's permanent Sunken Archive are the same kind of
 * thing to the bounds check, the renderer, the map, and persistence.
 */
export const templateOf = (dimension: Dimension): string =>
  dimension === 'wilds' ? 'wilds' : (dimension.split(':')[0] ?? dimension);
/** True when this is a specific live instance rather than the shorthand for a template. */
export const isInstance = (dimension: Dimension) => dimension.includes(':');
export const instanceId = (template: string, seed: number) =>
  `${template}:${(seed >>> 0).toString(36)}`;
/** The seed an instance id carries, so a layout can be rebuilt anywhere from the id alone. */
export const seedOf = (dimension: Dimension) =>
  isInstance(dimension) ? parseInt(dimension.split(':')[1] ?? '0', 36) >>> 0 : 0;
