import type { Profile } from './types.js';

/**
 * What embers are for.
 *
 * Embers survive death and accumulate from bosses, hunts, chapters and graves, and until
 * now the only thing they bought was tempering. These are account-wide and permanent, and
 * none of them buys power: they buy room, a head start on the rebuild, and a name.
 */
export interface Perk {
  id: string;
  name: string;
  cost: number;
  description: string;
  icon: string;
}
export const PERKS: Perk[] = [
  {
    id: 'satchel',
    name: 'A wider satchel',
    cost: 120,
    description: 'A fourth row: six more places to put something worth carrying home.',
    icon: 'bag',
  },
  {
    id: 'vault',
    name: 'A second vault page',
    cost: 150,
    description: 'Forty-eight more memories the vault will keep after you are gone.',
    icon: 'chest',
  },
  {
    id: 'kit',
    name: 'A kit left ready',
    cost: 90,
    description: 'Every new life starts in a Verdant kit, so rebuilding is quicker.',
    icon: 'armor',
  },
  {
    id: 'title',
    name: 'Your name, and what you are',
    cost: 100,
    description: 'Your mastery title is shown beside your name, on the map and in chat.',
    icon: 'crown',
  },
  {
    id: 'banner',
    name: 'A banner at the Hearth',
    cost: 60,
    description: 'Your colours fly over the Hearth while you are in the realm.',
    icon: 'flame',
  },
  {
    id: 'cloak',
    name: 'A cloak of your own',
    cost: 40,
    description: 'Choose the colour of the cloak you were buried in.',
    icon: 'spark',
  },
];
export const PERK_BY_ID = new Map(PERKS.map((p) => [p.id, p]));
export const hasPerk = (profile: Profile, id: string) => !!profile.perks?.includes(id);
/** The satchel and the vault grow with what a legacy has paid for. */
export const BASE_INVENTORY = 18;
export const BASE_VAULT = 48;
export const satchelSize = (profile: Profile) =>
  BASE_INVENTORY + (hasPerk(profile, 'satchel') ? 6 : 0);
export const vaultSize = (profile: Profile) => BASE_VAULT + (hasPerk(profile, 'vault') ? 48 : 0);
