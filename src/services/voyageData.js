// src/services/voyageData.js
//
// Data for the voyage's mission control tiles, read through the signed-in
// session: visitors per day and top pages from analytics_events, the unread
// messages, and the latest change per content table. Every function returns
// a safe empty shape on failure; the tiles say "no data" rather than crash.

import { supabase } from './supabaseClient';
import { EDITED_TABLES } from './editedTables';
import { nyDate, parseDbInstant } from '../components/admin/Voyage/insightsTime';

const isoDaysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();
/**
 * The New York calendar day of an instant as "YYYY-MM-DD". Days are counted
 * in New York like the rest of the analytics, and one function names the day
 * for both the empty buckets and the rows, so a late-evening view can never
 * fall on a key the series does not hold.
 */
const dayKey = (ms) => { const d = nyDate(ms); return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`; };

/**
 * Page views per day for the last `days` days, oldest first, with the
 * distinct session count as "visitors". Days with no events are present as 0.
 * @returns {Promise<{days: Array<{date: string, views: number, visitors: number}>, totalViews: number, totalVisitors: number, previousVisitors: number}>}
 */
export async function getVisitorSeries(days = 30) {
  const empty = { days: [], totalViews: 0, totalVisitors: 0, previousVisitors: 0 };
  try {
    const { data, error } = await supabase
      .from('analytics_events')
      .select('created_at, session_id')
      .eq('event_type', 'page_view')
      .eq('user_type', 'visitor')
      .gte('created_at', isoDaysAgo(days * 2))
      .order('created_at', { ascending: true })
      .limit(20000);
    if (error || !Array.isArray(data)) return empty;
    return summarizeVisitorEvents(data, days, new Date());
  } catch {
    return empty;
  }
}

/** Pure: turns page-view rows into the daily series; exported for tests. */
export function summarizeVisitorEvents(rows, days, now) {
  const cutoff = now.getTime() - days * 86400000;
  const byDay = new Map();
  const current = new Set(), previous = new Set();
  for (let i = days - 1; i >= 0; i--) byDay.set(dayKey(now.getTime() - i * 86400000), { views: 0, sessions: new Set() });
  for (const row of rows) {
    // a stamp without a zone is UTC (parseDbInstant); Date would read it as local time
    const when = parseDbInstant(row.created_at);
    if (when === null) continue;
    if (when >= cutoff) {
      const bucket = byDay.get(dayKey(when));
      if (bucket) { bucket.views += 1; if (row.session_id) bucket.sessions.add(row.session_id); }
      if (row.session_id) current.add(row.session_id);
    } else if (row.session_id) previous.add(row.session_id);
  }
  const series = [...byDay.entries()].map(([date, b]) => ({ date, views: b.views, visitors: b.sessions.size }));
  return { days: series, totalViews: series.reduce((s, d) => s + d.views, 0), totalVisitors: current.size, previousVisitors: previous.size };
}

/**
 * Most viewed pages in the last `days` days.
 * @returns {Promise<Array<{page: string, views: number}>>}
 */
export async function getTopPages(days = 30, limit = 5) {
  try {
    const { data, error } = await supabase
      .from('analytics_events')
      .select('event_label')
      .eq('event_type', 'page_view')
      .eq('user_type', 'visitor')
      .gte('created_at', isoDaysAgo(days))
      .limit(20000);
    if (error || !Array.isArray(data)) return [];
    return rankPages(data, limit);
  } catch {
    return [];
  }
}

/** Pure: counts page labels and returns the top few. */
export function rankPages(rows, limit = 5) {
  const counts = new Map();
  for (const row of rows) { const page = normalizePage(row.event_label); if (page) counts.set(page, (counts.get(page) || 0) + 1); }
  return [...counts.entries()].map(([page, views]) => ({ page, views })).sort((a, b) => b.views - a.views).slice(0, limit);
}

/** "home", "/home", "Home Page" and the like become "/home". */
export function normalizePage(label) {
  if (!label) return null;
  const text = String(label).trim().toLowerCase().replace(/\s+page$/, '').replace(/\s+/g, '-');
  return text.startsWith('/') ? text : `/${text}`;
}

/**
 * Unread messages: the count and the newest three, only the fields a tile shows.
 * "Unread" means what the inbox chapter means (inboxModel: not read, and not
 * spam), so the tile and the inbox's Unread filter always show the same number.
 * @returns {Promise<{count: number, latest: Array<{id: string, name: string, subject: string, createdAt: string}>}>}
 */
export async function getUnreadMessages() {
  try {
    const { data, error, count } = await supabase
      .from('contact_messages')
      .select('id, name, subject, created_at', { count: 'exact' })
      .neq('status', 'read')
      .not('is_spam', 'is', true)
      .order('created_at', { ascending: false })
      .limit(3);
    if (error) return { count: 0, latest: [] };
    return { count: count ?? (data || []).length, latest: (data || []).map((m) => ({ id: m.id, name: m.name || 'Unknown sender', subject: m.subject || '(no subject)', createdAt: m.created_at })) };
  } catch {
    return { count: 0, latest: [] };
  }
}

/** Tables with an updated_at column that the "recent edits" tile reads (kept in editedTables.js so pure modules can import it). */
export { EDITED_TABLES };

/**
 * The most recently edited rows across the content tables.
 * @returns {Promise<Array<{section: string, label: string, at: string}>>}
 */
export async function getRecentEdits(limit = 6) {
  try {
    const results = await Promise.all(EDITED_TABLES.map(async ([table, section, labelField]) => {
      const { data, error } = await supabase.from(table).select(`id, ${labelField}, updated_at`).order('updated_at', { ascending: false }).limit(3);
      if (error || !Array.isArray(data)) return [];
      return data.filter((r) => r.updated_at).map((r) => ({ section, label: r[labelField] || section, at: r.updated_at }));
    }));
    return results.flat().sort((a, b) => (parseDbInstant(b.at) ?? 0) - (parseDbInstant(a.at) ?? 0)).slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * The newest `updated_at` of each content table, for the Analytics chapter's
 * stale-sections check (contract section 2). A table that fails to load is
 * left out rather than reported as stale; an empty table reports `at: null`.
 * @returns {Promise<Array<{section: string, at: string|null}>>}
 */
export async function getSectionFreshness() {
  try {
    const results = await Promise.all(EDITED_TABLES.map(async ([table, section]) => {
      const { data, error } = await supabase.from(table).select('updated_at').order('updated_at', { ascending: false, nullsFirst: false }).limit(1);
      if (error || !Array.isArray(data)) return null;
      return { section, at: data[0]?.updated_at || null };
    }));
    return results.filter(Boolean);
  } catch {
    return [];
  }
}

/** Short relative time for tiles: "2 h ago", "3 d ago". */
export function relativeTime(iso, now = new Date()) {
  const at = parseDbInstant(iso);   // zone-less database stamps are UTC
  if (at === null) return 'just now';
  const ms = now.getTime() - at;
  if (ms < 0) return 'just now';
  const m = Math.round(ms / 60000), h = Math.round(ms / 3600000), d = Math.round(ms / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (h < 24) return `${h} h ago`;
  if (d < 30) return `${d} d ago`;
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
