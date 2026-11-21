-- The resume on the public site (2026-11-21).
-- Run by the owner in the SQL editor. Safe to run again.
--
-- The hero row gains the link to the resume PDF the admin uploads in the Hero
-- chapter. The public site shows a Resume button in the hero and the header
-- only when this is set, and the analytics already count a resume open as a
-- reach-out (trackReachOut('resume')).
--
-- The check keeps the button pointing at the portfolio's own storage: a PDF
-- under documents/resume/ in this project's public bucket. A wrong paste or a
-- tampered row cannot send visitors to another site. The public site repeats
-- the same test before it shows the button (src/utils/resumeLink.js).
--
-- hero_content has table-level grants (anon select, admin writes through
-- the existing policies), so the new column needs no grant of its own.

begin;

alter table public.hero_content
  add column if not exists resume_url text;

alter table public.hero_content
  drop constraint if exists hero_content_resume_url_own_storage;

alter table public.hero_content
  add constraint hero_content_resume_url_own_storage check (
    resume_url is null
    or (
      length(resume_url) <= 500
      and resume_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/documents/resume/[A-Za-z0-9._-]+\.pdf$'
    )
  );

comment on column public.hero_content.resume_url is
  'Public link to the resume PDF in documents/resume/. Shown as the Resume button on the public site when set.';

commit;

-- ---- verification (read-only) ----
--   select column_name, data_type from information_schema.columns
--    where table_schema = 'public' and table_name = 'hero_content' and column_name = 'resume_url';
--   Expect one row: resume_url, text.
--   select conname from pg_constraint where conname = 'hero_content_resume_url_own_storage';
--   Expect one row.
