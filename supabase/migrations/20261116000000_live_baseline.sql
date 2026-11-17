-- =====================================================================
-- LIVE BASELINE (catch-up)
--
-- Between 1 and 8 Nov 2026 the live database was changed by hand in the
-- Supabase SQL editor (announcements, shared files, notifications,
-- photographer role and pay). Those changes were never saved as
-- migration files. This file reproduces them so a fresh local database
-- matches live.
--
-- It is written to be safe to run on live too (nothing is dropped that
-- holds data, everything is "if not exists" / "create or replace").
-- =====================================================================

-- ---------- people: photographer role ----------
alter table public.people drop constraint if exists people_role_check;
alter table public.people add constraint people_role_check
  check (role in ('manager', 'model', 'member', 'photographer'));

-- ---------- shoot days: 4-hour sessions ----------
alter table public.shoot_days alter column hours set default 4;
alter table public.shoot_days drop constraint if exists shoot_days_hours_check;
alter table public.shoot_days add constraint shoot_days_hours_check
  check (hours > 0 and hours <= 4);

-- ---------- pay: one row per person per shoot day ----------
alter table public.pay drop constraint if exists pay_shoot_day_id_key;
alter table public.pay drop constraint if exists pay_shoot_day_person_unique;
alter table public.pay add constraint pay_shoot_day_person_unique unique (shoot_day_id, person_id);

-- ---------- notifications ----------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references public.people (id) on delete cascade,
  title      text not null,
  message    text not null,
  type       text not null default 'general',
  link       text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_person_created_idx
  on public.notifications (person_id, created_at desc);
alter table public.notifications enable row level security;

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications for select to authenticated
  using (person_id in (select id from public.people where user_id = (select auth.uid())));
drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications" on public.notifications for update to authenticated
  using (person_id in (select id from public.people where user_id = (select auth.uid())))
  with check (person_id in (select id from public.people where user_id = (select auth.uid())));

-- ---------- announcements ----------
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(trim(title)) > 0),
  body       text not null check (length(trim(body)) > 0),
  created_by uuid not null references public.people (id),
  created_at timestamptz not null default now()
);
create table if not exists public.announcement_recipients (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  person_id       uuid not null references public.people (id) on delete cascade,
  primary key (announcement_id, person_id)
);
create index if not exists announcement_recipients_person_idx
  on public.announcement_recipients (person_id);
alter table public.announcements enable row level security;
alter table public.announcement_recipients enable row level security;

drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements for select to authenticated
  using ((select public.can_view_all()) or exists (
    select 1 from public.announcement_recipients ar
     where ar.announcement_id = announcements.id and ar.person_id = (select public.my_person_id())));
drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert on public.announcements for insert to authenticated
  with check ((select public.can_edit_all()) and created_by = (select public.my_person_id()));
drop policy if exists announcements_update on public.announcements;
create policy announcements_update on public.announcements for update to authenticated
  using ((select public.can_edit_all())) with check ((select public.can_edit_all()));
drop policy if exists announcements_delete on public.announcements;
create policy announcements_delete on public.announcements for delete to authenticated
  using ((select public.can_edit_all()));

drop policy if exists announcement_recipients_manage on public.announcement_recipients;
create policy announcement_recipients_manage on public.announcement_recipients for all to authenticated
  using ((select public.can_edit_all())) with check ((select public.can_edit_all()));
drop policy if exists announcement_recipients_select_own on public.announcement_recipients;
create policy announcement_recipients_select_own on public.announcement_recipients for select to authenticated
  using (person_id = (select public.my_person_id()));

-- ---------- shared files ----------
create table if not exists public.shared_files (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) > 0),
  description  text,
  storage_path text not null unique,
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes > 0),
  uploaded_by  uuid not null references public.people (id),
  created_at   timestamptz not null default now()
);
create table if not exists public.shared_file_recipients (
  file_id   uuid not null references public.shared_files (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  primary key (file_id, person_id)
);
create index if not exists shared_file_recipients_person_idx
  on public.shared_file_recipients (person_id);
alter table public.shared_files enable row level security;
alter table public.shared_file_recipients enable row level security;

drop policy if exists shared_files_select on public.shared_files;
create policy shared_files_select on public.shared_files for select to authenticated
  using ((select public.can_view_all()) or exists (
    select 1 from public.shared_file_recipients sfr
     where sfr.file_id = shared_files.id and sfr.person_id = (select public.my_person_id())));
drop policy if exists shared_files_insert on public.shared_files;
create policy shared_files_insert on public.shared_files for insert to authenticated
  with check ((select public.can_edit_all()) and uploaded_by = (select public.my_person_id()));
drop policy if exists shared_files_update on public.shared_files;
create policy shared_files_update on public.shared_files for update to authenticated
  using ((select public.can_edit_all())) with check ((select public.can_edit_all()));
drop policy if exists shared_files_delete on public.shared_files;
create policy shared_files_delete on public.shared_files for delete to authenticated
  using ((select public.can_edit_all()));

drop policy if exists shared_file_recipients_manage on public.shared_file_recipients;
create policy shared_file_recipients_manage on public.shared_file_recipients for all to authenticated
  using ((select public.can_edit_all())) with check ((select public.can_edit_all()));
drop policy if exists shared_file_recipients_select_own on public.shared_file_recipients;
create policy shared_file_recipients_select_own on public.shared_file_recipients for select to authenticated
  using (person_id = (select public.my_person_id()));

insert into storage.buckets (id, name, public)
values ('shared-files', 'shared-files', false)
on conflict (id) do nothing;

drop policy if exists shared_files_storage_select on storage.objects;
create policy shared_files_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'shared-files' and (public.can_view_all() or exists (
    select 1 from public.shared_files sf
      join public.shared_file_recipients sfr on sfr.file_id = sf.id
     where sf.storage_path = objects.name and sfr.person_id = public.my_person_id())));
drop policy if exists shared_files_storage_insert on storage.objects;
create policy shared_files_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shared-files' and public.can_edit_all() and exists (
    select 1 from public.shared_files sf where sf.id::text = split_part(objects.name, '/', 1)));
drop policy if exists shared_files_storage_delete on storage.objects;
create policy shared_files_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shared-files' and (select public.can_edit_all()));

-- ---------- photographers on shoot days ----------
create table if not exists public.shoot_photographers (
  id              uuid primary key default gen_random_uuid(),
  shoot_day_id    uuid not null references public.shoot_days (id) on delete cascade,
  photographer_id uuid not null references public.people (id) on delete cascade,
  created_at      timestamptz not null default now(),
  agreed_amount   numeric not null default 0,
  constraint shoot_photographers_amount_check check (agreed_amount >= 0),
  unique (shoot_day_id, photographer_id)
);
alter table public.shoot_photographers enable row level security;

drop policy if exists shoot_photographers_select on public.shoot_photographers;
create policy shoot_photographers_select on public.shoot_photographers for select
  using (public.can_view_all() or photographer_id = public.my_person_id());
drop policy if exists shoot_photographers_insert on public.shoot_photographers;
create policy shoot_photographers_insert on public.shoot_photographers for insert
  with check (public.can_edit_all() and exists (
    select 1 from public.people where people.id = shoot_photographers.photographer_id and people.role = 'photographer'));
drop policy if exists shoot_photographers_manager_update on public.shoot_photographers;
create policy shoot_photographers_manager_update on public.shoot_photographers for update
  using (public.is_manager()) with check (public.is_manager());
drop policy if exists shoot_photographers_delete on public.shoot_photographers;
create policy shoot_photographers_delete on public.shoot_photographers for delete
  using (public.can_edit_all());

drop policy if exists people_select_assigned_model_name on public.people;
create policy people_select_assigned_model_name on public.people for select
  using (role = 'model' and exists (
    select 1 from public.shoot_days sd
      join public.shoot_photographers sp on sp.shoot_day_id = sd.id
     where sd.person_id = people.id and sp.photographer_id = public.my_person_id()));
drop policy if exists shoot_days_select_photographer on public.shoot_days;
create policy shoot_days_select_photographer on public.shoot_days for select
  using (exists (
    select 1 from public.shoot_photographers sp
     where sp.shoot_day_id = shoot_days.id and sp.photographer_id = public.my_person_id()));

-- ---------- functions as they are on live ----------
create or replace function public.availability_validate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t public.targets;
  day_total numeric;
begin
  if tg_op = 'INSERT' then
    if public.can_edit_all() then
      new.status := 'approved';
    else
      new.status := 'pending';
    end if;
  elsif new.status is distinct from old.status then
    if not public.can_edit_all() then
      raise exception 'Only a manager or authorized editor can change availability status.';
    end if;
  end if;

  select * into t from public.targets where id = 1;

  if new.date < t.season_start or new.date > t.season_end then
    raise exception 'Date must be between % and %.', t.season_start, t.season_end;
  end if;

  -- Rejected requests do not consume time or block other windows.
  if new.status <> 'rejected' then
    perform pg_advisory_xact_lock(hashtext(new.person_id::text || new.date::text));

    if exists (
      select 1 from public.availability a
       where a.person_id = new.person_id and a.date = new.date and a.id <> new.id
         and a.status <> 'rejected'
         and a.start_time < new.end_time and new.start_time < a.end_time
    ) then
      raise exception 'This window overlaps another active window on the same day.';
    end if;

    select coalesce(sum(a.hours), 0) into day_total
      from public.availability a
     where a.person_id = new.person_id and a.date = new.date and a.id <> new.id
       and a.status <> 'rejected';

    if day_total + extract(epoch from (new.end_time - new.start_time)) / 3600.0 > 4 then
      raise exception 'Maximum is 4 hours per day (already % h on this day).', trim_scale(day_total);
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.set_availability_status(request_id uuid, requested_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  changed_rows integer;
begin
  if not public.can_edit_all() then
    raise exception 'You do not have permission to review availability requests.';
  end if;
  if requested_status not in ('approved', 'rejected') then
    raise exception 'Status must be approved or rejected.';
  end if;
  update public.availability set status = requested_status
   where id = request_id and status = 'pending';
  get diagnostics changed_rows = row_count;
  if changed_rows = 0 then
    raise exception 'Request not found or it has already been reviewed.';
  end if;
end;
$$;

create or replace function public.notify_announcement_recipient() returns trigger
language plpgsql security definer set search_path = '' as $$
declare announcement_title text;
begin
  select a.title into announcement_title from public.announcements a where a.id = new.announcement_id;
  insert into public.notifications (person_id, title, message, type, link)
  values (new.person_id, 'New announcement', announcement_title, 'announcement', '/announcements');
  return new;
end;
$$;

create or replace function public.notify_availability_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status and new.status in ('approved', 'rejected') then
    insert into public.notifications (person_id, title, message, type, link)
    values (
      new.person_id,
      case when new.status = 'approved' then 'Availability approved' else 'Availability rejected' end,
      'Your availability request for ' || new.date::text ||
      ' (' || new.start_time::text || '–' || new.end_time::text || ') was ' || new.status || '.',
      'availability',
      '/calendar?date=' || new.date::text
    );
  end if;
  return new;
end;
$$;

create or replace function public.notify_shared_file_recipient() returns trigger
language plpgsql security definer set search_path = '' as $$
declare file_name text;
begin
  select f.name into file_name from public.shared_files f where f.id = new.file_id;
  insert into public.notifications (person_id, title, message, type, link)
  values (new.person_id, 'New file shared with you', file_name, 'file', '/files');
  return new;
end;
$$;

create or replace function public.notify_shoot_day_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.person_id is not null
     and (
       tg_op = 'INSERT'
       or old.person_id is distinct from new.person_id
       or old.date is distinct from new.date
       or old.start_time is distinct from new.start_time
       or old.hours is distinct from new.hours
       or old.videos_planned is distinct from new.videos_planned
       or old.status is distinct from new.status
     ) then
    insert into public.notifications (person_id, title, message, type, link)
    values (
      new.person_id,
      case when new.status = 'offered' then 'New Shoot Day offer' else 'Shoot Day updated' end,
      'Your Shoot Day for ' || new.date::text || ' has been ' ||
      case when tg_op = 'INSERT' then 'created' else 'updated' end || '.',
      'shoot_day',
      '/calendar?date=' || new.date::text
    );
  end if;
  return new;
end;
$$;

create or replace function public.shoot_days_sync_pay() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  existing public.pay;
begin
  select p.* into existing
    from public.pay p join public.people pe on pe.id = p.person_id
   where p.shoot_day_id = new.id and pe.role = 'model'
   limit 1;

  if new.status = 'completed' then
    if new.person_id is null then
      raise exception 'A model must be assigned before completing a shoot.';
    end if;
    if not exists (select 1 from public.people where id = new.person_id and role = 'model') then
      raise exception 'The assigned person must have the model role.';
    end if;
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
end;
$$;

create or replace function public.sync_photographer_payment_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  day_status text;
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.people where id = new.photographer_id and role = 'photographer') then
      raise exception 'Only people with the photographer role can be assigned.';
    end if;
    select status into day_status from public.shoot_days where id = new.shoot_day_id;
    if day_status = 'completed' then
      insert into public.pay (shoot_day_id, person_id, amount)
      values (new.shoot_day_id, new.photographer_id, new.agreed_amount)
      on conflict (shoot_day_id, person_id) do nothing;
    end if;
    return new;

  elsif tg_op = 'UPDATE' then
    if new.shoot_day_id <> old.shoot_day_id or new.photographer_id <> old.photographer_id then
      raise exception 'Changing an assignment identity is not allowed. Remove it and create a new assignment.';
    end if;
    if exists (select 1 from public.pay
                where shoot_day_id = new.shoot_day_id and person_id = new.photographer_id and status = 'paid') then
      raise exception 'This photographer has already been paid. The agreed amount cannot be changed.';
    end if;
    update public.pay set amount = new.agreed_amount, updated_at = now()
     where shoot_day_id = new.shoot_day_id and person_id = new.photographer_id and status = 'not_paid';
    return new;

  elsif tg_op = 'DELETE' then
    if exists (select 1 from public.pay
                where shoot_day_id = old.shoot_day_id and person_id = old.photographer_id and status = 'paid') then
      raise exception 'This photographer has already been paid. The assignment cannot be removed.';
    end if;
    delete from public.pay
     where shoot_day_id = old.shoot_day_id and person_id = old.photographer_id and status = 'not_paid';
    return old;
  end if;
  return null;
end;
$$;

create or replace function public.sync_photographer_payments_for_day() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' then
    insert into public.pay (shoot_day_id, person_id, amount)
    select sp.shoot_day_id, sp.photographer_id, sp.agreed_amount
      from public.shoot_photographers sp
      join public.people pe on pe.id = sp.photographer_id
     where sp.shoot_day_id = new.id and pe.role = 'photographer'
    on conflict (shoot_day_id, person_id) do nothing;
  else
    if exists (
      select 1 from public.pay p join public.people pe on pe.id = p.person_id
       where p.shoot_day_id = new.id and pe.role = 'photographer' and p.status = 'paid'
    ) then
      raise exception 'A photographer payment is already paid. Review it before changing this shoot status.';
    end if;
    delete from public.pay p using public.people pe
     where p.person_id = pe.id and p.shoot_day_id = new.id
       and pe.role = 'photographer' and p.status = 'not_paid';
  end if;
  return null;
end;
$$;

-- ---------- triggers as they are on live ----------
drop trigger if exists announcement_recipient_notification on public.announcement_recipients;
create trigger announcement_recipient_notification
  after insert on public.announcement_recipients
  for each row execute function public.notify_announcement_recipient();

drop trigger if exists availability_review_notification on public.availability;
create trigger availability_review_notification
  after update of status on public.availability
  for each row execute function public.notify_availability_review();

drop trigger if exists shared_file_recipient_notification on public.shared_file_recipients;
create trigger shared_file_recipient_notification
  after insert on public.shared_file_recipients
  for each row execute function public.notify_shared_file_recipient();

drop trigger if exists shoot_day_change_notification on public.shoot_days;
create trigger shoot_day_change_notification
  after insert or update on public.shoot_days
  for each row execute function public.notify_shoot_day_change();

drop trigger if exists shoot_days_sync_photographer_pay on public.shoot_days;
create trigger shoot_days_sync_photographer_pay
  after insert or update on public.shoot_days
  for each row execute function public.sync_photographer_payments_for_day();

drop trigger if exists shoot_photographers_sync_pay on public.shoot_photographers;
create trigger shoot_photographers_sync_pay
  after insert or update or delete on public.shoot_photographers
  for each row execute function public.sync_photographer_payment_assignment();
