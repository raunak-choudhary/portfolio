// src/services/voyageData.js
//
// Data for the voyage's mission control tiles, read through the signed-in
// session: visitors per day and top pages from analytics_events, the unread
// messages, and the latest change per content table. Every function returns
// a safe empty shape on failure; the tiles say "no data" rather than crash.

import { supabase } from './supabaseClient';

const isoDaysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();
const dayKey = (iso) => String(iso).slice(0, 10);

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
  const cutoff = new Date(now.getTime() - days * 86400000);
  const byDay = new Map();
  const current = new Set(), previous = new Set();
  for (let i = days - 1; i >= 0; i--) byDay.set(dayKey(new Date(now.getTime() - i * 86400000).toISOString()), { views: 0, sessions: new Set() });
  for (const row of rows) {
    const when = new Date(row.created_at);
    if (Number.isNaN(when.getTime())) continue;
    if (when >= cutoff) {
      const bucket = byDay.get(dayKey(when.toISOString()));
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
 * @returns {Promise<{count: number, latest: Array<{id: string, name: string, subject: string, createdAt: string}>}>}
 */
export async function getUnreadMessages() {
  try {
    const { data, error, count } = await supabase
      .from('contact_messages')
      .select('id, name, subject, created_at', { count: 'exact' })
      .eq('status', 'unread')
      .order('created_at', { ascending: false })
      .limit(3);
    if (error) return { count: 0, latest: [] };
    return { count: count ?? (data || []).length, latest: (data || []).map((m) => ({ id: m.id, name: m.name || 'Unknown sender', subject: m.subject || '(no subject)', createdAt: m.created_at })) };
  } catch {
    return { count: 0, latest: [] };
  }
}

/** Tables with an updated_at column that the "recent edits" tile reads. */
export const EDITED_TABLES = Object.freeze([
  ['hero_content', 'Hero', 'title'], ['about_content', 'About', 'about_me_title'], ['projects', 'Projects', 'title'], ['internships', 'Internships', 'company'],
  ['education', 'Education', 'institution'], ['work_experience', 'Work', 'company'], ['skills', 'Skills', 'skill_name'], ['certifications', 'Certifications', 'title'],
  ['recommendations', 'Recommendations', 'recommender_name'], ['achievements', 'Achievements', 'title'], ['leadership', 'Leadership', 'title'],
]);

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
    return results.flat().sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, limit);
  } catch {
    return [];
  }
}

/** Short relative time for tiles: "2 h ago", "3 d ago". */
export function relativeTime(iso, now = new Date()) {
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const m = Math.round(ms / 60000), h = Math.round(ms / 3600000), d = Math.round(ms / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (h < 24) return `${h} h ago`;
  if (d < 30) return `${d} d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
