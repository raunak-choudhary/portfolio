-- Admin activity log and fix-queue dismissals (V5, Unit E).
--
-- public.admin_activity records what changed in the admin, never the values:
-- one row per created, edited or deleted record on the eleven content
-- tables, per inbox change, per file upload or removal, one coalesced row per
-- reorder, and one row per security event (sign-in, sign out everywhere,
-- authenticator or passkey added or removed). Content rows are written by a
-- trigger, security rows by the log_admin_event RPC; nobody can insert,
-- update or delete rows directly. Rows older than 365 days are deleted daily.
--
-- public.admin_fix_dismissals holds the fix-queue items the owner marked
-- "not needed", with an optional reason.
--
-- Column choices checked against the live schema on 2026-11-19:
--   order columns  order_index (every list table) and skill_type_priority
--                  (skills group order); hero_content and about_content have
--                  none. display_order exists on no table but is accepted.
--   file columns   the columns the admin uploads files into (see
--                  app_private.activity_file_columns below). Link columns
--                  such as live_url, github_urls, credential_url,
--                  linkedin_profile_url and verification_url hold typed links,
--                  not stored files, so changing them is an ordinary edit.
--   timestamps     updated_at is set by each table's BEFORE UPDATE trigger
--                  on every update, so it is ignored when diffing.
--
-- ---------------------------------------------------------------------------
-- Owner step: run this whole file once in the SQL editor. It is one
-- transaction and can be rerun.
--
-- Rollback (in the SQL editor):
--   select cron.unschedule('admin-activity-retention');
--   drop function if exists app_private.log_content_change() cascade;  -- also drops the 12 log_admin_activity triggers
--   drop function if exists public.log_admin_event(text, text);
--   drop function if exists app_private.activity_file_columns(text);
--   drop function if exists app_private.activity_url_set(jsonb);
--   drop table if exists public.admin_activity;
--   drop table if exists public.admin_fix_dismissals;
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.admin_activity (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  action text not null check (action in (
    'create', 'edit', 'delete', 'reorder', 'upload', 'remove-file',
    'sign-in', 'sign-out-all', 'factor-add', 'factor-remove',
    'passkey-add', 'passkey-remove', 'inbox'
  )),
  section text not null check (char_length(section) between 1 and 63),
  record_id text,
  record_title text check (record_title is null or char_length(record_title) <= 120),
  fields text[],
  detail jsonb,
  source text not null check (source in ('admin', 'outside'))
);

comment on table public.admin_activity is
  'What changed in the admin and when: content changes (trigger app_private.log_content_change) and security events (RPC public.log_admin_event). Column names only, never values. Kept 365 days.';
comment on column public.admin_activity.section is 'Content table name (hero_content ... leadership, contact_messages), or security for security events.';
comment on column public.admin_activity.record_id is 'The changed row''s id as text; null for security events and reorders.';
comment on column public.admin_activity.record_title is 'The row''s label at the time (at most 120 characters); null for contact_messages, so no sender names are kept.';
comment on column public.admin_activity.fields is 'Names of the columns that changed; never their values.';
comment on column public.admin_activity.detail is 'Small counts or labels: {"added":2}, {"removed":1}, {"count":3}, {"status":"archived"}, {"label":"Pixel 9"}.';
comment on column public.admin_activity.source is 'admin when the request carried the admin''s signed-in token; outside for the SQL editor, the dashboard, the service role and imports.';

create index if not exists admin_activity_at_idx
  on public.admin_activity (at desc, id desc);

create index if not exists admin_activity_record_idx
  on public.admin_activity (section, record_id, at desc)
  where record_id is not null;

create table if not exists public.admin_fix_dismissals (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null check (char_length(rule_key) between 1 and 120),
  record_id text,
  note text check (note is null or char_length(note) <= 140),
  created_at timestamptz not null default now()
);

comment on table public.admin_fix_dismissals is
  'Fix-queue items the owner marked "not needed": rule_key like projects:images, record_id null for the whole group, optional reason.';

create unique index if not exists admin_fix_dismissals_rule_record_key
  on public.admin_fix_dismissals (rule_key, coalesce(record_id, ''));

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.admin_activity enable row level security;
alter table public.admin_fix_dismissals enable row level security;

-- The log is read-only for everyone: the trigger function and the RPC run as
-- the table owner, which row level security does not apply to.
revoke all on table public.admin_activity from anon, authenticated;
grant select on table public.admin_activity to authenticated;

revoke all on table public.admin_fix_dismissals from anon, authenticated;
grant select, insert, delete on table public.admin_fix_dismissals to authenticated;

drop policy if exists admin_reads_admin_activity on public.admin_activity;
create policy admin_reads_admin_activity
  on public.admin_activity
  for select
  to authenticated
  using ((select app_private.is_admin()));

drop policy if exists admin_reads_fix_dismissals on public.admin_fix_dismissals;
create policy admin_reads_fix_dismissals
  on public.admin_fix_dismissals
  for select
  to authenticated
  using ((select app_private.is_admin()));

drop policy if exists admin_adds_fix_dismissals on public.admin_fix_dismissals;
create policy admin_adds_fix_dismissals
  on public.admin_fix_dismissals
  for insert
  to authenticated
  with check ((select app_private.is_admin()));

drop policy if exists admin_removes_fix_dismissals on public.admin_fix_dismissals;
create policy admin_removes_fix_dismissals
  on public.admin_fix_dismissals
  for delete
  to authenticated
  using ((select app_private.is_admin()));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Columns of each content table that hold uploaded files (storage URLs).
create or replace function app_private.activity_file_columns(p_table text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_table
    when 'about_content' then array['profile_image_url', 'profile_image_about', 'profile_image_info']
    when 'achievements' then array['certificate_url']
    when 'certifications' then array['issuer_logo_url', 'badge_image_url', 'certificate_pdf_url']
    when 'education' then array['institution_logo_url']
    when 'internships' then array['company_logo_url', 'certificate_urls']
    when 'projects' then array['image_urls']
    when 'recommendations' then array['profile_image_url']
    when 'skills' then array['icon_url']
    when 'work_experience' then array['company_logo_url']
    else array[]::text[]
  end;
$$;

-- The non-empty URLs held by one column value: a JSON array of URLs, a
-- single URL string, or nothing.
create or replace function app_private.activity_url_set(p_value jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null or jsonb_typeof(p_value) = 'null' then array[]::text[]
    when jsonb_typeof(p_value) = 'array' then coalesce(
      (select array_agg(distinct btrim(e)) from jsonb_array_elements_text(p_value) as e where btrim(e) <> ''),
      array[]::text[])
    when jsonb_typeof(p_value) = 'string' and btrim(p_value #>> '{}') <> '' then array[btrim(p_value #>> '{}')]
    else array[]::text[]
  end;
$$;

revoke all on function app_private.activity_file_columns(text) from public, anon, authenticated;
revoke all on function app_private.activity_url_set(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Content trigger
-- ---------------------------------------------------------------------------

-- AFTER row trigger. The first trigger argument names the table's label
-- column (none for contact_messages). A failure here is reported as a
-- warning and never blocks the content write that fired it.
create or replace function app_private.log_content_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text := tg_table_name;
  v_label_col text := case when tg_nargs > 0 then nullif(tg_argv[0], '') end;
  v_order_cols constant text[] := array['order_index', 'display_order', 'skill_type_priority'];
  v_source text;
  v_old jsonb;
  v_new jsonb;
  v_fields text[];
  v_file_cols text[];
  v_title text;
  v_col text;
  v_old_set text[];
  v_new_set text[];
  v_added integer := 0;
  v_removed integer := 0;
  v_status text;
  v_reorder_id bigint;
begin
  begin
    v_source := case
      when coalesce(auth.jwt() ->> 'role', '') = 'authenticated' and coalesce(app_private.is_admin(), false) then 'admin'
      else 'outside'
    end;

    if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
    if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;

    if tg_op = 'UPDATE' then
      select coalesce(array_agg(n.key order by n.key), array[]::text[])
        into v_fields
        from jsonb_each(v_new) as n
       where n.key not in ('updated_at', 'created_at')
         and n.value is distinct from (v_old -> n.key);
      -- Nothing but timestamps changed: no row.
      if cardinality(v_fields) = 0 then
        return null;
      end if;
    end if;

    -- Inbox: status changes and deletions, never the sender.
    if v_table = 'contact_messages' then
      if tg_op = 'DELETE' then
        insert into public.admin_activity (action, section, record_id, detail, source)
        values ('inbox', v_table, v_old ->> 'id', jsonb_build_object('status', 'deleted'), v_source);
      elsif tg_op = 'UPDATE' then
        -- The flags carry the meaning (archiving leaves the status column alone).
        v_status := case
          when 'is_spam' = any(v_fields) then case when (v_new ->> 'is_spam')::boolean then 'spam' else 'not-spam' end
          when 'is_archived' = any(v_fields) then case when (v_new ->> 'is_archived')::boolean then 'archived' else 'unarchived' end
          when 'status' = any(v_fields) or 'read_at' = any(v_fields) then coalesce(v_new ->> 'status', 'updated')
          when 'is_starred' = any(v_fields) then case when (v_new ->> 'is_starred')::boolean then 'starred' else 'unstarred' end
          when 'priority' = any(v_fields) then 'priority'
          when 'admin_notes' = any(v_fields) then 'notes'
          else coalesce(v_new ->> 'status', 'updated')
        end;
        insert into public.admin_activity (action, section, record_id, fields, detail, source)
        values ('inbox', v_table, v_new ->> 'id', v_fields, jsonb_build_object('status', v_status), v_source);
      end if;
      return null;
    end if;

    if v_label_col is not null then
      v_title := left(nullif(btrim(coalesce(v_new, v_old) ->> v_label_col), ''), 120);
    end if;

    if tg_op = 'INSERT' then
      insert into public.admin_activity (action, section, record_id, record_title, source)
      values ('create', v_table, v_new ->> 'id', v_title, v_source);
      return null;
    end if;

    if tg_op = 'DELETE' then
      insert into public.admin_activity (action, section, record_id, record_title, source)
      values ('delete', v_table, v_old ->> 'id', v_title, v_source);
      return null;
    end if;

    -- Only the order changed: one 'reorder' row per table and source within
    -- two minutes. A reorder writes many rows in parallel requests, so the
    -- lock makes them find and count one row instead of each inserting one.
    if v_fields <@ v_order_cols then
      perform pg_advisory_xact_lock(hashtext('admin_activity_reorder:' || v_table));
      select a.id
        into v_reorder_id
        from public.admin_activity as a
       where a.action = 'reorder'
         and a.section = v_table
         and a.source = v_source
         and a.at > now() - interval '2 minutes'
       order by a.at desc, a.id desc
       limit 1;
      if v_reorder_id is not null then
        update public.admin_activity as a
           set detail = jsonb_build_object('count', coalesce((a.detail ->> 'count')::integer, 1) + 1),
               fields = (select array_agg(distinct f order by f) from unnest(coalesce(a.fields, array[]::text[]) || v_fields) as f)
         where a.id = v_reorder_id;
      else
        insert into public.admin_activity (action, section, fields, detail, source)
        values ('reorder', v_table, v_fields, jsonb_build_object('count', 1), v_source);
      end if;
      return null;
    end if;

    -- Only file columns changed: an upload or a removal, counted by URL.
    v_file_cols := app_private.activity_file_columns(v_table);
    if cardinality(v_file_cols) > 0 and v_fields <@ v_file_cols then
      foreach v_col in array v_fields loop
        v_old_set := app_private.activity_url_set(v_old -> v_col);
        v_new_set := app_private.activity_url_set(v_new -> v_col);
        v_added := v_added + (select count(*) from unnest(v_new_set) as u where not (u = any(v_old_set)));
        v_removed := v_removed + (select count(*) from unnest(v_old_set) as u where not (u = any(v_new_set)));
      end loop;
      if v_added > 0 then
        insert into public.admin_activity (action, section, record_id, record_title, fields, detail, source)
        values ('upload', v_table, v_new ->> 'id', v_title, v_fields,
                case when v_removed > 0
                  then jsonb_build_object('added', v_added, 'removed', v_removed)
                  else jsonb_build_object('added', v_added) end,
                v_source);
        return null;
      elsif v_removed > 0 then
        insert into public.admin_activity (action, section, record_id, record_title, fields, detail, source)
        values ('remove-file', v_table, v_new ->> 'id', v_title, v_fields, jsonb_build_object('removed', v_removed), v_source);
        return null;
      end if;
      -- Same files in a new order: an ordinary edit, below.
    end if;

    insert into public.admin_activity (action, section, record_id, record_title, fields, source)
    values ('edit', v_table, v_new ->> 'id', v_title, v_fields, v_source);
    return null;
  exception when others then
    raise warning 'admin_activity: % on public.% was not logged (%)', tg_op, v_table, sqlstate;
    return null;
  end;
end;
$$;

revoke all on function app_private.log_content_change() from public, anon, authenticated;

comment on function app_private.log_content_change() is
  'AFTER row trigger: writes public.admin_activity for content and inbox changes (column names only). Argument 1: the table''s label column.';

-- The eleven content tables (EDITED_TABLES in src/services/voyageData.js)
-- with their label columns, plus the inbox (updates and deletes only: an
-- insert is a public contact form post, not admin activity).
do $$
declare
  v_pair text[];
begin
  foreach v_pair slice 1 in array array[
    ['hero_content', 'title'],
    ['about_content', 'about_me_title'],
    ['projects', 'title'],
    ['internships', 'company'],
    ['education', 'institution'],
    ['work_experience', 'company'],
    ['skills', 'skill_name'],
    ['certifications', 'title'],
    ['recommendations', 'recommender_name'],
    ['achievements', 'title'],
    ['leadership', 'title']
  ]
  loop
    execute format('drop trigger if exists log_admin_activity on public.%I', v_pair[1]);
    execute format(
      'create trigger log_admin_activity after insert or update or delete on public.%I for each row execute function app_private.log_content_change(%L)',
      v_pair[1], v_pair[2]
    );
  end loop;
end $$;

drop trigger if exists log_admin_activity on public.contact_messages;
create trigger log_admin_activity
  after update or delete on public.contact_messages
  for each row execute function app_private.log_content_change();

-- ---------------------------------------------------------------------------
-- Security events
-- ---------------------------------------------------------------------------

-- Called by the admin app after a security action succeeds (sign out
-- everywhere: just before). The label is a device or app name only.
create or replace function public.log_admin_event(kind text, label text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := nullif(left(btrim(regexp_replace(coalesce(label, ''), '[[:cntrl:]]', '', 'g')), 60), '');
begin
  if not coalesce(app_private.is_admin(), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if kind is null or kind not in ('sign-in', 'sign-out-all', 'factor-add', 'factor-remove', 'passkey-add', 'passkey-remove') then
    raise exception 'unknown event kind' using errcode = '22023';
  end if;
  insert into public.admin_activity (action, section, detail, source)
  values (kind, 'security', case when v_label is null then null else jsonb_build_object('label', v_label) end, 'admin');
end;
$$;

revoke all on function public.log_admin_event(text, text) from public, anon, authenticated;
grant execute on function public.log_admin_event(text, text) to authenticated;

comment on function public.log_admin_event(text, text) is
  'Admin only: records a security event (sign-in, sign-out-all, factor-add, factor-remove, passkey-add, passkey-remove) with an optional device or app label of at most 60 characters.';

-- ---------------------------------------------------------------------------
-- Retention: daily at 08:00 UTC, rows older than 365 days go.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobname)
from cron.job
where jobname = 'admin-activity-retention';

select cron.schedule(
  'admin-activity-retention',
  '0 8 * * *',
  $job$delete from public.admin_activity where at < now() - interval '365 days'$job$
);

commit;
