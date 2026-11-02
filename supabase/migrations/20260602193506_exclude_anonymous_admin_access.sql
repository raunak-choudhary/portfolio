-- Explicitly exclude Supabase Auth anonymous users from admin-capable policies.
--
-- Anonymous Auth users assume the authenticated Postgres role. The admin
-- policy already checks the signed-in email, but this restrictive policy makes
-- the boundary explicit and matches Supabase's anonymous sign-in guidance.

begin;

create or replace function app_private.is_admin()
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

revoke all on function app_private.is_admin() from public;
grant execute on function app_private.is_admin() to authenticated, service_role;

do $$
declare
  table_name text;
  table_names text[] := array[
    'about_content',
    'achievements',
    'admin_activity_analytics',
    'admin_sessions',
    'admin_users',
    'analytics_events',
    'certifications',
    'contact_analytics',
    'contact_messages',
    'content_performance',
    'education',
    'hero_content',
    'internships',
    'leadership',
    'portfolio_metrics',
    'projects',
    'recommendations',
    'skills',
    'work_experience'
  ];
begin
  foreach table_name in array table_names
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      'authenticated_non_anonymous_' || table_name,
      table_name
    );

    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (coalesce((auth.jwt() ->> ''is_anonymous'')::boolean, true) is false) with check (coalesce((auth.jwt() ->> ''is_anonymous'')::boolean, true) is false)',
      'authenticated_non_anonymous_' || table_name,
      table_name
    );
  end loop;
end $$;

drop policy if exists "authenticated_non_anonymous_portfolio_storage" on storage.objects;

create policy "authenticated_non_anonymous_portfolio_storage"
on storage.objects
as restrictive
for all
to authenticated
using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true) is false)
with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true) is false);

commit;
