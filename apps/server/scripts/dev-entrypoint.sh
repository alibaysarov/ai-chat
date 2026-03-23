#!/bin/sh

set -eu

npm ci
npm exec --workspace=server -- prisma generate
npm run build --workspace=@ai-chat/shared
npm run dev --workspace=@ai-chat/shared &
shared_pid=$!

cleanup() {
  kill "$shared_pid" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

npm run dev:nodemon --workspace=server