-- Row-level security tests. Run with:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
-- Everything runs inside a transaction that is rolled back.
begin;

create temp table results (name text, pass boolean, detail text);
grant all on results to authenticated, anon;

-- helper: act as the login with this email
create or replace function pg_temp.login_as(e text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = e), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.check(n text, ok boolean, d text default '') returns void language sql as $$
  insert into results values (n, coalesce(ok, false), d);
$$;
create or replace function pg_temp.raises(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlerrm;
end $$;

-- ---------- as Sara (model) ----------
select pg_temp.login_as('sara@example.com');
select pg_temp.check('model sees only herself in people', (select count(*) = 1 and bool_and(email = 'sara@example.com') from people));
select pg_temp.check('model sees only own availability', (select count(*) > 0 and bool_and(person_id = my_person_id()) from availability));
select pg_temp.check('model sees only own shoot days (no free/other days)', (select count(*) > 0 and bool_and(person_id = my_person_id()) from shoot_days));
select pg_temp.check('model sees only own pay', (select count(*) > 0 and bool_and(person_id = my_person_id()) from pay));
select pg_temp.check('model can read targets', (select count(*) = 1 from targets));

select pg_temp.check('model cannot add availability for Mona', pg_temp.raises($q$insert into availability (person_id, date, start_time, end_time)
     values ((select id from public.people where email='mona@example.com'), '2026-11-30', '10:00', '12:00')$q$) like '%row-level security%');
-- (she can't even look up Mona's id: subquery returns null -> not-null violation; both are refusals)

select pg_temp.check('model can add own availability',
  pg_temp.raises($q$insert into availability (person_id, date, start_time, end_time) values (my_person_id(), '2026-11-30', '10:00', '12:00')$q$) is null);
select pg_temp.check('model can add 2nd window same day (split hours)',
  pg_temp.raises($q$insert into availability (person_id, date, start_time, end_time) values (my_person_id(), '2026-11-30', '14:00', '18:00')$q$) is null);
select pg_temp.check('6-hour daily cap enforced',
  pg_temp.raises($q$insert into availability (person_id, date, start_time, end_time) values (my_person_id(), '2026-11-30', '19:00', '20:00')$q$) like 'Maximum is 6 hours%');
select pg_temp.check('overlapping windows rejected',
  pg_temp.raises($q$insert into availability (person_id, date, start_time, end_time) values (my_person_id(), '2026-12-01', '10:00', '12:00'), (my_person_id(), '2026-12-01', '11:00', '13:00')$q$) like '%overlaps%');
select pg_temp.check('date before Nov 10 rejected',
  pg_temp.raises($q$insert into availability (person_id, date, start_time, end_time) values (my_person_id(), '2026-11-09', '10:00', '12:00')$q$) like 'Date must be between%');
select pg_temp.check('date after Dec 10 rejected',
  pg_temp.raises($q$insert into availability (person_id, date, start_time, end_time) values (my_person_id(), '2026-12-11', '10:00', '12:00')$q$) like 'Date must be between%');
select pg_temp.check('end before start rejected',
  pg_temp.raises($q$insert into availability (person_id, date, start_time, end_time) values (my_person_id(), '2026-12-02', '12:00', '10:00')$q$) like '%check constraint%');
select pg_temp.check('hours column computed', (select hours = 4 from availability where date='2026-11-30' and start_time='14:00'));

with u as (update shoot_days set videos_planned = 99 returning 1) select pg_temp.check('model cannot edit shoot days', (select count(*) = 0 from u));
with u as (update pay set status = 'paid', amount = 999999 returning 1) select pg_temp.check('model cannot mark own pay paid', (select count(*) = 0 from u));
with u as (update people set role = 'manager' returning 1) select pg_temp.check('model cannot promote herself', (select count(*) = 0 from u));
with u as (update targets set target_videos = 1 returning 1) select pg_temp.check('model cannot change targets', (select count(*) = 0 from u));
select pg_temp.check('model cannot invite people',
  pg_temp.raises($q$insert into people (name, email, role) values ('x', 'x@example.com', 'manager')$q$) like '%row-level security%');
select pg_temp.check('model cannot accept a day not offered to her',
  pg_temp.raises($q$select respond_to_shoot_day((select id from shoot_days where status='confirmed' limit 1), true)$q$) like '%not waiting%');
reset role;

-- ---------- as Mona (model) ----------
select pg_temp.login_as('mona@example.com');
select pg_temp.check('Mona cannot see any of Sara''s rows',
  (select count(*) = 0 from availability a where a.person_id <> my_person_id())
  and (select count(*) = 0 from shoot_days s where s.person_id is distinct from my_person_id())
  and (select count(*) = 0 from pay p where p.person_id <> my_person_id()));
with d as (delete from availability where person_id <> my_person_id() returning 1)
  select pg_temp.check('Mona cannot delete Sara''s availability', (select count(*) = 0 from d));
select pg_temp.check('Mona can accept her offered day (runs)',
  pg_temp.raises($q$select respond_to_shoot_day((select id from shoot_days where status='offered'), true)$q$) is null);
select pg_temp.check('Mona can accept her offered day (result)', (select status = 'confirmed' from shoot_days where date = '2026-11-18'));
reset role;

-- ---------- as manager ----------
select pg_temp.login_as('manager@example.com');
select pg_temp.check('manager sees all people (2 managers + 2 models)', (select count(*) = 4 from people));
select pg_temp.check('manager sees everyone''s availability', (select count(distinct person_id) = 2 from availability));
select pg_temp.check('manager sees free days too', (select count(*) = 5 from shoot_days));
select pg_temp.check('manager can invite a view-only member', pg_temp.raises($q$insert into people (name, email, role, access) values ('Viewer', 'viewer@example.com', 'member', 'view'),
                                                                        ('Editor', 'editor@example.com', 'member', 'edit')$q$) is null);
select pg_temp.check('manager can set day rate', pg_temp.raises($q$update targets set day_rate = 3500$q$) is null);
select pg_temp.check('completing a day creates a pay row (runs)',
  pg_temp.raises($q$update shoot_days set status = 'completed' where date = '2026-11-15'$q$) is null);
select pg_temp.check('completing a day creates a pay row (result)', (select p.amount = 3500 and p.status = 'not_paid' from pay p join shoot_days s on s.id = p.shoot_day_id where s.date = '2026-11-15'));
select pg_temp.check('manager can mark paid (runs)', pg_temp.raises($q$update pay set status = 'paid' where shoot_day_id = (select id from shoot_days where date='2026-11-15')$q$) is null);
select pg_temp.check('manager can mark paid (result)', (select paid_at is not null from pay where shoot_day_id = (select id from shoot_days where date='2026-11-15')));
select pg_temp.check('cannot un-complete a paid day', pg_temp.raises($q$update shoot_days set status = 'confirmed' where date = '2026-11-15'$q$) like '%already paid%');
select pg_temp.check('shoot day over 6 hours rejected',
  pg_temp.raises($q$insert into shoot_days (date, hours) values ('2026-11-26', 7)$q$) like '%check constraint%');
select pg_temp.check('assigning a person auto-sets status offered (runs)',
  pg_temp.raises($q$update shoot_days set person_id = (select id from people where email='sara@example.com') where date = '2026-11-22'$q$) is null);
select pg_temp.check('assigning a person auto-sets status offered (result)', (select status = 'offered' from shoot_days where date = '2026-11-22'));
select pg_temp.check('cannot remove the last manager',
  pg_temp.raises($q$set constraints all immediate; update people set role = 'model' where role = 'manager'$q$) like '%at least one manager%');
reset role;

-- give the two members logins so we can test them
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer@example.com', now(), now(), now()),
       (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor@example.com', now(), now(), now());
select pg_temp.check('logins auto-link to people rows by email',
  (select count(*) = 2 from people where email in ('viewer@example.com','editor@example.com') and user_id is not null));

-- ---------- as view-only member ----------
select pg_temp.login_as('viewer@example.com');
select pg_temp.check('viewer sees all schedules', (select count(*) = 5 from shoot_days) and (select count(distinct person_id) = 2 from availability));
select pg_temp.check('viewer does NOT see pay', (select count(*) = 0 from pay));
with u as (update shoot_days set videos_planned = 1 returning 1) select pg_temp.check('viewer cannot edit shoot days', (select count(*) = 0 from u));
select pg_temp.check('viewer cannot add availability for a model',
  pg_temp.raises($q$insert into availability (person_id, date, start_time, end_time)
     values ((select id from people where email='mona@example.com'), '2026-12-05', '10:00', '12:00')$q$) like '%row-level security%');
reset role;

-- ---------- as edit member ----------
select pg_temp.login_as('editor@example.com');
with u as (update shoot_days set videos_planned = 6 where date = '2026-11-22' returning 1) select pg_temp.check('editor can edit shoot days', (select count(*) = 1 from u));
select pg_temp.check('editor can add availability for a model',
  pg_temp.raises($q$insert into availability (person_id, date, start_time, end_time)
     values ((select id from people where email='mona@example.com'), '2026-12-05', '10:00', '12:00')$q$) is null);
select pg_temp.check('editor does NOT see pay', (select count(*) = 0 from pay));
with u as (update targets set target_videos = 1 returning 1) select pg_temp.check('editor cannot change targets', (select count(*) = 0 from u));
select pg_temp.check('editor cannot invite people',
  pg_temp.raises($q$insert into people (name, email, role) values ('y', 'y@example.com', 'model')$q$) like '%row-level security%');
reset role;

-- ---------- anonymous ----------
set local role anon;
select pg_temp.check('anonymous visitor cannot read people', pg_temp.raises('select * from people') like '%permission denied%');
select pg_temp.check('anonymous visitor cannot read pay', pg_temp.raises('select * from pay') like '%permission denied%');
reset role;

select (case when pass then 'PASS' else 'FAIL' end) as result, name from results;
select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed from results;
rollback;
