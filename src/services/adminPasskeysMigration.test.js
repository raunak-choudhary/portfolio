/**
 * Contract checks on the passkey bridge migration. The SQL is applied by the
 * owner, not by a test database, so these guard the access rules that the
 * Security screen and the admin-passkey function depend on.
 */
const fs = require('fs');
const path = require('path');

const MIGRATION = path.join(
  __dirname,
  '..',
  '..',
  'supabase',
  'migrations',
  '20261118120000_admin_passkeys.sql',
);

/** The migration without SQL line comments, so prose never satisfies a check. */
const sql = fs
  .readFileSync(MIGRATION, 'utf8')
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .replace(/\s+/g, ' ')
  .toLowerCase();

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
});
