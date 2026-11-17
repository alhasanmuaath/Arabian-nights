-- =====================================================================
-- SPLIT SHOOT DAYS (17 Nov 2026)
--
-- A shoot day can run in two sessions, e.g. 2 h in the morning and 2 h in
-- the evening. It is still ONE shoot day: one crew, one payment, and the
-- total stays at most 4 hours.
--
--   start_time        first session starts
--   hours             TOTAL hours of the day (both sessions together)
--   second_start_time second session starts (null = not split)
--   second_hours      length of the second session
--
-- The first session lasts (hours - second_hours).
-- Existing shoot days are unchanged (both new columns stay null).
-- =====================================================================

alter table public.shoot_days
  add column if not exists second_start_time time,
  add column if not exists second_hours      numeric(4,2);

alter table public.shoot_days drop constraint if exists shoot_days_split_check;
alter table public.shoot_days add constraint shoot_days_split_check check (
  (second_start_time is null and second_hours is null)
  or (
    second_start_time is not null and second_hours is not null
    and start_time is not null
    and second_hours > 0 and second_hours < hours
    -- the second session starts after the first one ends
    and second_start_time >= start_time + ((hours - second_hours)::float8 * interval '1 hour')
  )
);

comment on column public.shoot_days.second_start_time is 'Start of the second session when the day is split (null = one session).';
comment on column public.shoot_days.second_hours is 'Length of the second session. The first lasts hours - second_hours.';

-- tell the crew when the sessions change too
create or replace function public.notify_shoot_day_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare what text;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    what := 'This shoot day was cancelled.';
  elsif new.status = 'planned' and (
       new.date is distinct from old.date
    or new.start_time is distinct from old.start_time
    or new.second_start_time is distinct from old.second_start_time
    or new.second_hours is distinct from old.second_hours
    or new.meeting_time is distinct from old.meeting_time
    or new.meeting_point is distinct from old.meeting_point
    or new.location_name is distinct from old.location_name
    or new.location_address is distinct from old.location_address
    or new.location_url is distinct from old.location_url) then
    what := 'Date, time, meeting point or location changed. Please check the details.';
  else
    return null;
  end if;

  perform public.notify(a.person_id, 'Shoot day updated',
            to_char(new.date, 'Dy DD Mon') || coalesce(' · ' || new.title, '') || '. ' || what,
            'shoot_day', '/shoots/' || new.id::text)
     from public.shoot_attendees a
    where a.shoot_day_id = new.id and a.response <> 'declined';
  return null;
end $$;
