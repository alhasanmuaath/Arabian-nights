-- Least privilege for functions (Supabase security advisor 0028 / 0029).
-- Postgres lets everyone EXECUTE new functions by default, which also
-- exposes them at /rest/v1/rpc/<name>. Take that away, then grant back
-- only what signed-in users really need.

-- Trigger functions: only ever run by the database itself.
-- (Postgres checks EXECUTE when a trigger is created, not when it fires.)
revoke execute on function
  public.link_auth_user(),
  public.people_before_write(),
  public.people_keep_a_manager(),
  public.availability_validate(),
  public.shoot_days_before_write(),
  public.shoot_days_sync_pay(),
  public.pay_before_write()
from public, anon, authenticated;

-- Permission helpers used inside the row-level-security policies. Policies
-- run as the signed-in user, so `authenticated` must keep EXECUTE. They only
-- ever describe the caller. Logged-out visitors have no table access at all.
revoke execute on function
  public.my_person_id(), public.is_manager(), public.can_view_all(), public.can_edit_all()
from public, anon;
grant execute on function
  public.my_person_id(), public.is_manager(), public.can_view_all(), public.can_edit_all()
to authenticated;

-- respond_to_shoot_day: already signed-in users only (set in the schema migration).
