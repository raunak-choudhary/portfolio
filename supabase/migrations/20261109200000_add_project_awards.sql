-- Optional awards line for a project (Unit 3.2, owner request 2026-11-09).
--
-- Holds a short text such as "First Prize, Example Hackathon" and stays null
-- for projects that did not win or place; the public card renders the award
-- only when it is present. The column inherits the table's existing row level
-- security policies: visitors read it on active rows, only the admin writes it.

alter table public.projects
  add column if not exists awards text;

alter table public.projects
  drop constraint if exists projects_awards_length;

alter table public.projects
  add constraint projects_awards_length check (awards is null or char_length(awards) <= 200);

comment on column public.projects.awards is
  'Award or placement shown on the project card; null when there is none.';
