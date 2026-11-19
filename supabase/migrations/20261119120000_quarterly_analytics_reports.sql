-- Quarterly analytics report: storage and schedule (V4b, Unit D).
--
-- The quarterly-report Edge Function writes one row per report (service
-- role) and emails it through Resend. The admin reads the archive through
-- one select policy. Two pg_cron jobs call the function on the first day of
-- each quarter; the function itself decides which of the two calls is 9 AM
-- in New York, so daylight saving time needs no second schedule.
--
-- ---------------------------------------------------------------------------
-- Owner steps, in order (the agent never runs these):
--
-- 1. Run this migration in the SQL editor.
--
-- 2. Create the two Vault secrets the cron jobs read. Use one long random
--    value for the secret (for example `openssl rand -hex 32`) and keep it
--    for step 3. Run once; to change a value later use vault.update_secret.
--
--      select vault.create_secret(
--        'https://emaaaeooafqawdvdreaz.supabase.co/functions/v1/quarterly-report',
--        'quarterly_report_url',
--        'Endpoint the quarterly report cron jobs call');
--      select vault.create_secret(
--        '<REPORT_CRON_SECRET value>',
--        'quarterly_report_secret',
--        'Shared secret sent as x-report-secret by the quarterly report cron jobs');
--
-- 3. Give the function the same secret (and, optionally, its own addresses):
--
--      supabase secrets set REPORT_CRON_SECRET=<same value> --project-ref emaaaeooafqawdvdreaz
--      (optional) REPORT_RECIPIENT_EMAIL, REPORT_SENDER; they fall back to
--      CONTACT_RECIPIENT_EMAIL and CONTACT_SENDER. RESEND_API_KEY already exists.
--
-- 4. Deploy the function with gateway JWT verification off (it checks the
--    cron secret or the admin's token itself):
--
--      supabase functions deploy quarterly-report --no-verify-jwt --project-ref emaaaeooafqawdvdreaz
--
-- Rollback: select cron.unschedule('quarterly-report-1300');
--           select cron.unschedule('quarterly-report-1400');
--           drop table public.analytics_reports;
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.analytics_reports (
  id uuid primary key default gen_random_uuid(),
  period_label text not null,
  quarter text not null,
  period_start date not null,
  period_end date not null,
  partial boolean not null default false,
  trigger text not null check (trigger in ('schedule', 'manual')),
  summary jsonb not null,
  body_html text not null,
  body_text text not null,
  email_status text not null check (email_status in ('sent', 'failed', 'skipped')),
  created_at timestamptz not null default now(),
  constraint analytics_reports_period_order check (period_end >= period_start)
);

comment on table public.analytics_reports is
  'Quarterly analytics reports written by the quarterly-report Edge Function (service role): the numbers, the email as sent, and its delivery status.';
comment on column public.analytics_reports.period_label is 'Months covered in words, for example "July to September 2026".';
comment on column public.analytics_reports.quarter is 'Calendar quarter in New York time, for example "Q3 2026".';
comment on column public.analytics_reports.period_end is 'Last day covered, inclusive.';
comment on column public.analytics_reports.partial is 'True for a manual "Generate now" report of the quarter so far.';
comment on column public.analytics_reports.trigger is 'schedule (cron, previous full quarter) or manual (admin, quarter so far).';
comment on column public.analytics_reports.summary is 'The numbers the report text was built from (see supabase/functions/quarterly-report/fixtures/README.md).';
comment on column public.analytics_reports.email_status is 'sent, failed, or skipped when email is not configured.';

-- A scheduled quarter is stored and sent once; manual snapshots may repeat.
create unique index if not exists analytics_reports_full_quarter_key
  on public.analytics_reports (quarter)
  where not partial;

create index if not exists analytics_reports_created_at_idx
  on public.analytics_reports (created_at desc);

alter table public.analytics_reports enable row level security;

revoke all on table public.analytics_reports from anon, authenticated;
grant select on table public.analytics_reports to authenticated;
grant select, insert, update on table public.analytics_reports to service_role;

-- The admin reads the archive. No insert, update or delete policy: only the
-- function writes, and the service role bypasses row level security.
drop policy if exists admin_reads_analytics_reports on public.analytics_reports;
create policy admin_reads_analytics_reports
  on public.analytics_reports
  for select
  to authenticated
  using ((select app_private.is_admin()));

commit;

-- Schedule. Extensions are created outside the table transaction so a
-- failure here leaves the table in place and the block can be rerun alone.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Rerunnable: drop the jobs if they exist, then create them again.
select cron.unschedule(jobname)
from cron.job
where jobname in ('quarterly-report-1300', 'quarterly-report-1400');

-- 13:00 UTC is 9 AM New York in summer time (1 April, 1 July, 1 October);
-- 14:00 UTC is 9 AM in winter time (1 January). Both fire every quarter and
-- the function ignores the call that is not 9 AM. URL and secret come from
-- Vault at run time, so neither is stored in the job text.
select cron.schedule(
  'quarterly-report-1300',
  '0 13 1 1,4,7,10 *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'quarterly_report_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-report-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'quarterly_report_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);

select cron.schedule(
  'quarterly-report-1400',
  '0 14 1 1,4,7,10 *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'quarterly_report_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-report-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'quarterly_report_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
