#!/usr/bin/env bash
# Resets the LOCAL database to the migrations + sample data.
set -euo pipefail
cd "$(dirname "$0")/.."
npx supabase db reset >/dev/null 2>&1
node --env-file=.env.local scripts/seed.mjs >/dev/null
