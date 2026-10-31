-- =====================================================================
-- Shoot Scheduler — database schema + row-level security
-- All dates/times are Cairo wall-clock (Africa/Cairo). Dates are stored
-- as plain DATE and times as plain TIME, so there is no conversion.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PEOPLE
--    role:   manager | model | member
--    access: view | edit  (only meaningful for role = member)
--    user_id links the row to a Supabase Auth login (matched by email).
-- ---------------------------------------------------------------------
create table public.people (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references auth.users (id) on delete set null,
  name       text not null check (length(trim(name)) > 0),
  email      text not null unique check (email = lower(trim(email)) and email like '%@%'),
  role       text not null check (role in ('manager', 'model', 'member')),
  access     text not null default 'view' check (access in ('view', 'edit')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. TARGETS (single row) — season window, goals and the day rate
-- ---------------------------------------------------------------------
create table public.targets (
  id              int primary key default 1 check (id = 1),
  season_start    date not null default '2026-11-10',
  season_end      date not null default '2026-12-10',
  target_hours    numeric(6,2) not null default 54 check (target_hours >= 0),
  target_videos   int not null default 40 check (target_videos >= 0),
  target_days_min int not null default 8 check (target_days_min >= 0),
  target_days_max int not null default 10 check (target_days_max >= target_days_min),
  day_rate        numeric(10,2) not null default 0 check (day_rate >= 0),
  currency        text not null default 'EGP',
  updated_at      timestamptz not null default now(),
  check (season_end >= season_start)
);
insert into public.targets default values;

-- ---------------------------------------------------------------------
-- 3. AVAILABILITY — windows a person is free (several per day allowed)
-- ---------------------------------------------------------------------
create table public.availability (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references public.people (id) on delete cascade,
  date       date not null,
  start_time time not null,
  end_time   time not null,
  hours      numeric(4,2) generated always as
               (round((extract(epoch from (end_time - start_time)) / 3600.0)::numeric, 2)) stored,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index availability_person_date on public.availability (person_id, date);
create index availability_date on public.availability (date);

-- ---------------------------------------------------------------------
-- 4. SHOOT DAYS
--    free      = nobody assigned
--    offered   = assigned, waiting for the model to confirm
--    confirmed = model accepted
--    completed = shot; creates a pay row
-- ---------------------------------------------------------------------
create table public.shoot_days (
  id             uuid primary key default gen_random_uuid(),
  date           date not null,
  start_time     time,
  hours          numeric(4,2) not null default 6 check (hours > 0 and hours <= 6),
  person_id      uuid references public.people (id) on delete set null,
  videos_planned int not null default 0 check (videos_planned >= 0),
  status         text not null default 'free'
                   check (status in ('free', 'offered', 'confirmed', 'completed')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((status = 'free') = (person_id is null))
);
create index shoot_days_person on public.shoot_days (person_id);
create index shoot_days_date on public.shoot_days (date);
create unique index shoot_days_one_per_person_per_date
  on public.shoot_days (person_id, date) where person_id is not null;

-- ---------------------------------------------------------------------
-- 5. PAY — one row per completed shoot day
-- ---------------------------------------------------------------------
create table public.pay (
  id           uuid primary key default gen_random_uuid(),
  shoot_day_id uuid not null unique references public.shoot_days (id) on delete cascade,
  person_id    uuid not null references public.people (id) on delete cascade,
  amount       numeric(10,2) not null default 0 check (amount >= 0),
  status       text not null default 'not_paid' check (status in ('paid', 'not_paid')),
  paid_at      timestamptz,
  updated_at   timestamptz not null default now()
);
create index pay_person on public.pay (person_id);

-- =====================================================================
-- HELPER FUNCTIONS (security definer: they read people without RLS,
-- but only ever answer questions about the *current* logged-in user)
-- =====================================================================
create function public.my_person_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.people where user_id = auth.uid()
$$;

create function public.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.people where user_id = auth.uid() and role = 'manager')
$$;

-- manager or any invited member can see every schedule
create function public.can_view_all() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.people
                 where user_id = auth.uid() and role in ('manager', 'member'))
$$;

-- manager, or member with edit access, can change schedules
create function public.can_edit_all() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.people
                 where user_id = auth.uid()
                   and (role = 'manager' or (role = 'member' and access = 'edit')))
$$;

-- =====================================================================
-- LINK LOGINS TO PEOPLE ROWS BY EMAIL
-- =====================================================================
create function public.link_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.people set user_id = new.id
   where email = lower(new.email) and (user_id is null or user_id <> new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.link_auth_user();

create function public.people_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.email := lower(trim(new.email));
  if new.role <> 'member' then new.access := 'view'; end if;
  if tg_op = 'INSERT' or new.email <> old.email then
    select id into new.user_id from auth.users where lower(email) = new.email;
  end if;
  return new;
end $$;

create trigger people_before_write
  before insert or update on public.people
  for each row execute function public.people_before_write();

-- never leave the app without a manager
create function public.people_keep_a_manager() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.people where role = 'manager') then
    raise exception 'There must always be at least one manager.';
  end if;
  return null;
end $$;

create constraint trigger people_keep_a_manager
  after update or delete on public.people
  deferrable initially deferred
  for each row execute function public.people_keep_a_manager();

-- =====================================================================
-- AVAILABILITY RULES: inside season, no overlaps, max 6 h per day
-- =====================================================================
create function public.availability_validate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t public.targets;
  day_total numeric;
begin
  select * into t from public.targets where id = 1;
  if new.date < t.season_start or new.date > t.season_end then
    raise exception 'Date must be between % and %.', t.season_start, t.season_end;
  end if;

  -- serialise writes for the same person+day so two tabs can't beat the cap
  perform pg_advisory_xact_lock(hashtext(new.person_id::text || new.date::text));

  if exists (select 1 from public.availability a
              where a.person_id = new.person_id and a.date = new.date
                and a.id <> new.id
                and a.start_time < new.end_time and new.start_time < a.end_time) then
    raise exception 'This window overlaps another window on the same day.';
  end if;

  select coalesce(sum(a.hours), 0) into day_total
    from public.availability a
   where a.person_id = new.person_id and a.date = new.date and a.id <> new.id;

  if day_total + extract(epoch from (new.end_time - new.start_time)) / 3600.0 > 6 then
    raise exception 'Maximum is 6 hours per day (already % h on this day).', trim_scale(day_total);
  end if;
  return new;
end $$;

create trigger availability_validate
  before insert or update on public.availability
  for each row execute function public.availability_validate();

-- =====================================================================
-- SHOOT DAY RULES + automatic pay rows
-- =====================================================================
create function public.shoot_days_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.targets;
begin
  select * into t from public.targets where id = 1;
  if new.date < t.season_start or new.date > t.season_end then
    raise exception 'Date must be between % and %.', t.season_start, t.season_end;
  end if;
  -- keep status and assignment consistent
  if new.person_id is null then
    new.status := 'free';
  elsif new.status = 'free' then
    new.status := 'offered';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger shoot_days_before_write
  before insert or update on public.shoot_days
  for each row execute function public.shoot_days_before_write();

create function public.shoot_days_sync_pay() returns trigger
language plpgsql security definer set search_path = '' as $$
declare existing public.pay;
begin
  select * into existing from public.pay where shoot_day_id = new.id;

  if new.status = 'completed' then
    if existing.id is null then
      insert into public.pay (shoot_day_id, person_id, amount)
      values (new.id, new.person_id, (select day_rate from public.targets where id = 1));
    elsif existing.person_id <> new.person_id then
      if existing.status = 'paid' then
        raise exception 'This day is already paid. Mark it not paid before changing the model.';
      end if;
      update public.pay set person_id = new.person_id, updated_at = now() where id = existing.id;
    end if;
  elsif existing.id is not null then
    if existing.status = 'paid' then
      raise exception 'This day is already paid. Mark it not paid before changing its status.';
    end if;
    delete from public.pay where id = existing.id;
  end if;
  return null;
end $$;

create trigger shoot_days_sync_pay
  after insert or update on public.shoot_days
  for each row execute function public.shoot_days_sync_pay();

create function public.pay_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status <> 'paid') then
    new.paid_at := now();
  elsif new.status = 'not_paid' then
    new.paid_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger pay_before_write
  before insert or update on public.pay
  for each row execute function public.pay_before_write();

-- A model may accept or decline a day offered to her (and nothing else).
create function public.respond_to_shoot_day(day_id uuid, accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_person_id();
begin
  if me is null then raise exception 'Not signed in.'; end if;
  if accept then
    update public.shoot_days set status = 'confirmed'
     where id = day_id and person_id = me and status = 'offered';
  else
    update public.shoot_days set person_id = null, status = 'free'
     where id = day_id and person_id = me and status = 'offered';
  end if;
  if not found then raise exception 'That shoot day is not waiting for your answer.'; end if;
end $$;

-- =====================================================================
-- ROW-LEVEL SECURITY
-- =====================================================================
alter table public.people       enable row level security;
alter table public.targets      enable row level security;
alter table public.availability enable row level security;
alter table public.shoot_days   enable row level security;
alter table public.pay          enable row level security;

-- Nothing for anonymous visitors.
revoke all on public.people, public.targets, public.availability,
              public.shoot_days, public.pay from anon;
revoke execute on function public.respond_to_shoot_day(uuid, boolean) from anon, public;
grant  execute on function public.respond_to_shoot_day(uuid, boolean) to authenticated;

-- PEOPLE: models see only themselves; manager + members see everyone.
create policy people_select on public.people for select to authenticated
  using (user_id = (select auth.uid()) or (select public.can_view_all()));
create policy people_insert on public.people for insert to authenticated
  with check ((select public.is_manager()));
create policy people_update on public.people for update to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));
create policy people_delete on public.people for delete to authenticated
  using ((select public.is_manager()));

-- TARGETS: any signed-in team member can read; only the manager edits.
create policy targets_select on public.targets for select to authenticated
  using ((select public.my_person_id()) is not null);
create policy targets_update on public.targets for update to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));

-- AVAILABILITY: own rows, or everything for manager/members.
create policy availability_select on public.availability for select to authenticated
  using (person_id = (select public.my_person_id()) or (select public.can_view_all()));
create policy availability_insert on public.availability for insert to authenticated
  with check (person_id = (select public.my_person_id()) or (select public.can_edit_all()));
create policy availability_update on public.availability for update to authenticated
  using (person_id = (select public.my_person_id()) or (select public.can_edit_all()))
  with check (person_id = (select public.my_person_id()) or (select public.can_edit_all()));
create policy availability_delete on public.availability for delete to authenticated
  using (person_id = (select public.my_person_id()) or (select public.can_edit_all()));

-- SHOOT DAYS: a model sees only days assigned to her; editing is for
-- manager / edit-members (models answer offers via respond_to_shoot_day).
create policy shoot_days_select on public.shoot_days for select to authenticated
  using (person_id = (select public.my_person_id()) or (select public.can_view_all()));
create policy shoot_days_insert on public.shoot_days for insert to authenticated
  with check ((select public.can_edit_all()));
create policy shoot_days_update on public.shoot_days for update to authenticated
  using ((select public.can_edit_all())) with check ((select public.can_edit_all()));
create policy shoot_days_delete on public.shoot_days for delete to authenticated
  using ((select public.can_edit_all()));

-- PAY: a model sees only her own pay; only the manager sees/edits all pay.
-- (Invited members do NOT see pay.)
create policy pay_select on public.pay for select to authenticated
  using (person_id = (select public.my_person_id()) or (select public.is_manager()));
create policy pay_update on public.pay for update to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));
create policy pay_delete on public.pay for delete to authenticated
  using ((select public.is_manager()));
-- (pay rows are inserted only by the shoot_days trigger)
