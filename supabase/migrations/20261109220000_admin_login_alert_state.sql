-- Throttle state for the admin login alert function (Phase 4).
--
-- One row, written only by the Edge Function through the service key. It
-- holds a counter and two timestamps, nothing about who tried or from where.
-- Row level security is on with no policies, so anon and authenticated roles
-- can neither read nor write it; the service role bypasses RLS.

begin;

create table if not exists public.admin_login_alert_state (
  id smallint primary key default 1 check (id = 1),
  attempts integer not null default 0 check (attempts >= 0),
  window_started_at timestamptz,
  last_alert_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.admin_login_alert_state is
  'Single-row throttle for the admin-login-alert Edge Function: attempt counter and alert timestamps only.';

alter table public.admin_login_alert_state enable row level security;
revoke all on table public.admin_login_alert_state from anon, authenticated;
grant select, insert, update on table public.admin_login_alert_state to service_role;

commit;
