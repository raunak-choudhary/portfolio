-- Unit 4.1: separate admin identity from admin authority.
--
-- app_private.is_admin() is the write gate and will soon require the second
-- factor (assurance level 2). The dashboard must still recognise the admin
-- before that level is reached: the session check after the email code and
-- the authenticator enrolment screen both run at level 1. is_admin_identity()
-- answers only "is this the admin's account?", with no factor check, and is
-- used for exactly one thing: letting the admin read their own admin_users
-- row. Every write keeps going through is_admin().

begin;

create or replace function app_private.is_admin_identity()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true) is false
    and exists (
      select 1
      from public.admin_users au
      where au.is_active = true
        and au.email is not null
        and lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

revoke all on function app_private.is_admin_identity() from public;
grant execute on function app_private.is_admin_identity() to authenticated, service_role;

drop policy if exists authenticated_admin_identity_reads_own_row on public.admin_users;
create policy authenticated_admin_identity_reads_own_row
  on public.admin_users
  for select
  to authenticated
  using (app_private.is_admin_identity());

commit;
