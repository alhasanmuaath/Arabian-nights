-- =====================================================================
-- CREW, SHOOT DETAILS, COMMENTS  (16 Nov 2026)
--
-- New rules:
--   * Everyone on the team sees every shoot day and who will be there.
--   * A shoot day is ONE event with a crew list (models, photographer,
--     organizers). Before, there was one row per model per date.
--   * The manager picks the days; crew members accept, or decline with
--     a reason (reason is visible to the manager and the person only).
--   * Shoot day details: location, meeting point + time, place photos,
--     scripts.
--   * New role "organizer": can set the location and add place photos.
--   * Photographer + organizers can read every announcement and file.
--     Models read what is assigned to them. All can comment / review.
--   * Pay stays private: you see your own, the manager sees all.
--   * Availability is no longer used by the app (data is kept).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ROLES + PERMISSION HELPERS
-- ---------------------------------------------------------------------
alter table public.people drop constraint if exists people_role_check;
alter table public.people add constraint people_role_check
  check (role in ('manager', 'model', 'member', 'photographer', 'organizer'));

create or replace function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.people where user_id = auth.uid()
$$;

-- any invited person
create or replace function public.is_team() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.people where user_id = auth.uid())
$$;

-- reads every announcement and file (everyone except models)
create or replace function public.can_view_all() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.people
                 where user_id = auth.uid()
                   and role in ('manager', 'member', 'photographer', 'organizer'))
$$;

-- may set a shoot day's location and add place photos
create or replace function public.can_edit_location() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.people
                 where user_id = auth.uid()
                   and (role in ('manager', 'organizer') or (role = 'member' and access = 'edit')))
$$;

-- names + roles for the whole team (no emails)
create or replace function public.team_directory()
returns table (id uuid, name text, role text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.role from public.people p
   where exists (select 1 from public.people me where me.user_id = auth.uid())
   order by p.name
$$;

-- People rows (with emails) stay limited to the manager / legacy members.
drop policy if exists people_select on public.people;
create policy people_select on public.people for select to authenticated
  using (user_id = (select auth.uid()) or (select public.my_role()) in ('manager', 'member'));
drop policy if exists people_select_assigned_model_name on public.people;

-- ---------------------------------------------------------------------
-- 2. SHOOT DAYS BECOME EVENTS WITH DETAILS
-- ---------------------------------------------------------------------
-- stop the old per-model automation before touching the data
drop trigger if exists shoot_days_before_write on public.shoot_days;
drop trigger if exists shoot_days_sync_pay on public.shoot_days;
drop trigger if exists shoot_days_sync_photographer_pay on public.shoot_days;
drop trigger if exists shoot_day_change_notification on public.shoot_days;
drop trigger if exists shoot_photographers_sync_pay on public.shoot_photographers;

alter table public.shoot_days
  add column if not exists title            text,
  add column if not exists location_name    text,
  add column if not exists location_address text,
  add column if not exists location_url     text,
  add column if not exists meeting_point    text,
  add column if not exists meeting_time     time,
  add column if not exists created_by       uuid references public.people (id) on delete set null;

alter table public.shoot_days drop constraint if exists shoot_days_location_url_check;
alter table public.shoot_days add constraint shoot_days_location_url_check
  check (location_url is null or location_url ~* '^https?://');

comment on column public.shoot_days.person_id is
  'DEPRECATED (kept for history). The crew is in shoot_attendees.';

-- ---------------------------------------------------------------------
-- 3. CREW LIST
-- ---------------------------------------------------------------------
create table public.shoot_attendees (
  id           uuid primary key default gen_random_uuid(),
  shoot_day_id uuid not null references public.shoot_days (id) on delete cascade,
  person_id    uuid not null references public.people (id) on delete cascade,
  response     text not null default 'pending'
                 check (response in ('pending', 'accepted', 'declined')),
  responded_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (shoot_day_id, person_id)
);
create index shoot_attendees_person on public.shoot_attendees (person_id);

-- why someone declined: private to the manager and that person
create table public.shoot_decline_reasons (
  attendee_id uuid primary key references public.shoot_attendees (id) on delete cascade,
  reason      text not null check (length(trim(reason)) > 0),
  created_at  timestamptz not null default now()
);

-- agreed fee for one person on one shoot day (photographers, or anyone
-- paid a special amount). Models without a fee get the day rate.
create table public.shoot_fees (
  shoot_day_id uuid not null references public.shoot_days (id) on delete cascade,
  person_id    uuid not null references public.people (id) on delete cascade,
  amount       numeric(10,2) not null check (amount >= 0),
  updated_at   timestamptz not null default now(),
  primary key (shoot_day_id, person_id)
);

-- ---------------------------------------------------------------------
-- 4. PLACE PHOTOS + SCRIPTS
-- ---------------------------------------------------------------------
create table public.shoot_assets (
  id           uuid primary key default gen_random_uuid(),
  shoot_day_id uuid not null references public.shoot_days (id) on delete cascade,
  kind         text not null check (kind in ('photo', 'script')),
  title        text not null check (length(trim(title)) > 0),
  body         text,                     -- a script typed straight into the app
  storage_path text unique,              -- or an uploaded file
  mime_type    text,
  size_bytes   bigint check (size_bytes is null or size_bytes > 0),
  uploaded_by  uuid not null references public.people (id),
  created_at   timestamptz not null default now(),
  check (kind <> 'photo' or storage_path is not null),
  check (storage_path is not null or length(trim(coalesce(body, ''))) > 0),
  check (storage_path is null or storage_path like shoot_day_id::text || '/%')
);
create index shoot_assets_day on public.shoot_assets (shoot_day_id, kind, created_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shoot-assets', 'shoot-assets', false, 20971520, array[
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf', 'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 5. COMMENTS + "REVIEWED" TICKS (announcements, shared files, assets)
-- ---------------------------------------------------------------------
create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('announcement', 'file', 'asset')),
  target_id   uuid not null,
  person_id   uuid not null references public.people (id) on delete cascade,
  body        text not null check (length(trim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index comments_target on public.comments (target_type, target_id, created_at);

create table public.reviews (
  target_type text not null check (target_type in ('announcement', 'file', 'asset')),
  target_id   uuid not null,
  person_id   uuid not null references public.people (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (target_type, target_id, person_id)
);

-- can the current user see the thing a comment / review is attached to?
create or replace function public.can_see_target(t text, tid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case t
    when 'announcement' then exists (
      select 1 from public.announcements a
       where a.id = tid and (public.can_view_all() or exists (
         select 1 from public.announcement_recipients r
          where r.announcement_id = a.id and r.person_id = public.my_person_id())))
    when 'file' then exists (
      select 1 from public.shared_files f
       where f.id = tid and (public.can_view_all() or exists (
         select 1 from public.shared_file_recipients r
          where r.file_id = f.id and r.person_id = public.my_person_id())))
    when 'asset' then public.is_team()
      and exists (select 1 from public.shoot_assets s where s.id = tid)
    else false
  end
$$;

-- ---------------------------------------------------------------------
-- 6. MOVE EXISTING DATA INTO THE NEW SHAPE (one atomic block)
-- ---------------------------------------------------------------------
do $$
declare lost int;
begin
  -- 6a. every model already on a shoot day joins its crew list
  insert into public.shoot_attendees (shoot_day_id, person_id, response, responded_at)
  select id, person_id,
         case when status = 'offered' then 'pending' else 'accepted' end,
         case when status = 'offered' then null else updated_at end
    from public.shoot_days
   where person_id is not null
  on conflict (shoot_day_id, person_id) do nothing;

  -- 6b. so does every assigned photographer, with the agreed fee
  insert into public.shoot_attendees (shoot_day_id, person_id, response, responded_at)
  select shoot_day_id, photographer_id, 'accepted', created_at from public.shoot_photographers
  on conflict (shoot_day_id, person_id) do nothing;

  insert into public.shoot_fees (shoot_day_id, person_id, amount)
  select shoot_day_id, photographer_id, agreed_amount from public.shoot_photographers
  on conflict (shoot_day_id, person_id) do nothing;

  -- 6c. merge "one row per model" into one event per date.
  --     Completed and not-yet-completed rows are never merged together.
  create temp table _merge as
  select id,
         first_value(id) over (partition by date, (status = 'completed')
                               order by start_time nulls last, created_at, id) as keeper
    from public.shoot_days;

  update public.shoot_days k
     set start_time     = agg.start_time,
         hours          = agg.hours,
         videos_planned = agg.videos,
         notes          = agg.notes
    from (select m.keeper,
                 min(s.start_time)           as start_time,
                 max(s.hours)                as hours,
                 sum(s.videos_planned)::int  as videos,
                 nullif(string_agg(nullif(trim(s.notes), ''), E'\n' order by s.created_at), '') as notes
            from _merge m join public.shoot_days s on s.id = m.id
           group by m.keeper
          having count(*) > 1) agg
   where k.id = agg.keeper;

  insert into public.shoot_attendees (shoot_day_id, person_id, response, responded_at, created_at)
  select m.keeper, a.person_id, a.response, a.responded_at, a.created_at
    from public.shoot_attendees a join _merge m on m.id = a.shoot_day_id
   where m.id <> m.keeper
  on conflict (shoot_day_id, person_id) do nothing;

  insert into public.shoot_fees (shoot_day_id, person_id, amount)
  select m.keeper, f.person_id, f.amount
    from public.shoot_fees f join _merge m on m.id = f.shoot_day_id
   where m.id <> m.keeper
  on conflict (shoot_day_id, person_id) do nothing;

  update public.pay p set shoot_day_id = m.keeper
    from _merge m
   where p.shoot_day_id = m.id and m.id <> m.keeper
     and not exists (select 1 from public.pay p2
                      where p2.shoot_day_id = m.keeper and p2.person_id = p.person_id);

  update public.shoot_photographers sp set shoot_day_id = m.keeper
    from _merge m
   where sp.shoot_day_id = m.id and m.id <> m.keeper
     and not exists (select 1 from public.shoot_photographers sp2
                      where sp2.shoot_day_id = m.keeper and sp2.photographer_id = sp.photographer_id);

  -- safety: refuse to continue if any payment would be deleted by the merge
  select count(*) into lost
    from public.pay p join _merge m on m.id = p.shoot_day_id
   where m.id <> m.keeper;
  if lost > 0 then
    raise exception 'Merge would delete % pay row(s). Nothing was changed.', lost;
  end if;

  delete from public.shoot_days s using _merge m where s.id = m.id and m.id <> m.keeper;
  drop table _merge;
end $$;

-- 6d. day-level status. Per-person answers now live on the crew list.
alter table public.shoot_days drop constraint if exists shoot_days_check;
alter table public.shoot_days drop constraint if exists shoot_days_status_check;
drop index if exists public.shoot_days_one_per_person_per_date;

update public.shoot_days
   set status = case when status = 'completed' then 'completed' else 'planned' end;

alter table public.shoot_days alter column status set default 'planned';
alter table public.shoot_days add constraint shoot_days_status_check
  check (status in ('planned', 'completed', 'cancelled'));

-- ---------------------------------------------------------------------
-- 7. AUTOMATION
-- ---------------------------------------------------------------------
create or replace function public.notify(to_person uuid, n_title text, n_message text, n_type text, n_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (person_id, title, message, type, link)
  select to_person, n_title, n_message, n_type, n_link
   where to_person is not null
     and to_person is distinct from public.my_person_id()   -- never notify yourself
$$;

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
  new.title            := nullif(trim(new.title), '');
  new.location_name    := nullif(trim(new.location_name), '');
  new.location_address := nullif(trim(new.location_address), '');
  new.location_url     := nullif(trim(new.location_url), '');
  new.meeting_point    := nullif(trim(new.meeting_point), '');
  new.updated_at := now();
  return new;
end $$;

create trigger shoot_days_before_write
  before insert or update on public.shoot_days
  for each row execute function public.shoot_days_before_write();

-- Pay follows the crew list of a completed day:
--   * someone who did not decline gets a pay row: their agreed fee, or
--     the day rate if they are a model (others without a fee: no row)
--   * amounts already on a pay row are never overwritten here
--   * paid rows are never removed: the change is refused instead
create or replace function public.sync_day_pay(day uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.shoot_days;
  blocked text;
begin
  select * into d from public.shoot_days where id = day;
  if not found then return; end if;

  if d.status = 'completed' then
    select string_agg(pe.name, ', ') into blocked
      from public.pay p join public.people pe on pe.id = p.person_id
     where p.shoot_day_id = day and p.status = 'paid'
       and not exists (select 1 from public.shoot_attendees a
                        where a.shoot_day_id = day and a.person_id = p.person_id
                          and a.response <> 'declined');
    if blocked is not null then
      raise exception '% has already been paid for this day. Mark the payment not paid first.', blocked;
    end if;

    delete from public.pay p
     where p.shoot_day_id = day and p.status = 'not_paid'
       and not exists (select 1 from public.shoot_attendees a
                        where a.shoot_day_id = day and a.person_id = p.person_id
                          and a.response <> 'declined');

    insert into public.pay (shoot_day_id, person_id, amount)
    select day, a.person_id,
           coalesce(f.amount, (select day_rate from public.targets where id = 1))
      from public.shoot_attendees a
      join public.people pe on pe.id = a.person_id
      left join public.shoot_fees f on f.shoot_day_id = day and f.person_id = a.person_id
     where a.shoot_day_id = day and a.response <> 'declined'
       and (f.amount is not null or pe.role = 'model')
    on conflict (shoot_day_id, person_id) do nothing;
  else
    if exists (select 1 from public.pay where shoot_day_id = day and status = 'paid') then
      raise exception 'This day has payments already marked paid. Mark them not paid before changing its status.';
    end if;
    delete from public.pay where shoot_day_id = day;
  end if;
end $$;

create or replace function public.shoot_days_sync_pay() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform public.sync_day_pay(new.id);
  end if;
  return null;
end $$;

create trigger shoot_days_sync_pay
  after insert or update on public.shoot_days
  for each row execute function public.shoot_days_sync_pay();

create or replace function public.shoot_days_before_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.pay where shoot_day_id = old.id and status = 'paid') then
    raise exception 'This day has payments already marked paid. Mark them not paid before deleting it.';
  end if;
  return old;
end $$;

create trigger shoot_days_before_delete
  before delete on public.shoot_days
  for each row execute function public.shoot_days_before_delete();

create or replace function public.shoot_attendees_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d public.shoot_days;
begin
  if tg_op = 'DELETE' then
    perform public.sync_day_pay(old.shoot_day_id);
    return null;
  end if;

  perform public.sync_day_pay(new.shoot_day_id);

  if tg_op = 'INSERT' then
    select * into d from public.shoot_days where id = new.shoot_day_id;
    if d.status = 'planned' and new.response = 'pending' then
      perform public.notify(
        new.person_id,
        'You are on a shoot day',
        to_char(d.date, 'Dy DD Mon') || coalesce(' · ' || d.title, '') || '. Please accept or decline.',
        'shoot_day', '/shoots/' || d.id::text);
    end if;
  end if;
  return null;
end $$;

create trigger shoot_attendees_after_write
  after insert or update or delete on public.shoot_attendees
  for each row execute function public.shoot_attendees_after_write();

create or replace function public.shoot_fees_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_day_pay(old.shoot_day_id);
    return null;
  end if;
  if tg_op = 'UPDATE' and new.amount is distinct from old.amount then
    if exists (select 1 from public.pay
                where shoot_day_id = new.shoot_day_id and person_id = new.person_id and status = 'paid') then
      raise exception 'This person has already been paid for this day. The agreed fee cannot be changed.';
    end if;
    update public.pay set amount = new.amount
     where shoot_day_id = new.shoot_day_id and person_id = new.person_id and status = 'not_paid';
  end if;
  perform public.sync_day_pay(new.shoot_day_id);
  return null;
end $$;

create trigger shoot_fees_after_write
  after insert or update or delete on public.shoot_fees
  for each row execute function public.shoot_fees_after_write();

-- tell the crew when the plan changes
create or replace function public.notify_shoot_day_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare what text;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    what := 'This shoot day was cancelled.';
  elsif new.status = 'planned' and (
       new.date is distinct from old.date
    or new.start_time is distinct from old.start_time
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

create trigger shoot_day_change_notification
  after update on public.shoot_days
  for each row execute function public.notify_shoot_day_change();

create or replace function public.notify_new_script() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d public.shoot_days;
begin
  if new.kind = 'script' then
    select * into d from public.shoot_days where id = new.shoot_day_id;
    perform public.notify(a.person_id, 'New script',
              new.title || ' · ' || to_char(d.date, 'Dy DD Mon'),
              'shoot_day', '/shoots/' || d.id::text)
       from public.shoot_attendees a
      where a.shoot_day_id = d.id and a.response <> 'declined';
  end if;
  return null;
end $$;

create trigger shoot_assets_notify
  after insert on public.shoot_assets
  for each row execute function public.notify_new_script();

-- comments: tell the managers and whoever posted the item
create or replace function public.notify_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  author text;
  subject text;
  owner_id uuid;
  href text;
begin
  select name into author from public.people where id = new.person_id;
  if new.target_type = 'announcement' then
    select title, created_by into subject, owner_id from public.announcements where id = new.target_id;
    href := '/announcements#a-' || new.target_id::text;
  elsif new.target_type = 'file' then
    select name, uploaded_by into subject, owner_id from public.shared_files where id = new.target_id;
    href := '/files#f-' || new.target_id::text;
  else
    select title, uploaded_by, '/shoots/' || shoot_day_id::text into subject, owner_id, href
      from public.shoot_assets where id = new.target_id;
  end if;

  perform public.notify(p.id, 'New comment from ' || coalesce(author, 'someone'),
            coalesce(subject, '') || ': ' || left(new.body, 140), 'comment', href)
     from public.people p
    where p.role = 'manager' or p.id = owner_id;
  return null;
end $$;

create trigger comments_notify
  after insert on public.comments
  for each row execute function public.notify_comment();

-- comments / reviews have no foreign key to their target: clean up by trigger
create or replace function public.delete_target_feedback() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.comments where target_type = tg_argv[0] and target_id = old.id;
  delete from public.reviews  where target_type = tg_argv[0] and target_id = old.id;
  return null;
end $$;

create trigger announcements_feedback_cleanup after delete on public.announcements
  for each row execute function public.delete_target_feedback('announcement');
create trigger shared_files_feedback_cleanup after delete on public.shared_files
  for each row execute function public.delete_target_feedback('file');
create trigger shoot_assets_feedback_cleanup after delete on public.shoot_assets
  for each row execute function public.delete_target_feedback('asset');

-- ---------------------------------------------------------------------
-- 8. ACTIONS FOR NON-MANAGERS (checked inside the database)
-- ---------------------------------------------------------------------
-- a crew member accepts, or declines with a reason
create or replace function public.respond_to_shoot(day_id uuid, accept boolean, reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.my_person_id();
  my_name text;
  a public.shoot_attendees;
  d public.shoot_days;
  why text := trim(coalesce(reason, ''));
begin
  if me is null then raise exception 'Not signed in.'; end if;
  select * into d from public.shoot_days where id = day_id;
  if not found then raise exception 'Shoot day not found.'; end if;
  if d.status <> 'planned' then
    raise exception 'This shoot day is % and can no longer be answered.', d.status;
  end if;
  select * into a from public.shoot_attendees where shoot_day_id = day_id and person_id = me;
  if not found then raise exception 'You are not on the crew list for this shoot day.'; end if;
  select name into my_name from public.people where id = me;

  if accept then
    update public.shoot_attendees set response = 'accepted', responded_at = now() where id = a.id;
    delete from public.shoot_decline_reasons where attendee_id = a.id;
  else
    if length(why) < 3 then raise exception 'Please give a short reason for declining.'; end if;
    update public.shoot_attendees set response = 'declined', responded_at = now() where id = a.id;
    insert into public.shoot_decline_reasons (attendee_id, reason) values (a.id, left(why, 500))
    on conflict (attendee_id) do update set reason = excluded.reason, created_at = now();
  end if;

  perform public.notify(p.id,
            my_name || case when accept then ' accepted ' else ' declined ' end || to_char(d.date, 'Dy DD Mon'),
            case when accept then 'They will be there.' else 'Reason: ' || left(why, 500) end,
            'shoot_day', '/shoots/' || d.id::text)
     from public.people p where p.role = 'manager';
end $$;

-- organizers (and the manager) set where the shoot happens
create or replace function public.set_shoot_location(day_id uuid, loc_name text, loc_address text, loc_url text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_edit_location() then
    raise exception 'You do not have permission to change the location.';
  end if;
  update public.shoot_days
     set location_name = loc_name, location_address = loc_address, location_url = loc_url
   where id = day_id;
  if not found then raise exception 'Shoot day not found.'; end if;
end $$;

-- the old per-model functions are no longer used
drop function if exists public.respond_to_shoot_day(uuid, boolean);
drop function if exists public.sync_photographer_payments_for_day();
drop function if exists public.sync_photographer_payment_assignment();

-- ---------------------------------------------------------------------
-- 9. ROW-LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.shoot_attendees       enable row level security;
alter table public.shoot_decline_reasons enable row level security;
alter table public.shoot_fees            enable row level security;
alter table public.shoot_assets          enable row level security;
alter table public.comments              enable row level security;
alter table public.reviews               enable row level security;

-- SHOOT DAYS: the whole team reads; manager (and legacy edit-members) write
drop policy if exists shoot_days_select on public.shoot_days;
drop policy if exists shoot_days_select_photographer on public.shoot_days;
create policy shoot_days_select on public.shoot_days for select to authenticated
  using ((select public.is_team()));

-- CREW LIST: the whole team reads; manager writes (answers go through respond_to_shoot)
create policy shoot_attendees_select on public.shoot_attendees for select to authenticated
  using ((select public.is_team()));
create policy shoot_attendees_insert on public.shoot_attendees for insert to authenticated
  with check ((select public.can_edit_all()));
create policy shoot_attendees_update on public.shoot_attendees for update to authenticated
  using ((select public.can_edit_all())) with check ((select public.can_edit_all()));
create policy shoot_attendees_delete on public.shoot_attendees for delete to authenticated
  using ((select public.can_edit_all()));

-- DECLINE REASONS: manager + the person. Written only by respond_to_shoot.
create policy shoot_decline_reasons_select on public.shoot_decline_reasons for select to authenticated
  using ((select public.is_manager()) or exists (
    select 1 from public.shoot_attendees a
     where a.id = attendee_id and a.person_id = (select public.my_person_id())));

-- FEES: manager + the person
create policy shoot_fees_select on public.shoot_fees for select to authenticated
  using ((select public.is_manager()) or person_id = (select public.my_person_id()));
create policy shoot_fees_write on public.shoot_fees for all to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));

drop policy if exists shoot_photographers_select on public.shoot_photographers;
create policy shoot_photographers_select on public.shoot_photographers for select to authenticated
  using ((select public.is_manager()) or photographer_id = (select public.my_person_id()));

-- PLACE PHOTOS + SCRIPTS: the whole team reads. Manager adds anything;
-- organizers add photos and may remove the photos they added.
create policy shoot_assets_select on public.shoot_assets for select to authenticated
  using ((select public.is_team()));
create policy shoot_assets_insert on public.shoot_assets for insert to authenticated
  with check (uploaded_by = (select public.my_person_id())
              and ((select public.can_edit_all())
                   or (kind = 'photo' and (select public.can_edit_location()))));
create policy shoot_assets_update on public.shoot_assets for update to authenticated
  using ((select public.can_edit_all())) with check ((select public.can_edit_all()));
create policy shoot_assets_delete on public.shoot_assets for delete to authenticated
  using ((select public.can_edit_all())
         or (kind = 'photo' and uploaded_by = (select public.my_person_id())
             and (select public.can_edit_location())));

create policy shoot_assets_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'shoot-assets' and (select public.is_team()));
create policy shoot_assets_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shoot-assets'
              and exists (select 1 from public.shoot_days sd
                           where sd.id::text = split_part(objects.name, '/', 1))
              and ((select public.can_edit_all())
                   or ((select public.can_edit_location())
                       and lower(storage.extension(objects.name)) in ('jpg', 'jpeg', 'png', 'webp'))));
create policy shoot_assets_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shoot-assets'
         and ((select public.can_edit_all())
              or ((select public.can_edit_location()) and owner_id = (select auth.uid())::text)));

-- COMMENTS + REVIEWS: anyone who can see the item
create policy comments_select on public.comments for select to authenticated
  using (public.can_see_target(target_type, target_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (person_id = (select public.my_person_id())
              and public.can_see_target(target_type, target_id));
create policy comments_delete on public.comments for delete to authenticated
  using (person_id = (select public.my_person_id()) or (select public.is_manager()));

create policy reviews_select on public.reviews for select to authenticated
  using (public.can_see_target(target_type, target_id));
create policy reviews_insert on public.reviews for insert to authenticated
  with check (person_id = (select public.my_person_id())
              and public.can_see_target(target_type, target_id));
create policy reviews_delete on public.reviews for delete to authenticated
  using (person_id = (select public.my_person_id()));

-- NOTIFICATIONS: let people clear their own
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (person_id = (select public.my_person_id()));

-- ---------------------------------------------------------------------
-- 10. LEAST PRIVILEGE
-- ---------------------------------------------------------------------
-- nothing for logged-out visitors
revoke all on all tables in schema public from anon;

-- trigger / internal functions: only the database itself runs them
revoke execute on function
  public.notify(uuid, text, text, text, text),
  public.sync_day_pay(uuid),
  public.shoot_days_before_write(),
  public.shoot_days_sync_pay(),
  public.shoot_days_before_delete(),
  public.shoot_attendees_after_write(),
  public.shoot_fees_after_write(),
  public.notify_shoot_day_change(),
  public.notify_new_script(),
  public.notify_comment(),
  public.delete_target_feedback(),
  public.notify_announcement_recipient(),
  public.notify_availability_review(),
  public.notify_shared_file_recipient()
from public, anon, authenticated;

-- helpers used by the policies + the actions above: signed-in users only
revoke execute on function
  public.my_role(), public.is_team(), public.can_view_all(), public.can_edit_location(),
  public.team_directory(), public.can_see_target(text, uuid),
  public.respond_to_shoot(uuid, boolean, text),
  public.set_shoot_location(uuid, text, text, text)
from public, anon;
grant execute on function
  public.my_role(), public.is_team(), public.can_view_all(), public.can_edit_location(),
  public.team_directory(), public.can_see_target(text, uuid),
  public.respond_to_shoot(uuid, boolean, text),
  public.set_shoot_location(uuid, text, text, text)
to authenticated;
