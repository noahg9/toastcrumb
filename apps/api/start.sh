#!/bin/sh
# Production entrypoint: apply pending DB migrations, then start the API.
# `exec` hands PID 1 to node so it receives SIGTERM/SIGINT cleanly.
set -e
echo ">>> [start] applying database migrations"
./node_modules/.bin/prisma migrate deploy
echo ">>> [start] migrations done; launching node dist/main.js"
exec node dist/main.js
