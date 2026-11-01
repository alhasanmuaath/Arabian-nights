
-- ============================================================
-- AVAILABILITY APPROVAL WORKFLOW
-- ============================================================

-- 1. Existing availability is preserved as approved.
-- New model requests default to pending.
alter table public.availability
  add column status text not null default 'approved';

alter table public.availability
  add constraint availability_status_check
  check (status in ('pending', 'approved', 'rejected'));

alter table public.availability
  alter column status set default 'pending';


-- 2. Secure availability writes and validate active windows.
-- Models always submit pending requests.
-- Managers and edit-members create approved availability.
create or replace function public.availability_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

    -- Serialize writes for the same person and date.
    perform pg_advisory_xact_lock(
      hashtext(new.person_id::text || new.date::text)
    );

    if exists (
      select 1
      from public.availability a
      where a.person_id = new.person_id
        and a.date = new.date
        and a.id <> new.id
        and a.status <> 'rejected'
        and a.start_time < new.end_time
        and new.start_time < a.end_time
    ) then
      raise exception 'This window overlaps another active window on the same day.';
    end if;

    select coalesce(sum(a.hours), 0)
      into day_total
      from public.availability a
     where a.person_id = new.person_id
       and a.date = new.date
       and a.id <> new.id
       and a.status <> 'rejected';

    if day_total + extract(epoch from (new.end_time - new.start_time)) / 3600.0 > 6 then
      raise exception 'Maximum is 6 hours per day (already % h on this day).',
        trim_scale(day_total);
    end if;
  end if;

  return new;
end;
$$;


-- 3. Only managers and authorized editors can update availability.
-- Models can still view and remove their own availability.
drop policy if exists availability_update on public.availability;

create policy availability_update on public.availability
  for update to authenticated
  using ((select public.can_edit_all()))
  with check ((select public.can_edit_all()));


-- 4. Secure function for approving or rejecting a pending request.
create or replace function public.set_availability_status(
  request_id uuid,
  requested_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_rows integer;
begin
  if not public.can_edit_all() then
    raise exception 'You do not have permission to review availability requests.';
  end if;

  if requested_status not in ('approved', 'rejected') then
    raise exception 'Status must be approved or rejected.';
  end if;

  update public.availability
     set status = requested_status
   where id = request_id
     and status = 'pending';

  get diagnostics changed_rows = row_count;

  if changed_rows = 0 then
    raise exception 'Request not found or it has already been reviewed.';
  end if;
end;
$$;


-- 5. Restrict function execution to signed-in users.
revoke all on function public.set_availability_status(uuid, text)
  from public, anon;

grant execute on function public.set_availability_status(uuid, text)
  to authenticated;
