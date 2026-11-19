// src/services/insightsService.js
//
// Reads for the voyage's Analytics chapter, through the signed-in session.
// Raw rows only: every count and sentence is computed by the pure model in
// components/admin/Voyage/insightsModel.js, so the numbers can be tested from
// hand-made rows and match the quarterly report (contract section 2).
//
// analytics_events is read with an explicit, narrow column list (the three
// metadata fields the model needs are lifted out by PostgREST JSON paths, so
// no other metadata leaves the database) and in pages, because a 12-month
// range with its comparison can cover far more rows than one response holds.

import { getAdminSupabaseClient, describeAdminWriteError } from './adminDataService';
import { getSectionFreshness } from './voyageData';

/** The columns the model reads; metadata paths are aliased to flat names. */
export const EVENT_COLUMNS = 'id, created_at, session_id, user_type, event_type, event_action, event_label, visitor:metadata->visitor_info, kind:metadata->>kind, section:metadata->>section_type';
export const PROJECT_COLUMNS = 'id, title, featured, live_url, github_urls';
export const PAGE_SIZE = 1000;
/** A safety stop: 60 pages is 60,000 rows, several times the table today. */
export const MAX_PAGES = 60;

/**
 * Wraps a Supabase error so `failureKind` (voyageRecords) reads it as a
 * session, permission, network or unknown failure. The message is fixed:
 * server text is kept on `cause` for debugging, never shown.
 */
export function insightsError(error, message = 'The numbers could not be loaded.') {
  const described = describeAdminWriteError(error);
  const typed = new Error(message);
  typed.code = described.code === 'WRITE_FAILED' ? 'READ_FAILED' : described.code;
  typed.cause = error;
  return typed;
}

/**
 * Visitor events in [from, to), oldest first, every page.
 * Admin activity and the old section_visit rows are left out on the server.
 * @param {number} from ms
 * @param {number} to ms
 * @returns {Promise<{rows: object[], truncated: boolean}>}
 */
export async function fetchEvents(from, to) {
  const client = getAdminSupabaseClient();
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const start = page * PAGE_SIZE;
    const { data, error } = await client
      .from('analytics_events')
      .select(EVENT_COLUMNS)
      .eq('user_type', 'visitor')
      .neq('event_type', 'section_visit')
      .gte('created_at', new Date(from).toISOString())
      .lt('created_at', new Date(to).toISOString())
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw insightsError(error);
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/**
 * When a kind of event was first stored: the day engagement tracking or
 * project tracking went live (contract section 2). Null when none exists yet.
 * @returns {Promise<number|null>} ms
 */
export async function firstEventAt(eventAction) {
  const { data, error } = await getAdminSupabaseClient()
    .from('analytics_events')
    .select('created_at')
    .eq('user_type', 'visitor')
    .eq('event_action', eventAction)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw insightsError(error);
  const at = Array.isArray(data) && data[0] ? Date.parse(data[0].created_at) : NaN;
  return Number.isFinite(at) ? at : null;
}

/** Active projects, for titles, stars and which ones have a demo. */
export async function fetchActiveProjects() {
  const { data, error } = await getAdminSupabaseClient().from('projects').select(PROJECT_COLUMNS).eq('status', 'active');
  if (error) throw insightsError(error);
  return Array.isArray(data) ? data : [];
}

/**
 * Everything the chapter needs for one range: the events of both windows (one
 * paged read across them, then split at the boundary), active projects, the
 * first engaged and first project_open instants, and the content freshness.
 *
 * @param {{current: {from: number, to: number}, before: {from: number, to: number}}} windows from insightsTime.windowsFor
 * @returns {Promise<{current: object[], before: object[], projects: object[], firstEngaged: number|null, firstProjectOpen: number|null, freshness: object[], truncated: boolean}>}
 */
export async function loadInsights(windows) {
  const [events, projects, firstEngaged, firstProjectOpen, freshness] = await Promise.all([
    fetchEvents(windows.before.from, windows.current.to),
    fetchActiveProjects(),
    firstEventAt('engaged'),
    firstEventAt('project_open'),
    getSectionFreshness(),
  ]);
  const boundary = windows.current.from;
  const current = [], before = [];
  for (const row of events.rows) {
    const at = Date.parse(row.created_at);
    if (!Number.isFinite(at)) continue;
    (at >= boundary ? current : before).push(row);
  }
  return { current, before, projects, firstEngaged, firstProjectOpen, freshness, truncated: events.truncated };
}
