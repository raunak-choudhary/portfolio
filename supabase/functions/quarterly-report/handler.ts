// supabase/functions/quarterly-report/handler.ts
//
// The quarterly analytics report. Two ways in, both POST:
//
//   Scheduled  header x-report-secret equal to REPORT_CRON_SECRET (compared
//              in constant time). pg_cron calls at 13:00 and 14:00 UTC on
//              1 Jan, Apr, Jul and Oct; only the call that is 9 AM in New
//              York runs. Reports the previous full quarter once: a stored
//              full report for that quarter ends the run.
//   Manual     the admin's bearer token ("Generate now"). Auth must accept
//              the token, its assurance level must be aal2 and its address
//              must be on the admin list. Reports the current quarter so far
//              (partial = true).
//
// Each run reads the events with the service role, builds the summary and
// the text by fixed rules (rules.ts, summary.ts, report.ts), stores the row
// in analytics_reports, then emails it through Resend and records the
// delivery status. Responses carry { id, quarter, partial, email_status };
// errors are fixed short sentences with a code, never server text.
//
// Network and database calls are injected (HandlerDeps) so every path is
// unit tested; index.ts wires the real ones.

import { allowedOriginsFrom, corsHeadersFor, isAllowedOrigin } from '../send-contact-email/lib.ts';
import { DEFAULT_RECIPIENT } from '../send-contact-email/handler.ts';
import { readClaims } from '../admin-passkey/lib.ts';
import { isScheduledMoment, manualPeriod, type ReportPeriod, scheduledPeriod, type Window } from './period.ts';
import type { EventRow, ProjectRef, SectionEdit } from './rules.ts';
import { buildSummary, type ReportSummary } from './summary.ts';
import { buildReport, DEFAULT_ADMIN_URL } from './report.ts';

export const MAX_BODY_BYTES = 4 * 1024;
export const DEFAULT_SENDER = 'Portfolio Reports <onboarding@resend.dev>';

export type EmailStatus = 'sent' | 'failed' | 'skipped';

export interface AuthUser {
  id: string;
  email: string | null;
  isAnonymous: boolean;
}

export interface ReportRow {
  period_label: string;
  quarter: string;
  period_start: string;
  period_end: string;
  partial: boolean;
  trigger: 'schedule' | 'manual';
  summary: ReportSummary;
  body_html: string;
  body_text: string;
  email_status: EmailStatus;
}

export interface Store {
  isAdminEmail(email: string): Promise<boolean>;
  /** The stored full (not partial) report of a quarter, if any. */
  findFullReport(quarter: string): Promise<{ id: string; email_status: EmailStatus } | null>;
  /** Visitor events in [start, end), every page of them. */
  fetchEvents(window: Window): Promise<EventRow[]>;
  /** created_at of the first visitor event with this action, or null. */
  firstEventAt(action: string): Promise<Date | null>;
  /** Active projects. */
  listProjects(): Promise<ProjectRef[]>;
  /** Newest updated_at of each content table. */
  sectionEdits(): Promise<SectionEdit[]>;
  /** Inserts the row; `duplicate` when the full quarter already exists (unique index). */
  insertReport(row: ReportRow): Promise<{ id: string } | { duplicate: true }>;
  setEmailStatus(id: string, status: EmailStatus): Promise<void>;
}

export interface EmailMessage {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
}

export interface HandlerDeps {
  env: Record<string, string | undefined>;
  /** Asks Auth who owns the token (GET /auth/v1/user); null when Auth refuses it. */
  getUser: (token: string) => Promise<AuthUser | null>;
  store: Store | null;
  sendEmail: (message: EmailMessage) => Promise<{ id: string } | { error: string }>;
  now?: () => Date;
  log?: (message: string) => void;
}

/** Fixed sentences: the only error text a caller ever sees. */
export const MESSAGES = {
  forbidden: 'Not allowed.',
  unauthorized: 'Sign in again to make a report.',
  needsAal2: 'Finish the second sign-in step first.',
  badRequest: 'Bad request.',
  notConfigured: 'The report is not set up yet.',
  server: 'The report could not be made. Try again later.',
} as const;

class Refusal extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}
const refuse = (status: number, code: string, message: string) => new Refusal(status, code, message);

/** Compares two secrets in time independent of where they differ (and of their lengths). */
export async function secretsMatch(given: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(given)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < x.length; i += 1) difference |= x[i] ^ y[i];
  return difference === 0;
}

/** Shortest cron secret accepted; a shorter configured value counts as not configured. */
export const MIN_SECRET_LENGTH = 32;

export async function handleRequest(request: Request, deps: HandlerDeps): Promise<Response> {
  // The cron call has no Origin; a browser call must come from an allowed one.
  const origin = request.headers.get('origin');
  const originAllowed = origin === null || isAllowedOrigin(origin, allowedOriginsFrom(deps.env.ALLOWED_ORIGINS));
  const cors = origin && originAllowed
    ? corsHeadersFor(origin, request.headers.get('access-control-request-headers'))
    : {};
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
  const log = deps.log ?? ((message: string) => console.error(message));

  if (request.method === 'OPTIONS') return new Response(null, { status: originAllowed ? 204 : 403, headers: cors });
  if (!originAllowed) return reply(403, { success: false, code: 'origin_not_allowed', error: MESSAGES.forbidden });
  if (request.method !== 'POST') {
    return reply(405, { success: false, code: 'method_not_allowed', error: MESSAGES.badRequest });
  }

  let trigger: 'schedule' | 'manual' = 'manual';
  try {
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
      throw refuse(413, 'too_large', MESSAGES.badRequest);
    }
    // The body carries nothing the report needs; it is read only to bound it.
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw refuse(413, 'too_large', MESSAGES.badRequest);

    const now = (deps.now ?? (() => new Date()))();
    const secretHeader = request.headers.get('x-report-secret');
    let period: ReportPeriod;

    if (secretHeader !== null) {
      trigger = 'schedule';
      const expected = deps.env.REPORT_CRON_SECRET ?? '';
      if (expected.length < MIN_SECRET_LENGTH) throw refuse(503, 'not_configured', MESSAGES.notConfigured);
      if (!(await secretsMatch(secretHeader, expected))) throw refuse(401, 'unauthorized', MESSAGES.forbidden);
      if (!deps.store) throw refuse(503, 'not_configured', MESSAGES.notConfigured);
      // Two cron calls per quarter day; exactly one is 9 AM in New York.
      if (!isScheduledMoment(now)) return reply(200, { success: true, data: { status: 'not_due' } });
      period = scheduledPeriod(now);
      const existing = await deps.store.findFullReport(period.code);
      if (existing) return reply(200, { success: true, data: existingResult(existing, period) });
    } else {
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
      const claims = token ? readClaims(token) : null;
      if (!claims) throw refuse(401, 'unauthorized', MESSAGES.unauthorized);
      if (!deps.store) throw refuse(503, 'not_configured', MESSAGES.notConfigured);
      // Auth checks signature, expiry and session first; only then are the
      // token's claims trusted.
      const user = await deps.getUser(token);
      if (!user || claims.sub !== user.id) throw refuse(401, 'unauthorized', MESSAGES.unauthorized);
      if (user.isAnonymous || !user.email || !(await deps.store.isAdminEmail(user.email))) {
        throw refuse(403, 'forbidden', MESSAGES.forbidden);
      }
      if (claims.aal !== 'aal2') throw refuse(403, 'insufficient_aal', MESSAGES.needsAal2);
      period = manualPeriod(now);
    }

    const result = await generate(period, trigger, now, deps);
    return reply(200, { success: true, data: result });
  } catch (thrown) {
    if (thrown instanceof Refusal) {
      if (thrown.status >= 500) log(`quarterly-report: ${trigger} refused with ${thrown.code}`);
      return reply(thrown.status, { success: false, code: thrown.code, error: thrown.message });
    }
    // Only the class reaches the log; messages may quote data.
    log(`quarterly-report: ${trigger} failed (${thrown instanceof Error ? thrown.name : typeof thrown})`);
    return reply(500, { success: false, code: 'server_error', error: MESSAGES.server });
  }
}

const existingResult = (existing: { id: string; email_status: EmailStatus }, period: ReportPeriod) => ({
  id: existing.id,
  quarter: period.code,
  partial: false,
  email_status: existing.email_status,
  existing: true,
});

/** Reads, summarises, renders, stores, then sends. */
async function generate(period: ReportPeriod, trigger: 'schedule' | 'manual', now: Date, deps: HandlerDeps) {
  const store = deps.store as Store;
  const [current, previous, lastYear, engagementStart, projectTrackingStart, projects, edits] = await Promise.all([
    store.fetchEvents(period.current),
    store.fetchEvents(period.previous.window),
    store.fetchEvents(period.lastYear.window),
    store.firstEventAt('engaged'),
    store.firstEventAt('project_open'),
    store.listProjects(),
    store.sectionEdits(),
  ]);

  const summary = buildSummary({
    period,
    generatedAt: now,
    events: { current, previous, lastYear },
    projects,
    engagementStart,
    projectTrackingStart,
    edits,
  });
  const built = buildReport(summary, { adminUrl: deps.env.REPORT_ADMIN_URL || DEFAULT_ADMIN_URL });

  const canSend = Boolean(deps.env.RESEND_API_KEY);
  // Stored first, so a quarter is claimed before any email leaves. Until the
  // send finishes the row says "failed"; a crash mid-send leaves that truth.
  const inserted = await store.insertReport({
    period_label: period.label,
    quarter: period.code,
    period_start: period.periodStart,
    period_end: period.periodEnd,
    partial: period.partial,
    trigger,
    summary,
    body_html: built.html,
    body_text: built.text,
    email_status: canSend ? 'failed' : 'skipped',
  });
  if ('duplicate' in inserted) {
    // A concurrent scheduled run stored this quarter first.
    const existing = await store.findFullReport(period.code);
    if (!existing) throw new Error('duplicate without row');
    return existingResult(existing, period);
  }

  let emailStatus: EmailStatus = 'skipped';
  if (canSend) {
    const delivery = await deps.sendEmail({
      from: deps.env.REPORT_SENDER || deps.env.CONTACT_SENDER || DEFAULT_SENDER,
      to: [deps.env.REPORT_RECIPIENT_EMAIL || deps.env.CONTACT_RECIPIENT_EMAIL || DEFAULT_RECIPIENT],
      subject: built.subject,
      html: built.html,
      text: built.text,
    });
    emailStatus = 'id' in delivery ? 'sent' : 'failed';
    const log = deps.log ?? ((message: string) => console.error(message));
    if (emailStatus === 'failed') log('quarterly-report: email delivery failed');
    try {
      await store.setEmailStatus(inserted.id, emailStatus);
    } catch {
      // The email went (or failed) either way; the caller still learns which.
      log('quarterly-report: could not record the email status');
    }
  }

  return { id: inserted.id, quarter: period.code, partial: period.partial, email_status: emailStatus };
}
