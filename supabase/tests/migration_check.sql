-- Asserts the crew migration kept every shoot, payment and answer.
-- Run after legacy_seed.sql + the 20261116000100 migration.
do $$
declare n int; t numeric;
begin
  select count(*) into n from public.shoot_days;
  if n <> 6 then raise exception 'expected 6 shoot days (10 legacy rows merged by date), got %', n; end if;

  select count(*), coalesce(sum(amount), 0) into n, t from public.pay;
  if n <> 8 or t <> 4450 then raise exception 'pay changed: % rows, total % (expected 8 rows, 4450)', n, t; end if;

  if (select p.status from public.pay p join public.people pe on pe.id = p.person_id
       join public.shoot_days d on d.id = p.shoot_day_id
      where pe.name = 'Sara' and d.date = '2026-11-10') <> 'paid' then
    raise exception 'Sara''s paid status on 10 Nov was lost';
  end if;

  if (select p.amount from public.pay p join public.people pe on pe.id = p.person_id
       join public.shoot_days d on d.id = p.shoot_day_id
      where pe.name = 'Zaid' and d.date = '2026-11-15') <> 650 then
    raise exception 'Zaid''s custom 650 amount was lost';
  end if;

  if (select count(*) from public.shoot_attendees a join public.shoot_days d on d.id = a.shoot_day_id
       where d.date = '2026-11-13') <> 3 then
    raise exception '13 Nov should have Sara, Zaid and the photographer on the crew';
  end if;

  if (select videos_planned from public.shoot_days where date = '2026-11-13') <> 2 then
    raise exception '13 Nov videos should be summed to 2';
  end if;

  if (select notes from public.shoot_days where date = '2026-11-13') <> 'bring the red dress' then
    raise exception 'notes were lost';
  end if;

  if (select a.response from public.shoot_attendees a join public.people p on p.id = a.person_id
       join public.shoot_days d on d.id = a.shoot_day_id where p.name = 'Zaid' and d.date = '2026-11-20') <> 'pending' then
    raise exception 'an "offered" day must stay pending';
  end if;

  if (select a.response from public.shoot_attendees a join public.people p on p.id = a.person_id
       join public.shoot_days d on d.id = a.shoot_day_id where p.name = 'Hala' and d.date = '2026-11-20') <> 'accepted' then
    raise exception 'a "confirmed" day must become accepted';
  end if;

  if (select count(*) from public.shoot_fees) <> 1 then raise exception 'photographer fee was lost'; end if;
  if (select count(*) from public.availability) <> 2 then raise exception 'availability rows must be kept'; end if;
  if (select count(*) from public.announcements) <> 1 then raise exception 'announcements must be kept'; end if;

  if exists (select 1 from public.shoot_days where status not in ('planned', 'completed', 'cancelled')) then
    raise exception 'bad status left behind';
  end if;
end $$;

select 'migration check passed' as result;
