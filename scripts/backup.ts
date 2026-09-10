import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const source = resolve(process.env.DATA_PATH || 'data/emberwilds.sqlite');
const destination = resolve(
  process.argv[2] ||
    `data/backups/emberwilds-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`,
);
if (!existsSync(source)) throw new Error(`No database exists at ${source}. Start the game first.`);
if (existsSync(destination))
  throw new Error('The destination already exists. Choose a new backup filename.');
mkdirSync(dirname(destination), { recursive: true });
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, destination);
  const check = new DatabaseSync(destination, { readOnly: true });
  const result = check.prepare('PRAGMA integrity_check').get();
  check.close();
  if (result?.integrity_check !== 'ok') throw new Error('Backup integrity check failed.');
  console.log(`Verified SQLite backup: ${destination}`);
} finally {
  db.close();
}
