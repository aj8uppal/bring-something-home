import { Store } from '../server/database.js';
const [command, id, ...reason] = process.argv.slice(2),
  store = new Store(process.env.DATA_PATH || 'data/emberwilds.sqlite');
try {
  if (command === 'reports')
    console.table(
      store.db
        .prepare(
          "SELECT id,reporter,target,reason,datetime(at/1000,'unixepoch') AS time FROM reports ORDER BY at DESC LIMIT 100",
        )
        .all(),
    );
  else if (command === 'ban' && id && store.exists(id)) {
    store.db
      .prepare(
        'INSERT INTO bans VALUES (?,?,?) ON CONFLICT(account_id) DO UPDATE SET reason=excluded.reason,at=excluded.at',
      )
      .run(id, reason.join(' ') || 'Operator suspension', Date.now());
    console.log(`Account ${id} suspended. Active sessions close within 60 seconds.`);
  } else if (command === 'unban' && id) {
    store.db.prepare('DELETE FROM bans WHERE account_id=?').run(id);
    console.log(`Account ${id} can sign in again.`);
  } else if (command === 'resolve' && id && /^\d+$/.test(id)) {
    store.db.prepare('DELETE FROM reports WHERE id=?').run(Number(id));
    console.log(`Report ${id} resolved and removed.`);
  } else {
    console.log(
      'Usage: npm run admin -- reports | ban <account-id> [reason] | unban <account-id> | resolve <report-id>',
    );
    process.exitCode = 1;
  }
} finally {
  store.close();
}
