import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Profile, Grave } from '../shared/types.js';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, recovery_hash TEXT UNIQUE NOT NULL, profile TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS graves (id INTEGER PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), name TEXT NOT NULL, class_id TEXT NOT NULL, level INTEGER NOT NULL, kills INTEGER NOT NULL, fame INTEGER NOT NULL, cause TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS graves_fame ON graves(fame DESC);
      CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY, reporter TEXT NOT NULL, target TEXT NOT NULL, reason TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS bans (account_id TEXT PRIMARY KEY, reason TEXT NOT NULL, at INTEGER NOT NULL);
      PRAGMA user_version=1;`);
  }
  create(name: string) {
    const token = randomBytes(32).toString('base64url');
    const recoveryCode = randomBytes(20)
      .toString('hex')
      .match(/.{1,5}/g)!
      .join('-');
    const profile: Profile = {
      id: randomUUID(),
      name,
      embers: 0,
      vault: [],
      character: null,
      graves: [],
      totalKills: 0,
      victories: 0,
      discovered: [],
      createdAt: Date.now(),
    };
    this.db
      .prepare('INSERT INTO accounts VALUES (?, ?, ?, ?, ?)')
      .run(profile.id, hash(token), hash(recoveryCode), JSON.stringify(profile), Date.now());
    return { token, recoveryCode, profile };
  }
  authenticate(token: string): Profile | null {
    if (typeof token !== 'string' || token.length > 100) return null;
    const row = this.db.prepare('SELECT profile FROM accounts WHERE token_hash=?').get(hash(token));
    if (!row) return null;
    const profile = JSON.parse(row.profile as string) as Profile;
    return this.isBanned(profile.id) ? null : profile;
  }
  recover(code: string) {
    if (typeof code !== 'string' || code.length > 100) return null;
    const row = this.db
      .prepare('SELECT id, profile FROM accounts WHERE recovery_hash=?')
      .get(hash(code.toLowerCase().trim()));
    if (!row) return null;
    const token = randomBytes(32).toString('base64url');
    this.db
      .prepare('UPDATE accounts SET token_hash=? WHERE id=?')
      .run(hash(token), row.id as string);
    return { token, profile: JSON.parse(row.profile as string) as Profile };
  }
  save(profile: Profile) {
    this.db
      .prepare('UPDATE accounts SET profile=?, updated_at=? WHERE id=?')
      .run(JSON.stringify(profile), Date.now(), profile.id);
  }
  saveMany(profiles: Profile[]) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const profile of profiles) this.save(profile);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  recordDeath(profile: Profile, grave: Grave) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.save(profile);
      this.db
        .prepare(
          'INSERT INTO graves (account_id,name,class_id,level,kills,fame,cause,at) VALUES (?,?,?,?,?,?,?,?)',
        )
        .run(
          profile.id,
          grave.name,
          grave.classId,
          grave.level,
          grave.kills,
          grave.fame,
          grave.cause,
          grave.at,
        );
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  leaderboard(): Grave[] {
    return this.db
      .prepare(
        'SELECT name, class_id AS classId, level, kills, fame, cause, at FROM graves ORDER BY fame DESC, at ASC LIMIT 25',
      )
      .all() as unknown as Grave[];
  }
  exists(id: string) {
    return !!this.db.prepare('SELECT id FROM accounts WHERE id=?').get(id);
  }
  isBanned(id: string) {
    return !!this.db.prepare('SELECT account_id FROM bans WHERE account_id=?').get(id);
  }
  report(reporter: string, target: string, reason: string) {
    this.db
      .prepare('INSERT INTO reports (reporter,target,reason,at) VALUES (?,?,?,?)')
      .run(reporter, target, reason, Date.now());
  }
  deleteAccount(id: string) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM graves WHERE account_id=?').run(id);
      this.db.prepare('DELETE FROM reports WHERE reporter=? OR target=?').run(id, id);
      this.db.prepare('DELETE FROM bans WHERE account_id=?').run(id);
      this.db.prepare('DELETE FROM accounts WHERE id=?').run(id);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
