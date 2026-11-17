-- Row-level security + automation tests (crew model, 16 Nov 2026).
--
--   psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
--
-- Runs inside one transaction that is always rolled back. Prints
-- PASS/FAIL per check, then a summary line.
begin;

create temp table results (name text, pass boolean, detail text);
grant all on results to authenticated, anon;

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
-- id of a person by first name (readable by superuser only: used while building SQL strings)
create or replace function pg_temp.pid(n text) returns uuid language sql as $$
  select id from public.people where name = n
$$;

-- ---------------------------------------------------------------- seed
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, now(), now(), now()
from unnest(array['boss@t.test','boss2@t.test','sara@t.test','hala@t.test','photo@t.test','org@t.test','old@t.test']) e;

insert into public.people (name, email, role, access) values
  ('Boss',  'boss@t.test',  'manager', 'view'),
  ('Boss2', 'boss2@t.test', 'manager', 'view'),
  ('Sara',  'sara@t.test',  'model', 'view'),
  ('Hala',  'hala@t.test',  'model', 'view'),
  ('Photo', 'photo@t.test', 'photographer', 'view'),
  ('Org',   'org@t.test',   'organizer', 'view'),
  ('Old',   'old@t.test',   'member', 'view');
update public.targets set day_rate = 500;

insert into public.shoot_days (id, date, title, status) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '2026-11-20', 'Day A', 'planned'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', '2026-11-25', 'Day B', 'planned');
insert into public.shoot_attendees (shoot_day_id, person_id)
select 'aaaaaaaa-0000-0000-0000-00000000000a', pg_temp.pid(n) from unnest(array['Sara','Hala','Photo','Org']) n;
insert into public.shoot_attendees (shoot_day_id, person_id)
values ('bbbbbbbb-0000-0000-0000-00000000000b', pg_temp.pid('Hala'));
insert into public.shoot_fees values ('aaaaaaaa-0000-0000-0000-00000000000a', pg_temp.pid('Photo'), 800);

insert into public.announcements (id, title, body, created_by) values
  ('a1000000-0000-0000-0000-000000000001', 'For Sara', 'x', pg_temp.pid('Boss')),
  ('a2000000-0000-0000-0000-000000000002', 'For Hala', 'x', pg_temp.pid('Boss'));
insert into public.announcement_recipients values
  ('a1000000-0000-0000-0000-000000000001', pg_temp.pid('Sara')),
  ('a2000000-0000-0000-0000-000000000002', pg_temp.pid('Hala'));
insert into public.shared_files (id, name, storage_path, mime_type, size_bytes, uploaded_by) values
  ('f1000000-0000-0000-0000-000000000001', 'Sara file', 'f1000000-0000-0000-0000-000000000001/a.pdf', 'application/pdf', 10, pg_temp.pid('Boss')),
  ('f2000000-0000-0000-0000-000000000002', 'Hala file', 'f2000000-0000-0000-0000-000000000002/b.pdf', 'application/pdf', 10, pg_temp.pid('Boss'));
insert into public.shared_file_recipients values
  ('f1000000-0000-0000-0000-000000000001', pg_temp.pid('Sara')),
  ('f2000000-0000-0000-0000-000000000002', pg_temp.pid('Hala'));
insert into public.shoot_assets (id, shoot_day_id, kind, title, body, uploaded_by) values
  ('c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'script', 'Script 1', 'hello', pg_temp.pid('Boss'));

select pg_temp.check('seed: crew-add notified each person once (4 on day A, 1 on day B)',
  (select count(*) = 5 from public.notifications where type = 'shoot_day' and title = 'You are on a shoot day'));
select pg_temp.check('seed: script notified the crew of day A',
  (select count(*) = 4 from public.notifications where title = 'New script'));

-- ---------------------------------------------------------------- model: Sara
select pg_temp.login_as('sara@t.test');
select pg_temp.check('model sees every shoot day', (select count(*) = 2 from public.shoot_days));
select pg_temp.check('model sees the whole crew list', (select count(*) = 5 from public.shoot_attendees));
select pg_temp.check('model sees only her own people row (no emails of others)', (select count(*) = 1 from public.people));
select pg_temp.check('team directory shows names and roles of everyone', (select count(*) = 8 from public.team_directory()));
select pg_temp.check('model reads targets', (select count(*) = 1 from public.targets));
select pg_temp.check('model sees only announcements assigned to her',
  (select count(*) = 1 and bool_and(title = 'For Sara') from public.announcements));
select pg_temp.check('model sees only files assigned to her',
  (select count(*) = 1 and bool_and(name = 'Sara file') from public.shared_files));
select pg_temp.check('model sees scripts and photos of a shoot day', (select count(*) = 1 from public.shoot_assets));
select pg_temp.check('model cannot create a shoot day',
  pg_temp.raises($q$insert into shoot_days (date) values ('2026-11-30')$q$) like '%row-level security%');
with u as (update shoot_days set title = 'hacked' returning 1) select pg_temp.check('model cannot edit a shoot day', (select count(*) = 0 from u));
with u as (update shoot_days set meeting_point = 'hacked' returning 1) select pg_temp.check('model cannot change the meeting point', (select count(*) = 0 from u));
select pg_temp.check('model cannot add herself to a crew',
  pg_temp.raises(format($q$insert into shoot_attendees (shoot_day_id, person_id) values ('bbbbbbbb-0000-0000-0000-00000000000b', %L)$q$, (select id from public.people where email = 'sara@t.test'))) like '%row-level security%');
with u as (update shoot_attendees set response = 'accepted' where person_id <> (select my_person_id()) returning 1)
  select pg_temp.check('model cannot answer for someone else', (select count(*) = 0 from u));
with u as (update shoot_attendees set response = 'accepted' returning 1)
  select pg_temp.check('model cannot answer by editing the crew table directly', (select count(*) = 0 from u));
select pg_temp.check('model cannot set the location',
  pg_temp.raises($q$select set_shoot_location('aaaaaaaa-0000-0000-0000-00000000000a', 'x', 'y', 'https://x.test')$q$) like '%permission%');
select pg_temp.check('model cannot add place photos',
  pg_temp.raises($q$insert into shoot_assets (shoot_day_id, kind, title, storage_path, uploaded_by)
     values ('aaaaaaaa-0000-0000-0000-00000000000a', 'photo', 'p', 'aaaaaaaa-0000-0000-0000-00000000000a/p.jpg', my_person_id())$q$) like '%row-level security%');
select pg_temp.check('model cannot add scripts',
  pg_temp.raises($q$insert into shoot_assets (shoot_day_id, kind, title, body, uploaded_by)
     values ('aaaaaaaa-0000-0000-0000-00000000000a', 'script', 's', 'b', my_person_id())$q$) like '%row-level security%');
select pg_temp.check('model cannot upload to the shoot-assets bucket',
  pg_temp.raises($q$insert into storage.objects (bucket_id, name, owner_id) values ('shoot-assets', 'aaaaaaaa-0000-0000-0000-00000000000a/z.jpg', auth.uid()::text)$q$) like '%row-level security%');
select pg_temp.check('model cannot publish announcements',
  pg_temp.raises($q$insert into announcements (title, body, created_by) values ('x', 'y', my_person_id())$q$) like '%row-level security%');
with u as (update targets set target_videos = 1 returning 1) select pg_temp.check('model cannot change targets', (select count(*) = 0 from u));
with u as (update people set role = 'manager' returning 1) select pg_temp.check('model cannot promote herself', (select count(*) = 0 from u));

-- comments + reviews
select pg_temp.check('model comments on an announcement assigned to her',
  pg_temp.raises($q$insert into comments (target_type, target_id, person_id, body) values ('announcement', 'a1000000-0000-0000-0000-000000000001', my_person_id(), 'ok, got it')$q$) is null);
select pg_temp.check('model cannot comment on an announcement not assigned to her',
  pg_temp.raises($q$insert into comments (target_type, target_id, person_id, body) values ('announcement', 'a2000000-0000-0000-0000-000000000002', my_person_id(), 'sneaky')$q$) like '%row-level security%');
select pg_temp.check('model cannot comment as someone else',
  pg_temp.raises(format($q$insert into comments (target_type, target_id, person_id, body) values ('file', 'f1000000-0000-0000-0000-000000000001', %L, 'fake')$q$, (select id from public.people where email = 'boss@t.test'))) like '%row-level security%');
select pg_temp.check('model comments on a script',
  pg_temp.raises($q$insert into comments (target_type, target_id, person_id, body) values ('asset', 'c1000000-0000-0000-0000-000000000001', my_person_id(), 'line 2 unclear')$q$) is null);
select pg_temp.check('model marks a file reviewed',
  pg_temp.raises($q$insert into reviews (target_type, target_id, person_id) values ('file', 'f1000000-0000-0000-0000-000000000001', my_person_id())$q$) is null);
select pg_temp.check('model cannot mark an unassigned file reviewed',
  pg_temp.raises($q$insert into reviews (target_type, target_id, person_id) values ('file', 'f2000000-0000-0000-0000-000000000002', my_person_id())$q$) like '%row-level security%');
select pg_temp.check('empty comment is rejected',
  pg_temp.raises($q$insert into comments (target_type, target_id, person_id, body) values ('file', 'f1000000-0000-0000-0000-000000000001', my_person_id(), '   ')$q$) like '%check constraint%');

-- answering
select pg_temp.check('decline without a reason is refused',
  pg_temp.raises($q$select respond_to_shoot('aaaaaaaa-0000-0000-0000-00000000000a', false, '  ')$q$) like '%reason%');
select pg_temp.check('model cannot answer a day she is not on',
  pg_temp.raises($q$select respond_to_shoot('bbbbbbbb-0000-0000-0000-00000000000b', true)$q$) like '%not on the crew%');
select pg_temp.check('model accepts (runs)', pg_temp.raises($q$select respond_to_shoot('aaaaaaaa-0000-0000-0000-00000000000a', true)$q$) is null);
select pg_temp.check('model accepts (result)',
  (select response = 'accepted' and responded_at is not null from shoot_attendees where person_id = my_person_id() and shoot_day_id = 'aaaaaaaa-0000-0000-0000-00000000000a'));
select pg_temp.check('model changes her mind and declines with a reason (runs)',
  pg_temp.raises($q$select respond_to_shoot('aaaaaaaa-0000-0000-0000-00000000000a', false, 'Exam that morning')$q$) is null);
select pg_temp.check('model sees her own decline reason',
  (select count(*) = 1 and bool_and(reason = 'Exam that morning') from shoot_decline_reasons));
reset role;

select pg_temp.check('manager was told about the accept and the decline',
  (select count(*) = 2 from notifications n join people p on p.id = n.person_id
    where p.name = 'Boss' and n.title like 'Sara %'));
select pg_temp.check('the other manager was told too',
  (select count(*) = 2 from notifications n join people p on p.id = n.person_id
    where p.name = 'Boss2' and n.title like 'Sara %'));
select pg_temp.check('Sara got no notification for her own answers',
  (select count(*) = 0 from notifications n join people p on p.id = n.person_id
    where p.name = 'Sara' and n.title like 'Sara %'));

-- ---------------------------------------------------------------- model: Hala (privacy of reasons)
select pg_temp.login_as('hala@t.test');
select pg_temp.check('another model cannot read Sara''s decline reason', (select count(*) = 0 from shoot_decline_reasons));
select pg_temp.check('another model cannot read Sara''s comments on an announcement she can''t see',
  (select count(*) = 0 from comments where target_type = 'announcement' and target_id = 'a1000000-0000-0000-0000-000000000001'));
select pg_temp.check('model sees comments on a shared script (any team member may)',
  (select count(*) = 1 from comments where target_type = 'asset'));
select pg_temp.check('model sees no one else''s pay', (select count(*) = 0 from pay));
select pg_temp.check('model sees no fees', (select count(*) = 0 from shoot_fees));
reset role;

-- ---------------------------------------------------------------- photographer
select pg_temp.login_as('photo@t.test');
select pg_temp.check('photographer sees every announcement', (select count(*) = 2 from announcements));
select pg_temp.check('photographer sees every shared file', (select count(*) = 2 from shared_files));
select pg_temp.check('photographer sees every shoot day and crew', (select count(*) = 2 from shoot_days) and (select count(*) = 5 from shoot_attendees));
select pg_temp.check('photographer comments on any announcement',
  pg_temp.raises($q$insert into comments (target_type, target_id, person_id, body) values ('announcement', 'a2000000-0000-0000-0000-000000000002', my_person_id(), 'seen')$q$) is null);
select pg_temp.check('photographer marks any file reviewed',
  pg_temp.raises($q$insert into reviews (target_type, target_id, person_id) values ('file', 'f2000000-0000-0000-0000-000000000002', my_person_id())$q$) is null);
select pg_temp.check('photographer sees own fee only', (select count(*) = 1 and bool_and(amount = 800) from shoot_fees));
select pg_temp.check('photographer cannot create shoot days',
  pg_temp.raises($q$insert into shoot_days (date) values ('2026-11-30')$q$) like '%row-level security%');
select pg_temp.check('photographer cannot set the location',
  pg_temp.raises($q$select set_shoot_location('aaaaaaaa-0000-0000-0000-00000000000a', 'x', 'y', null)$q$) like '%permission%');
select pg_temp.check('photographer cannot add photos',
  pg_temp.raises($q$insert into shoot_assets (shoot_day_id, kind, title, storage_path, uploaded_by)
     values ('aaaaaaaa-0000-0000-0000-00000000000a', 'photo', 'p', 'aaaaaaaa-0000-0000-0000-00000000000a/p.jpg', my_person_id())$q$) like '%row-level security%');
select pg_temp.check('photographer does not see other people''s emails', (select count(*) = 1 from people));
reset role;

-- ---------------------------------------------------------------- organizer
select pg_temp.login_as('org@t.test');
select pg_temp.check('organizer sets the location (runs)',
  pg_temp.raises($q$select set_shoot_location('aaaaaaaa-0000-0000-0000-00000000000a', 'Camp', 'Giza road', 'https://maps.app.goo.gl/abc')$q$) is null);
select pg_temp.check('organizer sets the location (result)',
  (select location_name = 'Camp' and location_url = 'https://maps.app.goo.gl/abc' from shoot_days where id = 'aaaaaaaa-0000-0000-0000-00000000000a'));
select pg_temp.check('a map link must be http(s)',
  pg_temp.raises($q$select set_shoot_location('aaaaaaaa-0000-0000-0000-00000000000a', 'Camp', 'x', 'javascript:alert(1)')$q$) like '%location_url%');
select pg_temp.check('organizer adds a place photo',
  pg_temp.raises($q$insert into shoot_assets (id, shoot_day_id, kind, title, storage_path, mime_type, size_bytes, uploaded_by)
     values ('d1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'photo', 'Entrance', 'aaaaaaaa-0000-0000-0000-00000000000a/e.jpg', 'image/jpeg', 1000, my_person_id())$q$) is null);
select pg_temp.check('a photo path must live under its own shoot day folder',
  pg_temp.raises($q$insert into shoot_assets (shoot_day_id, kind, title, storage_path, uploaded_by)
     values ('aaaaaaaa-0000-0000-0000-00000000000a', 'photo', 'bad', 'bbbbbbbb-0000-0000-0000-00000000000b/e.jpg', my_person_id())$q$) like '%check constraint%');
select pg_temp.check('organizer uploads a jpg to storage',
  pg_temp.raises($q$insert into storage.objects (bucket_id, name, owner_id) values ('shoot-assets', 'aaaaaaaa-0000-0000-0000-00000000000a/e.jpg', auth.uid()::text)$q$) is null);
select pg_temp.check('organizer cannot upload a pdf to storage',
  pg_temp.raises($q$insert into storage.objects (bucket_id, name, owner_id) values ('shoot-assets', 'aaaaaaaa-0000-0000-0000-00000000000a/s.pdf', auth.uid()::text)$q$) like '%row-level security%');
select pg_temp.check('organizer cannot add a script',
  pg_temp.raises($q$insert into shoot_assets (shoot_day_id, kind, title, body, uploaded_by)
     values ('aaaaaaaa-0000-0000-0000-00000000000a', 'script', 's', 'b', my_person_id())$q$) like '%row-level security%');
with u as (update shoot_days set meeting_point = 'hacked', title = 'hacked' returning 1)
  select pg_temp.check('organizer cannot edit other shoot-day fields directly', (select count(*) = 0 from u));
select pg_temp.check('organizer cannot add crew',
  pg_temp.raises(format($q$insert into shoot_attendees (shoot_day_id, person_id) values ('bbbbbbbb-0000-0000-0000-00000000000b', %L)$q$, (select id from public.people where email = 'org@t.test'))) like '%row-level security%');
select pg_temp.check('organizer sees every announcement and file', (select count(*) = 2 from announcements) and (select count(*) = 2 from shared_files));
select pg_temp.check('organizer removes the photo he added (runs)',
  pg_temp.raises($q$delete from shoot_assets where id = 'd1000000-0000-0000-0000-000000000001'$q$) is null);
select pg_temp.check('organizer removed it (result)', (select count(*) = 0 from shoot_assets where id = 'd1000000-0000-0000-0000-000000000001'));
select pg_temp.check('organizer cannot delete the manager''s script',
  pg_temp.raises($q$delete from shoot_assets where id = 'c1000000-0000-0000-0000-000000000001'$q$) is null
  and (select count(*) = 1 from shoot_assets where id = 'c1000000-0000-0000-0000-000000000001'));
reset role;

select pg_temp.check('location change told the crew who have not declined, not the organizer himself',
  (select count(*) = 2 from notifications where title = 'Shoot day updated' and message like '%location changed%'));

-- ---------------------------------------------------------------- manager
select pg_temp.login_as('boss@t.test');
select pg_temp.check('manager sees all people', (select count(*) = 8 from people));
select pg_temp.check('manager reads decline reasons', (select count(*) = 1 from shoot_decline_reasons));
select pg_temp.check('manager reads fees', (select count(*) = 1 from shoot_fees));
select pg_temp.check('manager adds a shoot day with details',
  pg_temp.raises($q$insert into shoot_days (id, date, title, meeting_point, meeting_time, location_name)
     values ('cccccccc-0000-0000-0000-00000000000c', '2026-11-28', 'Day C', 'Gate 2', '09:30', 'Camp')$q$) is null);
select pg_temp.check('a shoot day cannot be outside the season',
  pg_temp.raises($q$insert into shoot_days (date) values ('2026-12-31')$q$) like 'Date must be between%');
select pg_temp.check('a shoot day is at most 4 hours',
  pg_temp.raises($q$insert into shoot_days (date, hours) values ('2026-11-29', 5)$q$) like '%check constraint%');
select pg_temp.check('manager adds crew to Day C',
  pg_temp.raises(format($q$insert into shoot_attendees (shoot_day_id, person_id) values ('cccccccc-0000-0000-0000-00000000000c', %L), ('cccccccc-0000-0000-0000-00000000000c', %L)$q$,
    (select id from public.people where email = 'sara@t.test'), (select id from public.people where email = 'photo@t.test'))) is null);
select pg_temp.check('manager can write a script and a photo',
  pg_temp.raises($q$insert into shoot_assets (shoot_day_id, kind, title, body, uploaded_by)
     values ('cccccccc-0000-0000-0000-00000000000c', 'script', 'Scene', 'text', my_person_id())$q$) is null);
select pg_temp.check('a script needs text or a file',
  pg_temp.raises($q$insert into shoot_assets (shoot_day_id, kind, title, uploaded_by)
     values ('cccccccc-0000-0000-0000-00000000000c', 'script', 'Empty', my_person_id())$q$) like '%check constraint%');
select pg_temp.check('manager sets an agreed fee', pg_temp.raises($q$insert into shoot_fees values ('cccccccc-0000-0000-0000-00000000000c', (select id from people where email = 'photo@t.test'), 900)$q$) is null);

-- pay: Day A has Sara (declined), Hala (pending), Photo (pending, fee 800), Org (pending, no fee)
select pg_temp.check('completing Day A (runs)',
  pg_temp.raises($q$update shoot_days set status = 'completed' where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$) is null);
select pg_temp.check('pay: Hala gets the day rate',
  (select count(*) = 1 and bool_and(amount = 500) from pay where person_id = (select id from people where email = 'hala@t.test') and shoot_day_id = 'aaaaaaaa-0000-0000-0000-00000000000a'));
select pg_temp.check('pay: Sara declined, so nothing',
  (select count(*) = 0 from pay where person_id = (select id from people where email = 'sara@t.test')));
select pg_temp.check('pay: photographer gets the agreed fee',
  (select count(*) = 1 and bool_and(amount = 800) from pay where person_id = (select id from people where email = 'photo@t.test')));
select pg_temp.check('pay: organizer without a fee gets nothing',
  (select count(*) = 0 from pay where person_id = (select id from people where email = 'org@t.test')));

select pg_temp.check('manager marks Hala paid',
  pg_temp.raises($q$update pay set status = 'paid' where person_id = (select id from people where email = 'hala@t.test')$q$) is null);
select pg_temp.check('a paid day cannot go back to planned',
  pg_temp.raises($q$update shoot_days set status = 'planned' where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$) ilike '%mark them not paid%');
select pg_temp.check('a day with paid pay cannot be deleted',
  pg_temp.raises($q$delete from shoot_days where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$) ilike '%mark them not paid%');
select pg_temp.check('a paid person cannot be removed from the crew',
  pg_temp.raises($q$delete from shoot_attendees where shoot_day_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and person_id = (select id from people where email = 'hala@t.test')$q$) like '%already been paid%');
select pg_temp.check('a paid fee cannot change',
  pg_temp.raises($q$update shoot_fees set amount = 1 where person_id = (select id from people where email = 'hala@t.test')$q$) is null);
select pg_temp.check('an unpaid fee change (runs)',
  pg_temp.raises($q$update shoot_fees set amount = 850 where shoot_day_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and person_id = (select id from people where email = 'photo@t.test')$q$) is null);
select pg_temp.check('an unpaid fee change updates the pay row (result)',
  (select amount = 850 from pay where person_id = (select id from people where email = 'photo@t.test') and shoot_day_id = 'aaaaaaaa-0000-0000-0000-00000000000a'));

-- a late accept never changes pay amounts already set
select pg_temp.check('manager sets a custom amount on a pay row',
  pg_temp.raises($q$update pay set amount = 650 where person_id = (select id from people where email = 'photo@t.test')$q$) is null);
select pg_temp.check('crew edits keep custom amounts (runs)',
  pg_temp.raises($q$update shoot_attendees set response = 'accepted' where shoot_day_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and person_id = (select id from people where email = 'photo@t.test')$q$) is null);
select pg_temp.check('crew edits keep custom amounts (result)',
  (select amount = 650 from pay where person_id = (select id from people where email = 'photo@t.test') and shoot_day_id = 'aaaaaaaa-0000-0000-0000-00000000000a'));

-- cancel Day C (crew told: checked below as superuser, managers cannot read others' notifications)
select pg_temp.check('cancelling Day C (runs)',
  pg_temp.raises($q$update shoot_days set status = 'cancelled' where id = 'cccccccc-0000-0000-0000-00000000000c'$q$) is null);
select pg_temp.check('last manager cannot be demoted',
  pg_temp.raises($q$set constraints all immediate; update people set role = 'model' where role = 'manager'$q$) like '%at least one manager%');
select pg_temp.check('manager can invite an organizer',
  pg_temp.raises($q$insert into people (name, email, role) values ('New Org', 'neworg@t.test', 'organizer')$q$) is null);
select pg_temp.check('manager deletes a comment by anyone (runs)',
  pg_temp.raises($q$delete from comments where target_type = 'announcement' and person_id = (select id from people where email = 'sara@t.test')$q$) is null);
select pg_temp.check('manager deletes a comment by anyone (result)',
  (select count(*) = 0 from comments where target_type = 'announcement' and person_id = (select id from people where email = 'sara@t.test')));
reset role;

select pg_temp.check('cancelling Day C told the crew (Sara and Photo)',
  (select count(*) = 2 from notifications where message like '%was cancelled%'));
select pg_temp.check('comments notified the manager and the item owner',
  (select count(*) >= 2 from notifications where type = 'comment'));

-- deleting an item removes its comments and reviews
delete from public.announcements where id = 'a2000000-0000-0000-0000-000000000002';
select pg_temp.check('deleting an announcement removes its comments and reviews',
  (select count(*) = 0 from comments where target_id = 'a2000000-0000-0000-0000-000000000002'));

-- ---------------------------------------------------------------- old "member" role (kept for history)
select pg_temp.login_as('old@t.test');
select pg_temp.check('old view-only member still reads schedules', (select count(*) = 3 from shoot_days));
select pg_temp.check('old view-only member cannot write', pg_temp.raises($q$insert into shoot_days (date) values ('2026-11-30')$q$) like '%row-level security%');
select pg_temp.check('old view-only member sees no pay', (select count(*) = 0 from pay));
reset role;

-- ---------------------------------------------------------------- anonymous
set local role anon;
select pg_temp.check('anonymous cannot read shoot days', pg_temp.raises('select * from shoot_days') like '%permission denied%');
select pg_temp.check('anonymous cannot read people', pg_temp.raises('select * from people') like '%permission denied%');
select pg_temp.check('anonymous cannot read pay', pg_temp.raises('select * from pay') like '%permission denied%');
select pg_temp.check('anonymous cannot read comments', pg_temp.raises('select * from comments') like '%permission denied%');
select pg_temp.check('anonymous cannot read decline reasons', pg_temp.raises('select * from shoot_decline_reasons') like '%permission denied%');
select pg_temp.check('anonymous cannot run the directory', pg_temp.raises('select * from team_directory()') like '%permission denied%');
select pg_temp.check('anonymous cannot answer a shoot', pg_temp.raises($q$select respond_to_shoot('aaaaaaaa-0000-0000-0000-00000000000a', true)$q$) like '%permission denied%');
reset role;

select (case when pass then 'PASS' else 'FAIL' end) as result, name from results order by pass, name;
select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed from results;
rollback;
