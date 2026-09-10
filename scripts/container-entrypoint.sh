#!/bin/sh
set -eu

# A newly mounted persistent volume is root-owned. Initialize its directory,
# then run the realm as the unprivileged node user, including graceful shutdown.
if [ "$(id -u)" = '0' ]; then
  game_data_dir=$(dirname "${DATA_PATH:-/app/data/emberwilds.sqlite}")
  mkdir -p "$game_data_dir"
  chown node:node "$game_data_dir"
  exec gosu node "$@"
fi
exec "$@"
