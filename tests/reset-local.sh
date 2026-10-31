psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -q -c "delete from public.people where email in ('assistant@gmail.com','newmodel@gmail.com'); delete from auth.users where email in ('assistant@gmail.com','newmodel@gmail.com','alhasanmuaath@gmail.com');"
cd "$(dirname "$0")/.." && node --env-file=.env.local scripts/seed.mjs > /dev/null
