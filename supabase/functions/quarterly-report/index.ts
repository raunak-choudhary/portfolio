// supabase/functions/quarterly-report/index.ts
//
// Entry point: wires the report handler to Supabase Auth (the caller's own
// token, for the manual path), to the database through the service key
// (never exposed to the browser) and to Resend, then serves it.
//
// Configuration:
//   SUPABASE_URL, SUPABASE_SECRET_KEYS, SUPABASE_PUBLISHABLE_KEYS  injected
//   REPORT_CRON_SECRET      shared with the cron jobs through Vault; 32+ characters
//   RESEND_API_KEY          already set for send-contact-email
//   REPORT_RECIPIENT_EMAIL  optional, falls back to CONTACT_RECIPIENT_EMAIL
//   REPORT_SENDER           optional, falls back to CONTACT_SENDER
//   REPORT_ADMIN_URL        optional link to the admin archive (https only)
//   ALLOWED_ORIGINS         optional, as for the other functions
// Deploy with gateway JWT verification off (supabase/config.toml).

import { createClient } from 'npm:@supabase/supabase-js@2.106.2';
import { acceptedPublicKeys, selectServiceKey } from '../send-contact-email/lib.ts';
import { type HandlerDeps, handleRequest, type Store } from './handler.ts';
import { parseDbInstant, type Window } from './period.ts';
import type { EventRow } from './rules.ts';

const env = Deno.env.toObject();
const serviceKey = selectServiceKey(env);
const publicKey = acceptedPublicKeys(env).values().next().value as string | undefined;
const db = serviceKey && env.SUPABASE_URL
  ? createClient(env.SUPABASE_URL, serviceKey.key, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const PAGE_SIZE = 1000;
const EVENT_COLUMNS = 'id, session_id, event_type, event_action, event_label, user_type, created_at, metadata';

/** Content tables checked for stale sections, with the names the report prints (as voyageData's EDITED_TABLES). */
const CONTENT_TABLES: Array<[string, string]> = [
  ['hero_content', 'Hero'],
  ['about_content', 'About'],
  ['projects', 'Projects'],
  ['internships', 'Internships'],
  ['education', 'Education'],
  ['work_experience', 'Work experience'],
  ['skills', 'Skills'],
  ['certifications', 'Certifications'],
  ['recommendations', 'Recommendations'],
  ['achievements', 'Achievements'],
  ['leadership', 'Leadership'],
];

/** created_at is `timestamp without time zone` holding UTC: send UTC without the zone suffix. */
const toDbInstant = (date: Date) => date.toISOString().replace('Z', '');

/** Supabase errors are rethrown as plain errors so the handler logs only the class. */
const must = <T>(result: { data: T; error: unknown }): T => {
  if (result.error) throw new Error('database');
  return result.data;
};

const store: Store | null = db
  ? {
    // Same rule as app_private.is_admin_identity(): an active admin_users row
    // whose address matches, compared without case.
    isAdminEmail: async (email) => {
      const rows = must(await db.from('admin_users').select('email').eq('is_active', true).not('email', 'is', null));
      return Array.isArray(rows) && rows.some((row) => String(row.email).toLowerCase() === email.toLowerCase());
    },
    findFullReport: async (quarter) =>
      must(
        await db.from('analytics_reports').select('id, email_status').eq('quarter', quarter).eq('partial', false)
          .maybeSingle(),
      ),
    fetchEvents: async (window: Window) => {
      const rows: EventRow[] = [];
      for (let from = 0;; from += PAGE_SIZE) {
        const page = must(
          await db.from('analytics_events').select(EVENT_COLUMNS).eq('user_type', 'visitor')
            .neq('event_type', 'section_visit').gte('created_at', toDbInstant(window.start))
            .lt('created_at', toDbInstant(window.end)).order('created_at', { ascending: true })
            .order('id', { ascending: true }).range(from, from + PAGE_SIZE - 1),
        ) as EventRow[] | null;
        if (!page?.length) break;
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
      return rows;
    },
    firstEventAt: async (action) => {
      const row = must(
        await db.from('analytics_events').select('created_at').eq('event_action', action).eq('user_type', 'visitor')
          .order('created_at', { ascending: true }).limit(1).maybeSingle(),
      );
      return parseDbInstant(row?.created_at);
    },
    listProjects: async () => {
      const rows = must(await db.from('projects').select('id, title, live_url').eq('status', 'active')) ?? [];
      return rows.map((row) => ({
        id: String(row.id),
        title: String(row.title ?? 'Untitled project'),
        hasDemo: typeof row.live_url === 'string' && row.live_url.trim().length > 0,
      }));
    },
    sectionEdits: () =>
      Promise.all(CONTENT_TABLES.map(async ([table, name]) => {
        const row = must(
          await db.from(table).select('updated_at').not('updated_at', 'is', null).order('updated_at', {
            ascending: false,
          })
            .limit(1).maybeSingle(),
        );
        return { name, updatedAt: parseDbInstant(row?.updated_at) };
      })),
    insertReport: async (row) => {
      const { data, error } = await db.from('analytics_reports').insert(row).select('id').single();
      if ((error as { code?: string } | null)?.code === '23505') return { duplicate: true };
      if (error) throw new Error('database');
      return { id: data.id as string };
    },
    setEmailStatus: async (id, status) => {
      must(await db.from('analytics_reports').update({ email_status: status }).eq('id', id));
    },
  }
  : null;

const deps: HandlerDeps = {
  env,
  store,
  getUser: async (token) => {
    if (!env.SUPABASE_URL) return null;
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: publicKey ?? '', Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const user = await response.json().catch(() => null);
    if (!user || typeof user.id !== 'string') return null;
    return {
      id: user.id,
      email: typeof user.email === 'string' ? user.email : null,
      isAnonymous: user.is_anonymous === true,
    };
  },
  sendEmail: async (message) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    const body = await response.json().catch(() => ({}));
    return response.ok && body?.id ? { id: body.id } : { error: `Resend responded ${response.status}` };
  },
};

Deno.serve((request) => handleRequest(request, deps));
