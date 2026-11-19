// supabase/functions/quarterly-report/rules.ts
//
// The analytics definitions of the V4b contract (section 2), implemented as
// pure functions over analytics_events rows. The admin Analytics chapter
// computes the same numbers in JavaScript; the shared fixture in
// ./fixtures/ pins both to identical results.
//
// A visit is one distinct session_id. For each visit four nested flags are
// derived (visit > deeper > work > reached), plus its source, its device and
// whether it was a quick leave. Every count below is built from those flags
// or from single events (channels, project links), never from a sample.

import { parseDbInstant } from './period.ts';

/** One analytics_events row, as selected by the function. */
export interface EventRow {
  session_id: string | null;
  event_type: string | null;
  event_action: string | null;
  event_label: string | null;
  created_at: string;
  user_type?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** An active row of the projects table. */
export interface ProjectRef {
  id: string;
  title: string;
  hasDemo: boolean;
}

export type SourceName = 'LinkedIn' | 'Google' | 'GitHub' | 'Direct or unknown' | 'Other sites';
export type DeviceKey = 'desktop' | 'phone' | 'tablet' | 'unknown';
export type ChannelKey = 'linkedin' | 'email' | 'contact_form' | 'resume';

export const SOURCE_NAMES: SourceName[] = ['LinkedIn', 'Google', 'GitHub', 'Direct or unknown', 'Other sites'];

export const DEVICE_NAMES: Record<DeviceKey, string> = {
  desktop: 'Laptop or desktop',
  phone: 'Phone',
  tablet: 'Tablet',
  unknown: 'Unknown device',
};

export const CHANNEL_NAMES: Record<ChannelKey, string> = {
  linkedin: 'LinkedIn profile',
  email: 'Email link',
  contact_form: 'Contact form',
  resume: 'Resume download',
};
const CHANNEL_ORDER: ChannelKey[] = ['linkedin', 'email', 'contact_form', 'resume'];

/** Home page sections in page order, with the names shown on screen. */
export const HOME_SECTIONS: Array<{ key: string; name: string }> = [
  { key: 'hero', name: 'Hero' },
  { key: 'about', name: 'About' },
  { key: 'navigation', name: 'Explore' },
  { key: 'contact', name: 'Contact' },
];

/** Pages and sections that count as looking at the owner's work. */
const WORK_PLACES = new Set(['projects', 'work-experience', 'internships']);

/** Sections that do not count as going deeper on their own. */
const SHALLOW_SECTIONS = new Set(['hero', 'navigation']);

/** Suffixes the 2025 tracker appended to page names. */
const PAGE_SUFFIXES = ['-no-storage', '-disabled', '-enabled', '-dedup'];

/** The site's own hosts: a referrer from these says nothing about where a visit came from. */
const OWN_HOSTS = new Set(['raunakchoudhary.com', 'www.raunakchoudhary.com', 'localhost', '127.0.0.1']);

// ---------------------------------------------------------------------------
// Single-row readers

/** "home-no-storage", "/Home", " projects " become "home", "home", "projects". */
export function foldPage(label: unknown): string | null {
  if (typeof label !== 'string') return null;
  let page = label.trim().toLowerCase().replace(/^\/+/, '').replace(/\s+/g, '-');
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of PAGE_SUFFIXES) {
      if (page.endsWith(suffix)) {
        page = page.slice(0, -suffix.length);
        changed = true;
      }
    }
  }
  return page || null;
}

/** Section of a section_view row: metadata.section_type, else the action without "view_". */
export function sectionOf(row: EventRow): string | null {
  const fromMeta = row.metadata?.section_type;
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim().toLowerCase();
  const action = row.event_action ?? '';
  return action.startsWith('view_') ? action.slice(5).toLowerCase() || null : null;
}

/** Bare lower-case host of a stored referrer ("www.google.com" or "https://www.google.com/"). */
export function referrerHost(referrer: unknown): string {
  if (typeof referrer !== 'string') return '';
  const text = referrer.trim().toLowerCase();
  if (!text) return '';
  if (text.includes('://')) {
    try {
      return new URL(text).hostname;
    } catch {
      return '';
    }
  }
  return text.split('/')[0];
}

/** Source group of a referrer, per contract section 2 (own site counts as unknown). */
export function sourceOf(referrer: unknown): SourceName {
  const host = referrerHost(referrer);
  if (!host || host === 'direct' || OWN_HOSTS.has(host)) return 'Direct or unknown';
  if (host.includes('linkedin.') || host === 'lnkd.in' || host === 'com.linkedin.android') return 'LinkedIn';
  if (/(^|\.)google\./.test(host)) return 'Google';
  if (host === 'github.com' || host.endsWith('.github.com')) return 'GitHub';
  return 'Other sites';
}

/** Device class of a visitor_info object; old rows carry a screen width instead. */
export function deviceOf(visitorInfo: unknown): DeviceKey {
  if (!visitorInfo || typeof visitorInfo !== 'object') return 'unknown';
  const info = visitorInfo as Record<string, unknown>;
  if (info.deviceClass === 'desktop' || info.deviceClass === 'phone' || info.deviceClass === 'tablet') {
    return info.deviceClass;
  }
  const width = Number(info.screenWidth);
  if (!Number.isFinite(width) || width <= 0) return 'unknown';
  if (width < 768) return 'phone';
  if (width < 1280) return 'tablet';
  return 'desktop';
}

/** Kind of reach-out an event records, new-style or legacy. */
export function reachChannel(row: EventRow): { channel: ChannelKey; legacy: boolean } | null {
  const label = (row.event_label ?? '').toLowerCase();
  if (row.event_action === 'reach_out') {
    return (CHANNEL_ORDER as string[]).includes(label) ? { channel: label as ChannelKey, legacy: false } : null;
  }
  if (row.event_type === 'form_submission') return { channel: 'contact_form', legacy: true };
  if (row.event_action === 'click_social_media' && label === 'linkedin') return { channel: 'linkedin', legacy: true };
  if (row.event_action === 'click_contact_email') return { channel: 'email', legacy: true };
  return null;
}

/** Rows the definitions ignore: admin activity and the old admin section_visit events. */
export const countsAsVisitorEvent = (row: EventRow) =>
  Boolean(row.session_id) && row.event_type !== 'section_visit' &&
  (row.user_type === undefined || row.user_type === null || row.user_type === 'visitor');

// ---------------------------------------------------------------------------
// Sessions

export interface Visit {
  id: string;
  start: Date;
  source: SourceName;
  device: DeviceKey;
  reached: boolean;
  work: boolean;
  deeper: boolean;
  engaged: boolean;
  homeView: boolean;
  homeSections: Set<string>;
  /** Reach-out events kept for channel counts (legacy rows deduplicated). */
  channels: ChannelKey[];
  opened: Set<string>;
  links: Array<{ project: string; kind: 'repo' | 'demo' }>;
}

/** Groups rows into visits and derives every per-visit flag. */
export function buildVisits(rows: EventRow[]): Visit[] {
  const bySession = new Map<string, Array<{ row: EventRow; at: Date }>>();
  for (const row of rows) {
    if (!countsAsVisitorEvent(row)) continue;
    const at = parseDbInstant(row.created_at);
    if (!at) continue;
    const list = bySession.get(row.session_id as string) ?? [];
    list.push({ row, at });
    bySession.set(row.session_id as string, list);
  }

  const visits: Visit[] = [];
  for (const [id, list] of bySession) {
    list.sort((a, b) => a.at.getTime() - b.at.getTime());
    // Source and device come from the earliest event that carries
    // visitor_info. Old section_view rows carry none and may precede the
    // page_view of the same visit by a few milliseconds.
    const info = list.find(({ row }) => row.metadata && typeof row.metadata.visitor_info === 'object')?.row.metadata
      ?.visitor_info as Record<string, unknown> | undefined;

    const pages = new Set<string>();
    const homeSections = new Set<string>();
    const opened = new Set<string>();
    const links: Visit['links'] = [];
    const newChannels: ChannelKey[] = [];
    const legacyChannels: ChannelKey[] = [];
    let work = false;
    let deeperSection = false;
    let engaged = false;

    for (const { row } of list) {
      const reach = reachChannel(row);
      if (reach) (reach.legacy ? legacyChannels : newChannels).push(reach.channel);

      if (row.event_type === 'page_view') {
        const page = foldPage(row.event_label);
        if (page) {
          pages.add(page);
          if (WORK_PLACES.has(page)) work = true;
        }
      } else if (row.event_type === 'section_view') {
        const section = sectionOf(row);
        if (section) {
          homeSections.add(section);
          if (WORK_PLACES.has(section)) work = true;
          if (!SHALLOW_SECTIONS.has(section)) deeperSection = true;
        }
      }

      if (row.event_action === 'project_open' && row.event_label) {
        work = true;
        opened.add(row.event_label);
      } else if (row.event_action === 'project_link' && row.event_label) {
        work = true;
        const kind = row.metadata?.kind;
        if (kind === 'repo' || kind === 'demo') links.push({ project: row.event_label, kind });
      } else if (row.event_action === 'click_social_media' && (row.event_label ?? '').toLowerCase() === 'github') {
        work = true;
      } else if (row.event_action === 'engaged') {
        engaged = true;
      }
    }

    // Once the new tracker sends reach_out for a channel, an old-style row of
    // the same channel in the same visit describes the same action: drop it.
    const seen = new Set(newChannels);
    const channels = [...newChannels, ...legacyChannels.filter((channel) => !seen.has(channel))];

    const reached = channels.length > 0;
    work = work || reached;
    visits.push({
      id,
      start: list[0].at,
      source: sourceOf(info?.referrer),
      device: deviceOf(info),
      reached,
      work,
      deeper: work || pages.size >= 2 || deeperSection,
      engaged,
      homeView: pages.has('home'),
      homeSections,
      channels,
      opened,
      links,
    });
  }
  return visits.sort((a, b) => a.start.getTime() - b.start.getTime() || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Window summary

export interface SourceRow {
  name: SourceName;
  visits: number;
  reached: number;
}

export interface DeviceRow {
  key: DeviceKey;
  name: string;
  visits: number;
  /** Share of all visits (0 to 1), null when there were none. */
  share: number | null;
  /** Visits in the quick-leave measurement span. */
  measured: number;
  quickLeaves: number;
  /** quickLeaves / measured, null when nothing was measured. */
  quick: number | null;
}

export interface ProjectRow {
  id: string;
  title: string;
  hasDemo: boolean;
  opens: number;
  repo: number;
  demo: number;
}

export interface WindowSummary {
  visits: number;
  deeper: number;
  work: number;
  reached: number;
  /** All five groups, ordered by reach-outs, then visits, then the fixed group order. */
  sources: SourceRow[];
  /** Laptop, phone, tablet always; unknown only when present. */
  devices: DeviceRow[];
  quickLeave: { measured: number; quickLeaves: number; rate: number | null };
  /** Reach-out events by way in (per event, not per visit). */
  channels: Array<{ key: ChannelKey; name: string; count: number }>;
  homeReach: {
    homeVisits: number;
    sections: Array<{ key: string; name: string; visits: number; share: number | null }>;
  };
  /** Active projects, most opened first, then by title. */
  projects: ProjectRow[];
}

export interface SummaryOptions {
  /** Active projects (id, title, whether a demo link exists). */
  projects: ProjectRef[];
  /** created_at of the first `engaged` row ever stored; null when none exists. */
  engagementStart: Date | null;
}

const share = (part: number, whole: number) => (whole > 0 ? part / whole : null);

export function summarizeWindow(rows: EventRow[], options: SummaryOptions): WindowSummary {
  const visits = buildVisits(rows);

  const sources = SOURCE_NAMES.map((name) => {
    const group = visits.filter((visit) => visit.source === name);
    return { name, visits: group.length, reached: group.filter((visit) => visit.reached).length };
  }).sort((a, b) =>
    b.reached - a.reached || b.visits - a.visits || SOURCE_NAMES.indexOf(a.name) - SOURCE_NAMES.indexOf(b.name)
  );

  // Quick leaves only exist from the day engagement tracking went live.
  const start = options.engagementStart?.getTime();
  const measuredVisits = start === undefined ? [] : visits.filter((visit) => visit.start.getTime() >= start);
  const isQuick = (visit: Visit) => !visit.deeper && !visit.engaged;

  const deviceKeys: DeviceKey[] = ['desktop', 'phone', 'tablet'];
  if (visits.some((visit) => visit.device === 'unknown')) deviceKeys.push('unknown');
  const devices = deviceKeys.map((key) => {
    const group = visits.filter((visit) => visit.device === key);
    const measured = measuredVisits.filter((visit) => visit.device === key);
    const quickLeaves = measured.filter(isQuick).length;
    return {
      key,
      name: DEVICE_NAMES[key],
      visits: group.length,
      share: share(group.length, visits.length),
      measured: measured.length,
      quickLeaves,
      quick: share(quickLeaves, measured.length),
    };
  });
  const quickTotal = measuredVisits.filter(isQuick).length;

  const channelCounts = new Map<ChannelKey, number>();
  for (const visit of visits) {
    for (const channel of visit.channels) channelCounts.set(channel, (channelCounts.get(channel) ?? 0) + 1);
  }

  const homeVisits = visits.filter((visit) => visit.homeView);
  const homeReach = {
    homeVisits: homeVisits.length,
    sections: HOME_SECTIONS.map(({ key, name }) => {
      const count = homeVisits.filter((visit) => visit.homeSections.has(key)).length;
      return { key, name, visits: count, share: share(count, homeVisits.length) };
    }),
  };

  const projects = options.projects.map((project) => {
    let opens = 0;
    let repo = 0;
    let demo = 0;
    for (const visit of visits) {
      if (visit.opened.has(project.id)) opens += 1;
      for (const link of visit.links) {
        if (link.project !== project.id) continue;
        if (link.kind === 'repo') repo += 1;
        else demo += 1;
      }
    }
    return { id: project.id, title: project.title, hasDemo: project.hasDemo, opens, repo, demo };
  }).sort((a, b) => b.opens - a.opens || a.title.localeCompare(b.title));

  return {
    visits: visits.length,
    deeper: visits.filter((visit) => visit.deeper).length,
    work: visits.filter((visit) => visit.work).length,
    reached: visits.filter((visit) => visit.reached).length,
    sources,
    devices,
    quickLeave: {
      measured: measuredVisits.length,
      quickLeaves: quickTotal,
      rate: share(quickTotal, measuredVisits.length),
    },
    channels: CHANNEL_ORDER.map((key) => ({ key, name: CHANNEL_NAMES[key], count: channelCounts.get(key) ?? 0 })),
    homeReach,
    projects,
  };
}

// ---------------------------------------------------------------------------
// Stale sections

export interface SectionEdit {
  name: string;
  /** Newest updated_at of the section's table; null when the table is empty. */
  updatedAt: Date | null;
}

export const STALE_AFTER_DAYS = 90;

/**
 * Sections whose newest edit is more than 90 days before `asOf`, oldest
 * first, and how many are current. An empty table has nothing to go stale
 * and is left out of both.
 */
export function staleSections(
  edits: SectionEdit[],
  asOf: Date,
): { stale: Array<{ name: string; days: number }>; fresh: number } {
  const dated = edits.filter((edit) => edit.updatedAt) as Array<{ name: string; updatedAt: Date }>;
  const aged = dated.map((edit) => ({
    name: edit.name,
    days: Math.floor((asOf.getTime() - edit.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
  }));
  const stale = aged.filter((edit) => edit.days > STALE_AFTER_DAYS).sort((a, b) =>
    b.days - a.days || a.name.localeCompare(b.name)
  );
  return { stale, fresh: aged.length - stale.length };
}

/** Pace for a partial quarter: round(count * quarterLength / dayN). */
export const pace = (count: number, quarterLength: number, dayN: number) =>
  dayN > 0 ? Math.round((count * quarterLength) / dayN) : 0;
