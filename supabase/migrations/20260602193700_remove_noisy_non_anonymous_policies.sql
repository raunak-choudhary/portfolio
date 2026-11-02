-- Remove separate non-anonymous restrictive policies.
--
-- The same anonymous-auth protection now lives inside app_private.is_admin().
-- Keeping one admin predicate avoids extra RLS performance warnings while still
-- blocking anonymous Auth sessions from admin access.

begin;

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
  end loop;
end $$;

drop policy if exists "authenticated_non_anonymous_portfolio_storage" on storage.objects;

commit;
