-- =====================================================================
-- MEETING SPOT: MAP LINK + INSTRUCTIONS (18 Nov 2026)
--   meeting_url           Google Maps link for the meeting spot
--   meeting_instructions  how to find it, who to call, what to bring
-- Both optional. Existing shoot days are unchanged.
-- =====================================================================

alter table public.shoot_days
  add column if not exists meeting_url          text,
  add column if not exists meeting_instructions text;

alter table public.shoot_days drop constraint if exists shoot_days_meeting_url_check;
alter table public.shoot_days add constraint shoot_days_meeting_url_check
  check (meeting_url is null or meeting_url ~* '^https?://');

create or replace function public.shoot_days_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.targets;
begin
  select * into t from public.targets where id = 1;
  if new.date < t.season_start or new.date > t.season_end then
    raise exception 'Date must be between % and %.', t.season_start, t.season_end;
  end if;
  if tg_op = 'INSERT' and new.created_by is null then
    new.created_by := public.my_person_id();
  end if;
  new.title                := nullif(trim(new.title), '');
  new.location_name        := nullif(trim(new.location_name), '');
  new.location_address     := nullif(trim(new.location_address), '');
  new.location_url         := nullif(trim(new.location_url), '');
  new.meeting_point        := nullif(trim(new.meeting_point), '');
  new.meeting_url          := nullif(trim(new.meeting_url), '');
  new.meeting_instructions := nullif(trim(new.meeting_instructions), '');
  new.updated_at := now();
  return new;
end $$;

-- tell the crew when the meeting details change too
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
    or new.meeting_url is distinct from old.meeting_url
    or new.meeting_instructions is distinct from old.meeting_instructions
    or new.location_name is distinct from old.location_name
    or new.location_address is distinct from old.location_address
    or new.location_url is distinct from old.location_url) then
    what := 'Date, time, meeting point, instructions or location changed. Please check the details.';
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
