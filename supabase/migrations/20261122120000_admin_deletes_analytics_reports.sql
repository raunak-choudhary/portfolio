-- The admin deletes stored quarterly reports (2026-11-22).
-- Run by the owner in the SQL editor. Safe to run again.
--
-- The Reports archive gains a Delete action in the report dialog. Until now
-- only the quarterly-report function wrote to analytics_reports (service
-- role) and the admin could only read it. This adds the one missing piece:
-- the signed-in admin may delete a report row.
--
-- The policy checks the admin exactly as the select policy
-- admin_reads_analytics_reports does: role authenticated and
-- app_private.is_admin(), which since 20261120130000 also requires the
-- second factor (aal2) in the verified token. A session that has only
-- passed the email code deletes nothing.
--
-- Row level security alone is not enough: 20261119120000 revoked every
-- privilege from authenticated and granted back select only, so the table
-- grant for delete is added as well. Insert and update stay with the
-- service role. Deleting a report removes only the stored copy; the visit
-- events it was built from are untouched, and an email already sent stays
-- in the inbox.
--
-- Rollback: drop policy if exists admin_deletes_analytics_reports on public.analytics_reports;
--           revoke delete on table public.analytics_reports from authenticated;

begin;

grant delete on table public.analytics_reports to authenticated;

drop policy if exists admin_deletes_analytics_reports on public.analytics_reports;
create policy admin_deletes_analytics_reports
  on public.analytics_reports
  for delete
  to authenticated
  using ((select app_private.is_admin()));

commit;

-- ---- verification (read-only) ----
--   select policyname, cmd, roles, qual from pg_policies
--    where schemaname = 'public' and tablename = 'analytics_reports' order by policyname;
--   Expect two rows with the same roles and qual: admin_deletes_analytics_reports (DELETE)
--   and admin_reads_analytics_reports (SELECT), both {authenticated} and
--   ( SELECT app_private.is_admin() AS is_admin).
--   select privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'analytics_reports' and grantee = 'authenticated'
--    order by privilege_type;
--   Expect two rows: DELETE, SELECT.
