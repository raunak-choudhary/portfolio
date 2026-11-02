-- Clean Supabase Advisor performance warnings without changing the public UI.
--
-- 1. Public read/insert policies should apply to anonymous visitors only.
--    Authenticated admin access is handled separately by app_private.is_admin().
--    This removes duplicate authenticated policy evaluation while preserving:
--    - public portfolio reads for anonymous visitors
--    - public contact/analytics inserts for anonymous visitors
--    - admin reads/writes for signed-in active admin users
--
-- 2. Drop exact duplicate skills indexes and keep the shorter existing names.

begin;

drop policy if exists "public_read_active_about_content" on public.about_content;
create policy "public_read_active_about_content"
on public.about_content
for select
to anon
using (is_active = true);

drop policy if exists "public_read_active_achievements" on public.achievements;
create policy "public_read_active_achievements"
on public.achievements
for select
to anon
using ((status)::text = 'active'::text);

drop policy if exists "public_read_active_certifications" on public.certifications;
create policy "public_read_active_certifications"
on public.certifications
for select
to anon
using ((status)::text = 'active'::text);

drop policy if exists "public_read_active_education" on public.education;
create policy "public_read_active_education"
on public.education
for select
to anon
using ((status)::text = 'active'::text);

drop policy if exists "public_read_active_hero_content" on public.hero_content;
create policy "public_read_active_hero_content"
on public.hero_content
for select
to anon
using (is_active = true);

drop policy if exists "public_read_active_internships" on public.internships;
create policy "public_read_active_internships"
on public.internships
for select
to anon
using ((status)::text = 'active'::text);

drop policy if exists "public_read_active_leadership" on public.leadership;
create policy "public_read_active_leadership"
on public.leadership
for select
to anon
using ((status)::text = 'active'::text);

drop policy if exists "public_read_active_projects" on public.projects;
create policy "public_read_active_projects"
on public.projects
for select
to anon
using ((status)::text = 'active'::text);

drop policy if exists "public_read_active_public_recommendations" on public.recommendations;
create policy "public_read_active_public_recommendations"
on public.recommendations
for select
to anon
using (((status)::text = 'active'::text) and (is_public = true));

drop policy if exists "public_read_active_skills" on public.skills;
create policy "public_read_active_skills"
on public.skills
for select
to anon
using ((status)::text = 'active'::text);

drop policy if exists "public_read_active_work_experience" on public.work_experience;
create policy "public_read_active_work_experience"
on public.work_experience
for select
to anon
using ((status)::text = 'active'::text);

drop policy if exists "public_insert_analytics_events" on public.analytics_events;
create policy "public_insert_analytics_events"
on public.analytics_events
for insert
to anon
with check (
  ((user_type)::text = 'visitor'::text)
  and ((event_type)::text = any ((array[
    'page_view'::character varying,
    'section_view'::character varying,
    'form_submission'::character varying,
    'click'::character varying
  ])::text[]))
  and ((event_category)::text = any ((array[
    'portfolio'::character varying,
    'contact'::character varying,
    'interaction'::character varying
  ])::text[]))
);

drop policy if exists "public_insert_contact_messages" on public.contact_messages;
create policy "public_insert_contact_messages"
on public.contact_messages
for insert
to anon
with check (
  ((status)::text = 'unread'::text)
  and ((coalesce(priority, 'normal'::character varying))::text = any ((array[
    'low'::character varying,
    'normal'::character varying,
    'high'::character varying,
    'urgent'::character varying
  ])::text[]))
  and (name is not null)
  and (email is not null)
  and (role_position is not null)
  and (inquiry_type is not null)
  and (subject is not null)
  and (message is not null)
  and (admin_notes is null)
  and (response_sent is not true)
  and (is_starred is not true)
  and (is_archived is not true)
  and (is_spam is not true)
);

drop index if exists public.idx_skills_is_featured;
drop index if exists public.idx_skills_order_index;

commit;
