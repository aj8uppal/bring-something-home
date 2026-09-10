import { Store } from '../server/database';
import { createCharacter, makeItem, stats } from '../server/model';
import { ensureLegacy } from '../shared/endgame';
import { test, type Browser, type Page } from '@playwright/test';
import type { Profile } from '../shared/types';

/** A second traveler runs in a separate browser process, as on another device. */
export async function remoteTraveler(browser: Browser) {
  const remote = await browser.browserType().launch(test.info().project.use.launchOptions);
  try {
    const context = await remote.newContext();
    return { context, close: () => remote.close() };
  } catch (error) {
    await remote.close();
    throw error;
  }
}

export async function veteran(
  page: Page,
  name: string,
  options: {
    prepare?: (profile: Profile) => void;
    path?: string;
    freshRealm?: boolean;
  } = {},
) {
  const store = new Store('data/e2e.sqlite');
  const account = store.create(name);
  const c = (account.profile.character = createCharacter('arcanist'));
  c.level = 20;
  c.gold = 2000;
  account.profile.embers = 100;
  account.profile.victories = 1;
  c.equipment.weapon = { ...makeItem('weapon', 3, 'rare'), trait: 'pierce', name: 'Threadkeeper' };
  c.equipment.armor = { ...makeItem('armor', 5, 'rare'), trait: 'leech' };
  c.equipment.charm = { ...makeItem('charm', 5, 'rare'), trait: 'focus' };
  c.hp = stats(c).maxHp;
  c.mp = stats(c).maxMp;
  c.inventory = [
    {
      ...c.equipment.weapon,
      id: 'test-upgrade',
      name: 'Stronger Threadkeeper',
      power: c.equipment.weapon.power + 8,
    },
    {
      ...c.equipment.weapon,
      id: 'test-weaker',
      name: 'Faded Threadkeeper',
      power: c.equipment.weapon.power - 8,
    },
    { ...c.equipment.weapon, id: 'test-tradeoff', name: 'Quickened Memory', trait: 'swift' },
  ];
  account.profile.discovered = ['archivist'];
  ensureLegacy(account.profile).shards = 40;
  options.prepare?.(account.profile);
  store.save(account.profile);
  store.close();
  await page.addInitScript(
    ({ token, name }) => {
      localStorage.setItem('ew:token', JSON.stringify(token));
      localStorage.setItem('ew:name', JSON.stringify(name));
    },
    { token: account.token, name },
  );
  let path = options.path ?? '/';
  if (options.freshRealm) {
    const response = await page.request.post('/api/realms', {
      data: {},
      headers: { Authorization: `Bearer ${account.token}` },
    });
    if (!response.ok()) throw new Error(`Fixture realm failed: ${response.status()}`);
    const realm = await response.json();
    path = `/?realm=${realm.id}`;
  }
  await page.goto(path);
  await page.getByRole('button', { name: 'Continue journey', exact: true }).click();
  await page.locator('#hud').waitFor({ state: 'visible' });
  return { ...account, realmId: new URL(page.url()).searchParams.get('realm') ?? 'hearth-1' };
}

/** Gameplay scenarios use real saved accounts without consuming the public signup quota. */
export async function freshAccount(page: Page, name: string) {
  const store = new Store('data/e2e.sqlite');
  const account = store.create(name);
  store.close();
  await page.addInitScript(
    ({ token, recovery }) => {
      if (!localStorage.getItem('ew:token')) {
        localStorage.setItem('ew:token', JSON.stringify(token));
        localStorage.setItem('ew:recovery', JSON.stringify(recovery));
      }
    },
    { token: account.token, recovery: account.recoveryCode },
  );
  return account;
}
