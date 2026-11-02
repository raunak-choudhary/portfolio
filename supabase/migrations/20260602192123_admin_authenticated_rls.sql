-- Add a secure deployed-admin access layer.
--
-- This migration keeps anonymous access restricted, but lets a Supabase Auth
-- user whose email matches an active public.admin_users row manage portfolio
-- content from the deployed Hostinger build without any browser-side secrets.

begin;

create schema if not exists app_private;

revoke all on schema app_private from public;

create or replace function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.is_active = true
      and au.email is not null
      and lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function app_private.is_admin() from public;
grant usage on schema app_private to authenticated, service_role;
grant execute on function app_private.is_admin() to authenticated, service_role;

grant select, insert, update, delete on table
  public.about_content,
  public.achievements,
  public.admin_activity_analytics,
  public.admin_sessions,
  public.admin_users,
  public.analytics_events,
  public.certifications,
  public.contact_analytics,
  public.contact_messages,
  public.content_performance,
  public.education,
  public.hero_content,
  public.internships,
  public.leadership,
  public.portfolio_metrics,
  public.projects,
  public.recommendations,
  public.skills,
  public.work_experience
to authenticated;

grant usage, select on all sequences in schema public to authenticated;

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
      'authenticated_admin_manage_' || table_name,
      table_name
    );

    execute format(
      'create policy %I on public.%I for all to authenticated using (app_private.is_admin()) with check (app_private.is_admin())',
      'authenticated_admin_manage_' || table_name,
      table_name
    );
  end loop;
end $$;

drop policy if exists "authenticated_admin_manage_portfolio_storage" on storage.objects;

create policy "authenticated_admin_manage_portfolio_storage"
on storage.objects
for all
to authenticated
using (
  app_private.is_admin()
  and bucket_id in (
    'achievement-images',
    'certification-badges',
    'contact-attachments',
    'documents',
    'organization-logos',
    'profile-images',
    'project-images',
    'skill-icons'
  )
)
with check (
  app_private.is_admin()
  and bucket_id in (
    'achievement-images',
    'certification-badges',
    'contact-attachments',
    'documents',
    'organization-logos',
    'profile-images',
    'project-images',
    'skill-icons'
  )
);

commit;
