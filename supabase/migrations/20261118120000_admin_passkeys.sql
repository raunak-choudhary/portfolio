-- Admin passkey bridge (login unit, 2026-11-18).
--
-- Supabase Auth documents only TOTP and phone as MFA factors. The bridge lets
-- the owner pass the second step with a passkey: the admin-passkey Edge
-- Function checks a WebAuthn assertion, then completes the MFA challenge for
-- a server-held TOTP factor ("Passkey bridge") with the owner's own token.
--
-- Three tables:
--   admin_passkeys            registered credentials (public keys only). The
--                             owner may list and delete their own rows at
--                             assurance level 2; only the function inserts
--                             or updates (service role).
--   admin_passkey_challenges  single-use WebAuthn challenges; service role only.
--   admin_passkey_bridge      the bridge factor id and its TOTP secret,
--                             encrypted with AES-256-GCM under a key that
--                             lives only in the function's secrets; service
--                             role only.
-- Row level security is on everywhere; tables without policies are closed to
-- anon and authenticated, and the service role bypasses RLS.

begin;

create table if not exists public.admin_passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  sign_count bigint not null default 0 check (sign_count >= 0),
  transports text[],
  device_name text not null check (char_length(btrim(device_name)) between 1 and 60),
  rp_id text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

comment on table public.admin_passkeys is
  'Admin WebAuthn credentials for the passkey bridge: credential id and COSE public key (base64url), counter, device label.';

create index if not exists admin_passkeys_user_rp_idx on public.admin_passkeys (user_id, rp_id);

create table if not exists public.admin_passkey_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null check (kind in ('register', 'authenticate')),
  challenge text not null,
  rp_id text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.admin_passkey_challenges is
  'Single-use WebAuthn challenges issued by the admin-passkey function. Service role only.';

create index if not exists admin_passkey_challenges_user_created_idx
  on public.admin_passkey_challenges (user_id, created_at);

create table if not exists public.admin_passkey_bridge (
  user_id uuid primary key references auth.users (id) on delete cascade,
  factor_id uuid not null,
  secret_ciphertext text not null,
  created_at timestamptz not null default now()
);

comment on table public.admin_passkey_bridge is
  'Server-held TOTP factor behind the passkey bridge: factor id and the AES-256-GCM encrypted secret. Service role only.';

alter table public.admin_passkeys enable row level security;
alter table public.admin_passkey_challenges enable row level security;
alter table public.admin_passkey_bridge enable row level security;

revoke all on table public.admin_passkeys from anon, authenticated;
revoke all on table public.admin_passkey_challenges from anon, authenticated;
revoke all on table public.admin_passkey_bridge from anon, authenticated;

-- The owner's Security screen lists and removes passkeys directly; both need
-- the admin identity and a session that has passed the second factor.
grant select, delete on table public.admin_passkeys to authenticated;

drop policy if exists admin_reads_own_passkeys on public.admin_passkeys;
create policy admin_reads_own_passkeys
  on public.admin_passkeys
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and (select app_private.is_admin())
    and (select auth.jwt() ->> 'aal') = 'aal2'
  );

drop policy if exists admin_deletes_own_passkeys on public.admin_passkeys;
create policy admin_deletes_own_passkeys
  on public.admin_passkeys
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and (select app_private.is_admin())
    and (select auth.jwt() ->> 'aal') = 'aal2'
  );

-- Rate limit and insert in one step (at most 10 challenges per user in 15
-- minutes). A per-user advisory lock serialises concurrent callers, so two
-- requests can never both see nine and both insert. Returns the new
-- challenge id, or null when the limit is reached. Rows older than a day are
-- cleared on the way. The body lives in app_private; the public wrapper exists
-- only because the API exposes the public schema, and both are executable by
-- the service role alone (the admin-passkey function).
create or replace function app_private.issue_passkey_challenge(
  p_user_id uuid,
  p_kind text,
  p_challenge text,
  p_rp_id text,
  p_expires_at timestamptz,
  p_window_start timestamptz,
  p_max integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('admin_passkey_challenge:' || p_user_id::text, 0));

  delete from public.admin_passkey_challenges
  where user_id = p_user_id
    and created_at < now() - interval '1 day';

  insert into public.admin_passkey_challenges (user_id, kind, challenge, rp_id, expires_at)
  select p_user_id, p_kind, p_challenge, p_rp_id, p_expires_at
  where (
    select count(*)
    from public.admin_passkey_challenges c
    where c.user_id = p_user_id
      and c.created_at >= p_window_start
  ) < p_max
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function app_private.issue_passkey_challenge(uuid, text, text, text, timestamptz, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function app_private.issue_passkey_challenge(uuid, text, text, text, timestamptz, timestamptz, integer)
  to service_role;

create or replace function public.issue_admin_passkey_challenge(
  p_user_id uuid,
  p_kind text,
  p_challenge text,
  p_rp_id text,
  p_expires_at timestamptz,
  p_window_start timestamptz,
  p_max integer
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select app_private.issue_passkey_challenge(p_user_id, p_kind, p_challenge, p_rp_id, p_expires_at, p_window_start, p_max);
$$;

revoke all on function public.issue_admin_passkey_challenge(uuid, text, text, text, timestamptz, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.issue_admin_passkey_challenge(uuid, text, text, text, timestamptz, timestamptz, integer)
  to service_role;

grant select, insert, update, delete on table public.admin_passkeys to service_role;
grant select, insert, update, delete on table public.admin_passkey_challenges to service_role;
grant select, insert, update, delete on table public.admin_passkey_bridge to service_role;

commit;
