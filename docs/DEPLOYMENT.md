# Deployment and operation

## Public Fly.io service

The production target is <https://bring-something-home.fly.dev/>. The portfolio
launch URL is <https://aj8uppal.github.io/bring-something-home/>; it preserves realm
and expedition invitation parameters while opening the game. GitHub Pages hosts
the launch page; Fly.io serves the compiled client, API and WebSocket together.

`fly.toml` declares one shared two-CPU, 1 GiB machine in San Jose and a separate
1 GiB encrypted volume named `emberwilds_data`, mounted at `/app/data`. The
existing database filename and schema are retained. Production starts with its
own empty database; development saves are never uploaded. The container
initializes volume ownership and runs the realm as the unprivileged `node` user.
It saves on SIGTERM. Idle machines can stop and start again on a request.

Deploy from this source directory after the release checks below:

```sh
flyctl config validate
flyctl deploy --remote-only --ha=false
flyctl checks list --app bring-something-home
```

Keep this service at **one machine**: the authoritative realm and SQLite store
are local to it. Additional independent machines would create separate account
stores. This is a single-host deployment, with a short interruption during an
upgrade. Health checks use `/api/health`; daily volume snapshots retain seven
days. Take an online database backup before updates that affect stored data.

`TRUST_PROXY=fly` uses Fly Proxy's `Fly-Client-IP` header for rate limits, as
recommended in the [Fly request-header documentation](https://fly.io/docs/networking/request-headers/).
Use that mode only with direct ingress through Fly Proxy. `TRUST_PROXY=1` retains
the separate, explicitly trusted `X-Forwarded-For` configuration for other hosts.
See [Fly's configuration reference](https://fly.io/docs/reference/configuration/)
for machine, volume and autostart options. Public privacy and support information
is served at `/privacy.html` and linked in Settings.

## One-host production deployment

Run the built Node application or the supplied Docker Compose service behind an
HTTPS reverse proxy. The client and WebSocket endpoint use the same origin. A
plain static hosting service cannot run the authoritative game server.

```sh
npm ci
npm run build
NODE_ENV=production HOST=127.0.0.1 PORT=8790 npm start
```

These build commands apply to a source checkout. In an extracted release archive,
run `npm ci --omit=dev` followed by the same production start command; the client
and server are already compiled.

Use a process supervisor, or:

```sh
docker compose up --build -d
```

The container is non-root, binds its published port to localhost, persists the
SQLite database in a named volume, and responds to SIGTERM by saving accounts.
The Compose service has a 1 GiB / 2 CPU resource ceiling. Validate your chosen
hardware with the load test and monitor actual traffic before raising capacity.

Put your own HTTPS hostname in a reverse proxy. An example Caddy configuration:

```caddyfile
play.your-domain.example {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8790
}
```

Replace the example hostname with your real domain and configure its DNS. Caddy
handles the WebSocket upgrade. The game’s Origin check compares the incoming
Origin to the preserved Host; add your exact origin to `ALLOWED_ORIGINS` if your
proxy changes Host. Keep the backend inaccessible from the public internet.
Enable `TRUST_PROXY=1` only when the trusted proxy overwrites X-Forwarded-For;
otherwise clients could spoof the identity used for rate limits. The default
uses the network peer address, so users behind a proxy share a rate bucket until
trusted proxy handling is configured.

The server does not load `.env` automatically. Pass environment values through
your process supervisor, Compose, or Node’s `--env-file` option. `.env.example`
documents supported values. Do not check deployment secrets into source control.

## Health and monitoring

`GET /api/health` returns status, version, realm count, connected sockets, averaged
simulation work time, and uptime. A successful response is HTTP 200. Monitor
availability, process memory, CPU, disk capacity, database errors, WebSocket
restarts, outbound bandwidth, and simulation work time.

The fixed-step budget is 50 ms. Sustained work approaching that budget calls for
lower admission limits or stronger hardware. The load test emits snapshot cadence,
p95 intervals, bandwidth, and peak visible entity counts. It is a short local
stress test, not evidence of internet latency, cross-region scale, or a long soak.

## Backups and restore

For a direct Node deployment:

```sh
npm run backup
# Or choose an unused destination explicitly:
npm run backup -- /secure/backups/emberwilds-before-upgrade.sqlite
```

In a compiled release, use
`node dist-server/scripts/backup.js /secure/backups/emberwilds-before-upgrade.sqlite`.

The script uses SQLite’s online backup API and runs `PRAGMA integrity_check` on
the resulting file. The directory and database may contain player data. Keep
backups private and copy verified backups off the host on a retention schedule.
Do not back up an actively written database by copying only its `.sqlite` file;
recent commits may still be in its WAL.

For Docker, run an equivalent online backup inside the container, then copy the
result out. `node:sqlite` is available in the runtime image:

```sh
docker compose exec game node --input-type=module -e \
  "import {DatabaseSync,backup} from 'node:sqlite'; const db=new DatabaseSync('/app/data/emberwilds.sqlite'); await backup(db,'/app/data/backup.sqlite'); db.close();"
docker compose cp game:/app/data/backup.sqlite ./emberwilds-backup.sqlite
```

To restore:

1. Stop the application and verify it is no longer writing.
2. Preserve the current database and its `-wal` / `-shm` files as a rollback copy.
3. Replace the database with the verified backup. Remove stale WAL/SHM companions
   from the **restored path**, retaining the rollback copy separately.
4. Start the service and check health, login, a character’s gear, and the vault.

Restoring a backup rolls all accounts back to that point. Never restore onto a
running server. Test a restore into a disposable directory before relying on
any new backup procedure.

## Release and rollback

Run `npm run verify`, `npm run test:load`, and `npm audit --omit=dev` before a
release. Keep a database backup and the prior build/container digest. Shut down
gracefully, replace the build, start it, and inspect health. Reconnects return
players to the Hearth after a restart; wardens and events reset.

The initial schema version is 1. Future schema changes need an explicit migration
and rollback plan. Rolling back executable code is safe only when its expected
schema matches the database. Keep old immutable assets available during a rolling
client transition, or do a coordinated restart with a page refresh notice.

## Privacy and operations

The game stores a traveler name, credentials in hashed form, game progress,
inventory, discoveries, tracked relic goals, last expedition results (including public
crew names), and death history. Recovery codes are bearer credentials:
anyone holding one can restore the account. The browser retains its session and
recovery code locally. Chat is transient; player reports retain their supplied text and account IDs
until resolved or the associated account is deleted. Leaderboard names are
visible to other travelers. There are no analytics, tracking pixels, payments,
email addresses, or third-party account services.

For a public service, publish your operator contact and privacy terms, set an
appropriate backup retention policy, and review reports. Players can delete their account from Settings by typing
their exact traveler name; this removes live progress, leaderboard records,
credentials, and associated reports. Backups expire according to your retention
policy.
Plain-text escaping, message caps, rate limits, local muting, and a report queue
are implemented. The operator reviews reports using the CLI below. Do not publish a private
recovery code in a bug report or support conversation.

## Community moderation

Players can mute or report nearby travelers from the realm panel. Reports are
stored privately in SQLite. Review them from an operator shell:

```sh
npm run admin -- reports
npm run admin -- ban ACCOUNT_ID "Reason for suspension"
npm run admin -- unban ACCOUNT_ID
npm run admin -- resolve REPORT_ID
```

A suspension prevents authentication and disconnects an active session within
60 seconds. Resolving a report removes it. These commands require filesystem
access to the database; there is no unauthenticated web admin endpoint. The source
checkout commands use TypeScript tooling. In a compiled release, use
`node dist-server/scripts/admin.js reports` and the same `ban`, `unban`, or
`resolve` arguments after that script path.

## Validation limits

Docker files are supplied but cannot be executed on a host without Docker. The
browser suite runs Chromium, including mobile viewport and touch emulation; it
does not replace real-device Safari/Firefox testing. Launch to a controlled cohort,
monitor actual server and client performance, and tune encounter balance from
real sessions before advertising large-scale capacity. No public domain or
additional hosting account is provisioned by these generic deployment instructions.

The runtime image also includes compiled operator tools, so a container operator
can run `docker compose exec game node dist-server/scripts/admin.js reports` and
`docker compose exec game node dist-server/scripts/backup.js` without installing
TypeScript tooling in the running container.
