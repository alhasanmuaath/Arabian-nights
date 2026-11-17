-- Data shaped like live on 16 Nov 2026, BEFORE the crew migration:
-- one shoot_days row per model per date. Used to test the migration.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, now(), now(), now()
from unnest(array['aws@example.com','sara@example.com','hala@example.com','zaid@example.com','photo@example.com']) e;

insert into public.people (name, email, role) values
  ('Aws', 'aws@example.com', 'manager'), ('Sara', 'sara@example.com', 'model'),
  ('Hala', 'hala@example.com', 'model'), ('Zaid', 'zaid@example.com', 'model'),
  ('Photo', 'photo@example.com', 'photographer');
update public.targets set day_rate = 500, target_hours = 40;

insert into public.shoot_days (date, start_time, hours, person_id, videos_planned, status, notes)
select v.d::date, v.t::time, 4, (select id from public.people where name = v.who), v.n, v.st, v.notes
from (values
  ('2026-11-10', '12:00', 'Sara', 1, 'completed', null),
  ('2026-11-13', '10:00', 'Sara', 1, 'completed', 'bring the red dress'),
  ('2026-11-13', '10:00', 'Zaid', 1, 'completed', null),
  ('2026-11-14', '11:00', 'Hala', 1, 'completed', null),
  ('2026-11-14', '11:00', 'Sara', 1, 'completed', null),
  ('2026-11-15', '09:30', 'Zaid', 1, 'completed', null),
  ('2026-11-15', '10:00', 'Sara', 1, 'completed', null),
  ('2026-11-20', '09:30', 'Zaid', 2, 'offered', null),
  ('2026-11-20', '09:30', 'Hala', 1, 'confirmed', null),
  ('2026-11-22', null, null, 3, 'free', null)
) v(d, t, who, n, st, notes);

-- a photographer on Sara's 13 Nov row with an agreed fee, and one paid model day
insert into public.shoot_photographers (shoot_day_id, photographer_id, agreed_amount)
select sd.id, (select id from public.people where name = 'Photo'), 800
  from public.shoot_days sd join public.people p on p.id = sd.person_id
 where sd.date = '2026-11-13' and p.name = 'Sara';
update public.pay set status = 'paid'
 where person_id = (select id from public.people where name = 'Sara')
   and shoot_day_id = (select id from public.shoot_days where date = '2026-11-10');
update public.pay set amount = 650
 where person_id = (select id from public.people where name = 'Zaid')
   and shoot_day_id in (select id from public.shoot_days where date = '2026-11-15');

insert into public.availability (person_id, date, start_time, end_time)
select id, '2026-11-25', '10:00', '13:00' from public.people where name in ('Sara', 'Hala');

with a as (insert into public.announcements (title, body, created_by)
           select 'Call time', 'Be on time please', id from public.people where name = 'Aws' returning id)
insert into public.announcement_recipients (announcement_id, person_id)
select a.id, p.id from a, public.people p where p.name in ('Sara', 'Zaid');
