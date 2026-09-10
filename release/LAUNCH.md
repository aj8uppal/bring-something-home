# Bring Something Home 1.4.1

**Every life is temporary. What you bring home can outlast it.**

A cooperative bullet-hell RPG of shared expeditions, personal loot, and lasting legacy.

This bundle contains the compiled game and server. It contains no player data,
accounts, credentials, or installed dependencies. Use Node.js 24.15 or later.

From the extracted directory:

```sh
npm ci --omit=dev
NODE_ENV=production HOST=127.0.0.1 PORT=8790 npm start
```

Open http://127.0.0.1:8790. The server creates `data/emberwilds.sqlite` on first
start. Keep that directory between upgrades. Set `DATA_PATH` to choose a different
persistent location. Stop the server gracefully before replacing the application.
Existing save, database, and protocol identifiers are preserved; no migration is required.

The default host accepts local connections. For a public host, follow the TLS,
origin, proxy, persistence, monitoring and moderation setup in
[Deployment](../docs/DEPLOYMENT.md). The game server serves both the client and its
WebSocket endpoint; no separate frontend host is required.

Production maintenance commands use the included compiled scripts:

```sh
node dist-server/scripts/backup.js /secure/backups/emberwilds.sqlite
node dist-server/scripts/admin.js reports
```

Player controls: WASD move, mouse aim/fire, Shift dodge, Space ability, F tonic,
R recall, I autofire, Q counterclockwise / E clockwise, scroll zoom, Page Up/Down
tilt. X takes what fits
from the selected bag. Click a satchel slot to equip, right-click to drop, and
Shift-click a ground slot to swap gear. B opens inspection, item locks and bulk
salvage. P opens the expedition rally board and friend invitations.

Original game code and assets belong to the repository owner. Dependency notices
are included in `THIRD_PARTY_NOTICES.txt`; see `LICENSE` and `CREDITS.md`.

Fullscreen is available from the title toolbar, minimap header, and Settings.
Press Esc or use Exit fullscreen to return to the browser window.
