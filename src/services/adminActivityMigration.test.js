/**
 * Contract checks on the admin activity migration. The owner applies the SQL
 * in the dashboard, not a test database, so these guard the access rules and
 * the trigger wiring the activity pane and the fix queue depend on.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261120120000_admin_activity.sql');
const raw = fs.readFileSync(FILE, 'utf8');

/** The SQL without line comments or extra spaces, so prose never satisfies a check. */
const sql = raw
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .replace(/\s+/g, ' ')
  .toLowerCase();

const CONTENT_TABLES = [
  ['hero_content', 'title'], ['about_content', 'about_me_title'], ['projects', 'title'], ['internships', 'company'],
  ['education', 'institution'], ['work_experience', 'company'], ['skills', 'skill_name'], ['certifications', 'title'],
  ['recommendations', 'recommender_name'], ['achievements', 'title'], ['leadership', 'title'],
];

describe('admin activity migration', () => {
  test('runs as one transaction and documents its rollback', () => {
    expect(sql.trim().startsWith('begin;')).toBe(true);
    expect(sql.trim().endsWith('commit;')).toBe(true);
    expect(raw).toMatch(/-- Rollback \(in the SQL editor\):/);
    expect(raw).toMatch(/--\s+select cron\.unschedule\('admin-activity-retention'\);/);
    expect(raw).toMatch(/--\s+drop table if exists public\.admin_activity;/);
    expect(raw).toMatch(/--\s+drop table if exists public\.admin_fix_dismissals;/);
  });

  test('the log accepts exactly the contract actions and sources', () => {
    const actions = sql.match(/action text not null check \(action in \(([^)]*)\)\)/)[1].match(/'[^']+'/g).map((s) => s.slice(1, -1));
    expect(actions.sort()).toEqual([
      'create', 'delete', 'edit', 'factor-add', 'factor-remove', 'inbox', 'passkey-add', 'passkey-remove',
      'remove-file', 'reorder', 'sign-in', 'sign-out-all', 'upload',
    ]);
    expect(sql).toContain("source text not null check (source in ('admin', 'outside'))");
  });

  test('the log is read-only for signed-in users and closed to anon', () => {
    expect(sql).toContain('revoke all on table public.admin_activity from anon, authenticated;');
    expect(sql).toContain('grant select on table public.admin_activity to authenticated;');
    expect(sql).not.toMatch(/grant [^;]*(insert|update|delete)[^;]* on table public\.admin_activity/);
    expect(sql).toContain('alter table public.admin_activity enable row level security;');
    expect(sql).toMatch(/create policy admin_reads_admin_activity on public\.admin_activity for select to authenticated using \(\(select app_private\.is_admin\(\)\)\);/);
    expect(sql).not.toMatch(/create policy \w+ on public\.admin_activity for (insert|update|delete|all)/);
  });

  test('dismissals: admin select, insert and delete only, one per rule and record', () => {
    expect(sql).toContain('revoke all on table public.admin_fix_dismissals from anon, authenticated;');
    expect(sql).toContain('grant select, insert, delete on table public.admin_fix_dismissals to authenticated;');
    for (const verb of ['select', 'insert', 'delete']) {
      expect(sql).toMatch(new RegExp(`on public\\.admin_fix_dismissals for ${verb} to authenticated (using|with check) \\(\\(select app_private\\.is_admin\\(\\)\\)\\)`));
    }
    expect(sql).toContain("on public.admin_fix_dismissals (rule_key, coalesce(record_id, ''))");
    expect(sql).toContain('note text check (note is null or char_length(note) <= 140)');
  });

  test('every writer is security definer with an empty search path', () => {
    const definers = sql.match(/create or replace function [\w.]+\([^)]*\) returns \w+ language plpgsql security definer set search_path = ''/g) || [];
    expect(definers.map((d) => d.split(' ')[4].split('(')[0]).sort()).toEqual(['app_private.log_content_change', 'public.log_admin_event']);
    expect(sql).toContain('revoke all on function app_private.log_content_change() from public, anon, authenticated;');
  });

  test('the security RPC is admin only, executable by authenticated only', () => {
    expect(sql).toContain('revoke all on function public.log_admin_event(text, text) from public, anon, authenticated;');
    expect(sql).toContain('grant execute on function public.log_admin_event(text, text) to authenticated;');
    expect(sql).toMatch(/if not coalesce\(app_private\.is_admin\(\), false\) then raise exception/);
    expect(sql).toContain("kind not in ('sign-in', 'sign-out-all', 'factor-add', 'factor-remove', 'passkey-add', 'passkey-remove')");
    expect(sql).toMatch(/left\(btrim\(regexp_replace\(coalesce\(label, ''\), '\[\[:cntrl:\]\]', '', 'g'\)\), 60\)/);
  });

  test('every content table gets the trigger with its label column, the inbox only update and delete', () => {
    for (const [table, label] of CONTENT_TABLES) {
      expect(sql).toContain(`['${table}', '${label}']`);
    }
    expect(sql).toContain('after insert or update or delete on public.%i for each row execute function app_private.log_content_change(%l)');
    expect(sql).toMatch(/create trigger log_admin_activity after update or delete on public\.contact_messages for each row execute function app_private\.log_content_change\(\);/);
  });

  test('the label columns match the admin\'s EDITED_TABLES', () => {
    jest.isolateModules(() => {
      jest.doMock('./supabaseClient', () => ({ supabase: {} }));
      const { EDITED_TABLES } = require('./voyageData');
      expect(EDITED_TABLES.map(([table, , label]) => [table, label])).toEqual(CONTENT_TABLES);
    });
  });

  test('the trigger ignores timestamps, coalesces reorders and never blocks a write', () => {
    expect(sql).toContain("where n.key not in ('updated_at', 'created_at')");
    expect(sql).toContain("a.at > now() - interval '2 minutes'");
    expect(sql).toContain("pg_advisory_xact_lock(hashtext('admin_activity_reorder:' || v_table))");
    expect(sql).toMatch(/exception when others then raise warning/);
  });

  test('retention runs daily at 08:00 UTC for rows older than 365 days', () => {
    expect(sql).toContain("select cron.schedule( 'admin-activity-retention', '0 8 * * *',");
    expect(sql).toContain("delete from public.admin_activity where at < now() - interval '365 days'");
    expect(sql).toMatch(/select cron\.unschedule\(jobname\) from cron\.job where jobname = 'admin-activity-retention';/);
  });
});
