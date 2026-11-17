#!/usr/bin/env bash
# Proves the 16 Nov crew migration keeps live-shaped data intact.
# Needs the local Supabase stack (npx supabase start). Resets the LOCAL database.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres

npx supabase db reset --version 20261116000000 >/dev/null 2>&1
psql "$DB" -X -q -v ON_ERROR_STOP=1 -f supabase/tests/legacy_seed.sql
npx supabase migration up --local >/dev/null 2>&1
psql "$DB" -X -At -v ON_ERROR_STOP=1 -f supabase/tests/migration_check.sql
