-- Security pass of 2026-11-19 (voyage V6). Three gaps, one migration.
--
-- 1. The second factor was enforced by the dashboard only. app_private.is_admin()
--    accepted any session of the admin's account, so a session that had passed
--    only the first step (email code or Google) could read and write every
--    table and bucket through the REST API directly. is_admin() now also
--    requires assurance level 2 in the verified token. is_admin_identity()
--    stays as it is: it answers "is this the admin's account?" at level 1 and
--    guards only the admin's own admin_users row (login and enrolment screens).
--    Every policy, the storage policy and log_admin_event() call is_admin(),
--    so they all tighten with it. Edge Functions use the service role and
--    check the level themselves.
--
--    Lock-out note: level 2 needs a verified authenticator factor or a
--    passkey. If every factor is ever lost, recover in the SQL editor (which
--    runs as postgres, outside these policies).
--
--    Side effect handled here: content tables were readable by `anon` only,
--    with the admin reading through is_admin(). A signed-in session below
--    level 2 would now see an empty public site, so the public read policies
--    cover `authenticated` too. They expose exactly the rows anon already sees.
--
-- 2. The contact form's anon insert had no size or rate bound: one script
--    could fill the table. Lengths now have CHECK constraints (looser than the
--    form and the email function, so both keep working), anon rows always get
--    the server's clock, and at most 30 anon messages are accepted per hour.
--    The notification email gets its own counter (take_contact_email_slot,
--    called by the send-contact-email function with the service role) so a
--    flood cannot spend the email quota that login alerts and reports share.
--
-- 3. The analytics anon insert accepted any metadata size and any timestamp,
--    so history could be padded or back-dated. Metadata is capped and both
--    time columns must be the server's present.
--
-- Timestamps on these two tables are `timestamp without time zone` filled by
-- now() in a UTC database; comparisons below use (now() at time zone 'utc').

begin;

-- ---- 1. second factor in SQL ----

create or replace function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true) is false
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    and exists (
      select 1
      from public.admin_users au
      where au.is_active = true
        and au.email is not null
        and lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

alter policy public_read_active_about_content on public.about_content to anon, authenticated;
alter policy public_read_active_achievements on public.achievements to anon, authenticated;
alter policy public_read_active_certifications on public.certifications to anon, authenticated;
alter policy public_read_active_education on public.education to anon, authenticated;
alter policy public_read_active_hero_content on public.hero_content to anon, authenticated;
alter policy public_read_active_internships on public.internships to anon, authenticated;
alter policy public_read_active_leadership on public.leadership to anon, authenticated;
alter policy public_read_active_projects on public.projects to anon, authenticated;
alter policy public_read_active_public_recommendations on public.recommendations to anon, authenticated;
alter policy public_read_active_skills on public.skills to anon, authenticated;
alter policy public_read_active_work_experience on public.work_experience to anon, authenticated;

-- ---- 2. contact form bounds ----

-- Dropped first so the migration can be run again.
alter table public.contact_messages
  drop constraint if exists contact_messages_message_length,
  drop constraint if exists contact_messages_attachment_url_length,
  drop constraint if exists contact_messages_attachment_lists,
  drop constraint if exists contact_messages_admin_notes_length;

alter table public.contact_messages
  add constraint contact_messages_message_length check (char_length(message) <= 10000),
  add constraint contact_messages_attachment_url_length check (attachment_url is null or char_length(attachment_url) <= 1024),
  add constraint contact_messages_attachment_lists check (
    (attachment_urls is null or (jsonb_typeof(attachment_urls) = 'array' and jsonb_array_length(attachment_urls) <= 10 and pg_column_size(attachment_urls) <= 8192))
    and (attachment_names is null or (jsonb_typeof(attachment_names) = 'array' and jsonb_array_length(attachment_names) <= 10 and pg_column_size(attachment_names) <= 8192))
  ),
  add constraint contact_messages_admin_notes_length check (admin_notes is null or char_length(admin_notes) <= 10000);

create or replace function app_private.guard_public_contact_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamp := (now() at time zone 'utc');
begin
  -- Only visitor rows; the admin and the service role are not limited.
  if coalesce(auth.role(), '') <> 'anon' then
    return new;
  end if;
  -- The server's clock, so a back-dated row cannot slip under the window.
  new.created_at := v_now;
  new.updated_at := v_now;
  if (select count(*) from public.contact_messages m where m.created_at > v_now - interval '1 hour') >= 30 then
    raise exception 'too many messages, try again later' using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke all on function app_private.guard_public_contact_insert() from public, anon, authenticated;

drop trigger if exists guard_public_contact_insert on public.contact_messages;
create trigger guard_public_contact_insert
  before insert on public.contact_messages
  for each row execute function app_private.guard_public_contact_insert();

-- One row: the current hour's count of notification emails.
create table if not exists public.contact_email_rate (
  id smallint primary key default 1 check (id = 1),
  window_started_at timestamptz not null default now(),
  sent integer not null default 0
);
alter table public.contact_email_rate enable row level security;
revoke all on table public.contact_email_rate from public, anon, authenticated;

-- Takes one of the hour's email slots; false when the hour is used up.
create or replace function public.take_contact_email_slot(p_max integer default 10)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer := least(greatest(coalesce(p_max, 10), 1), 100);
begin
  insert into public.contact_email_rate (id) values (1) on conflict (id) do nothing;
  update public.contact_email_rate r
     set sent = case when now() - r.window_started_at >= interval '1 hour' then 1 else r.sent + 1 end,
         window_started_at = case when now() - r.window_started_at >= interval '1 hour' then now() else r.window_started_at end
   where r.id = 1
     and (now() - r.window_started_at >= interval '1 hour' or r.sent < v_max);
  return found;
end;
$$;

revoke all on function public.take_contact_email_slot(integer) from public, anon, authenticated;
grant execute on function public.take_contact_email_slot(integer) to service_role;

-- ---- 3. analytics insert bounds ----

alter policy public_insert_analytics_events on public.analytics_events
  with check (
    (user_type)::text = 'visitor'
    and (event_type)::text = any (array['page_view', 'section_view', 'form_submission', 'click'])
    and (event_category)::text = any (array['portfolio', 'contact', 'interaction'])
    and (metadata is null or pg_column_size(metadata) <= 4096)
    and "timestamp" between (now() at time zone 'utc') - interval '10 minutes' and (now() at time zone 'utc') + interval '10 minutes'
    and created_at between (now() at time zone 'utc') - interval '10 minutes' and (now() at time zone 'utc') + interval '10 minutes'
  );

commit;
