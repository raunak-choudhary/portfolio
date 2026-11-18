-- Keep a typed authenticator while passkeys exist (login unit, 2026-11-18).
--
-- With passkeys registered, the second step can be passed by the server-held
-- bridge factor alone. If the owner then removed their last authenticator
-- app, the account would depend on the passkey bridge and its key with no
-- typed fallback. The Security screen already refuses that; this trigger
-- refuses it in the database too, whoever asks Auth to remove the factor.
--
-- A delete from auth.mfa_factors is allowed when any of these hold:
--   the factor is not a verified TOTP factor (unverified leftovers, phone);
--   it is the bridge factor itself (its id is in admin_passkey_bridge);
--   the user is being deleted (the auth.users row is already gone);
--   the user has no passkeys and no bridge;
--   another verified TOTP factor, not the bridge, remains.
-- Otherwise the delete fails. To switch passkeys off, delete the passkeys and
-- the bridge first (see docs/runbooks/admin-passkey-bridge.md).
--
-- Hosted projects may not let the migration role add triggers to the auth
-- schema. In that case the block below skips the trigger with a notice and
-- the Security screen remains the only guard.

begin;

create or replace function app_private.keep_typed_factor_with_passkeys()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.factor_type::text <> 'totp' or old.status::text <> 'verified' then
    return old;
  end if;

  if exists (
    select 1 from public.admin_passkey_bridge b
    where b.user_id = old.user_id and b.factor_id = old.id
  ) then
    return old;
  end if;

  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;

  if not exists (select 1 from public.admin_passkey_bridge b where b.user_id = old.user_id)
     and not exists (select 1 from public.admin_passkeys p where p.user_id = old.user_id) then
    return old;
  end if;

  if exists (
    select 1 from auth.mfa_factors f
    where f.user_id = old.user_id
      and f.id <> old.id
      and f.factor_type::text = 'totp'
      and f.status::text = 'verified'
      and not exists (select 1 from public.admin_passkey_bridge b where b.factor_id = f.id)
  ) then
    return old;
  end if;

  raise exception 'Keep one authenticator app while passkeys are registered. Remove the passkeys first.'
    using errcode = 'P0001';
end;
$$;

revoke all on function app_private.keep_typed_factor_with_passkeys() from public, anon, authenticated;

do $$
begin
  drop trigger if exists keep_typed_factor_with_passkeys on auth.mfa_factors;
  create trigger keep_typed_factor_with_passkeys
    before delete on auth.mfa_factors
    for each row execute function app_private.keep_typed_factor_with_passkeys();
exception
  when insufficient_privilege then
    raise notice 'keep_typed_factor_with_passkeys: no permission to add a trigger on auth.mfa_factors; the Security screen guard still applies';
end;
$$;

commit;
