/**
 * Contract checks on the passkey bridge migration. The SQL is applied by the
 * owner, not by a test database, so these guard the access rules that the
 * Security screen and the admin-passkey function depend on.
 */
const fs = require('fs');
const path = require('path');

const MIGRATIONS = path.join(__dirname, '..', '..', 'supabase', 'migrations');

/** A migration without SQL line comments or extra spaces, so prose never satisfies a check. */
const readSql = (name) =>
  fs
    .readFileSync(path.join(MIGRATIONS, name), 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const sql = readSql('20261118120000_admin_passkeys.sql');
const guard = readSql('20261118120100_admin_keep_typed_factor.sql');

describe('admin passkeys migration', () => {
  test('signed-in users may only read passkeys, never delete them directly', () => {
    expect(sql).toContain('grant select on table public.admin_passkeys to authenticated;');
    expect(sql).not.toMatch(/grant [^;]*delete[^;]* on table public\.admin_passkeys to authenticated/);
    expect(sql).not.toMatch(/create policy \w+ on public\.admin_passkeys for delete/);
    expect(sql).toContain('drop policy if exists admin_deletes_own_passkeys on public.admin_passkeys;');
  });

  test('the challenge store is reached only through the service role function', () => {
    const signature =
      'issue_passkey_challenge(uuid, text, text, text, timestamptz, timestamptz, integer)';
    expect(sql).toContain(`revoke all on function app_private.${signature} from public, anon, authenticated;`);
    expect(sql).toContain(`grant execute on function app_private.${signature} to service_role;`);
    expect(sql).toContain(
      'revoke all on function public.issue_admin_passkey_challenge(uuid, text, text, text, timestamptz, timestamptz, integer) from public, anon, authenticated;',
    );
    expect(sql).toMatch(/pg_advisory_xact_lock\(/);
    expect(sql).not.toMatch(/grant [^;]* on table public\.admin_passkey_challenges to authenticated/);
  });

  test('the database keeps a typed authenticator while passkeys or a bridge exist', () => {
    expect(guard).toContain(
      'create trigger keep_typed_factor_with_passkeys before delete on auth.mfa_factors for each row execute function app_private.keep_typed_factor_with_passkeys();',
    );
    expect(guard).toContain('security definer set search_path = \'\'');
    // The bridge factor itself, unverified factors and user deletion stay possible.
    expect(guard).toContain("old.status::text <> 'verified'");
    expect(guard).toContain('b.factor_id = old.id');
    expect(guard).toContain('not exists (select 1 from auth.users u where u.id = old.user_id)');
    expect(guard).toMatch(/raise exception 'keep one authenticator app/);
    // A hosted project that refuses auth-schema triggers still applies the rest.
    expect(guard).toContain('when insufficient_privilege then raise notice');
    expect(guard).toContain(
      'revoke all on function app_private.keep_typed_factor_with_passkeys() from public, anon, authenticated;',
    );
  });
});
