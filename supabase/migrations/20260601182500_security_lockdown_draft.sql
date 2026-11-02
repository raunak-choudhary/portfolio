-- Security lockdown for dynamic-portfolio.
--
-- Intent:
-- 1. Fix Supabase Security Advisor "RLS disabled in public".
-- 2. Remove broad anon/authenticated table privileges.
-- 3. Keep public portfolio pages readable.
-- 4. Keep contact form submissions and visitor analytics inserts working.
-- 5. Stop browser clients from reading admin/contact/private analytics data.
-- 6. Stop browser clients from using service-role-like admin table access.
--
-- Expected breaking change:
-- - Existing browser-side admin dashboard/login writes will stop working until
--   admin operations are moved to Supabase Auth + RLS or Edge Functions.

begin;

-- ---------------------------------------------------------------------------
-- Public schema API grants
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Public portfolio read-only tables.
grant select on table
  public.about_content,
  public.achievements,
  public.certifications,
  public.education,
  public.hero_content,
  public.internships,
  public.leadership,
  public.projects,
  public.recommendations,
  public.skills,
  public.work_experience
to anon, authenticated;

-- Public write-only visitor/contact flows.
grant insert on table public.analytics_events to anon, authenticated;
grant insert on table public.contact_messages to anon, authenticated;
grant usage on sequence public.contact_messages_message_number_seq to anon, authenticated;

-- Visitor tracking currently calls this RPC from the public frontend.
grant execute on function public.increment_content_performance(text, text, date, integer)
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS on all exposed public tables
-- ---------------------------------------------------------------------------

alter table public.about_content enable row level security;
alter table public.achievements enable row level security;
alter table public.admin_activity_analytics enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.admin_users enable row level security;
alter table public.analytics_events enable row level security;
alter table public.certifications enable row level security;
alter table public.contact_analytics enable row level security;
alter table public.contact_messages enable row level security;
alter table public.content_performance enable row level security;
alter table public.education enable row level security;
alter table public.hero_content enable row level security;
alter table public.internships enable row level security;
alter table public.leadership enable row level security;
alter table public.portfolio_metrics enable row level security;
alter table public.projects enable row level security;
alter table public.recommendations enable row level security;
alter table public.skills enable row level security;
alter table public.work_experience enable row level security;

-- Remove existing overlapping/permissive policies from public and storage.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
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
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Public read policies for portfolio content
-- ---------------------------------------------------------------------------

create policy "public_read_active_about_content"
on public.about_content
for select
to anon, authenticated
using (is_active = true);

create policy "public_read_active_achievements"
on public.achievements
for select
to anon, authenticated
using (status = 'active');

create policy "public_read_active_certifications"
on public.certifications
for select
to anon, authenticated
using (status = 'active');

create policy "public_read_active_education"
on public.education
for select
to anon, authenticated
using (status = 'active');

create policy "public_read_active_hero_content"
on public.hero_content
for select
to anon, authenticated
using (is_active = true);

create policy "public_read_active_internships"
on public.internships
for select
to anon, authenticated
using (status = 'active');

create policy "public_read_active_leadership"
on public.leadership
for select
to anon, authenticated
using (status = 'active');

create policy "public_read_active_projects"
on public.projects
for select
to anon, authenticated
using (status = 'active');

create policy "public_read_active_public_recommendations"
on public.recommendations
for select
to anon, authenticated
using (status = 'active' and is_public = true);

create policy "public_read_active_skills"
on public.skills
for select
to anon, authenticated
using (status = 'active');

create policy "public_read_active_work_experience"
on public.work_experience
for select
to anon, authenticated
using (status = 'active');

-- ---------------------------------------------------------------------------
-- Public insert-only policies
-- ---------------------------------------------------------------------------

create policy "public_insert_analytics_events"
on public.analytics_events
for insert
to anon, authenticated
with check (
  user_type = 'visitor'
  and event_type in ('page_view', 'section_view', 'form_submission', 'click')
  and event_category in ('portfolio', 'contact', 'interaction')
);

create policy "public_insert_contact_messages"
on public.contact_messages
for insert
to anon, authenticated
with check (
  status = 'unread'
  and coalesce(priority, 'normal') in ('low', 'normal', 'high', 'urgent')
  and name is not null
  and email is not null
  and role_position is not null
  and inquiry_type is not null
  and subject is not null
  and message is not null
  and admin_notes is null
  and response_sent is not true
  and is_starred is not true
  and is_archived is not true
  and is_spam is not true
);

-- No anon/authenticated read/write policies are created for:
-- - admin_users
-- - admin_sessions
-- - admin_activity_analytics
-- - contact_analytics
-- - contact_messages reads/updates/deletes
-- - content_performance direct table access
-- - portfolio_metrics
--
-- service_role continues to bypass RLS for backend/Edge Function use.

-- ---------------------------------------------------------------------------
-- Storage hardening
-- ---------------------------------------------------------------------------

-- Contact attachments may contain resumes or private files. Keep upload from the
-- public contact form, but stop treating the bucket as public-downloadable.
update storage.buckets
set public = false
where id = 'contact-attachments';

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

-- Public read for portfolio display assets only.
create policy "public_read_portfolio_assets"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id in (
    'achievement-images',
    'certification-badges',
    'documents',
    'organization-logos',
    'profile-images',
    'project-images',
    'skill-icons'
  )
);

-- Public contact form upload only. Files are not publicly readable after upload.
create policy "public_upload_contact_attachments"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'contact-attachments');

commit;
