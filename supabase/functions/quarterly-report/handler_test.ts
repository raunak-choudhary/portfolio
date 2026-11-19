import { assert, assertEquals, assertFalse, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  type AuthUser,
  type EmailMessage,
  type EmailStatus,
  type HandlerDeps,
  handleRequest,
  MESSAGES,
  type ReportRow,
  secretsMatch,
  type Store,
} from './handler.ts';
import type { EventRow } from './rules.ts';
import fixtureJson from './fixtures/events.json' with { type: 'json' };

const fixture = fixtureJson as unknown as { events: EventRow[] };
const SECRET = 'a'.repeat(24) + 'cron-secret-for-tests';
const ORIGIN = 'https://www.raunakchoudhary.com';
const SCHEDULED = new Date('2026-10-01T13:00:00Z'); // 9 AM New York
const NOT_DUE = new Date('2026-10-01T14:00:00Z'); // 10 AM New York
const MID_QUARTER = new Date('2026-11-19T20:12:00Z');
const ADMIN = { id: 'user-1', email: 'Owner@Example.com', isAnonymous: false };

/** JWT-shaped token built at run time (no signature check happens in the handler). */
function token(claims: Record<string, unknown>): string {
  const part = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(claims)}.${'s'.repeat(43)}`;
}

function makeDeps(options: {
  now?: Date;
  user?: AuthUser | null;
  existing?: { id: string; email_status: EmailStatus } | null;
  duplicateInsert?: boolean;
  email?: 'ok' | 'fail';
  env?: Record<string, string | undefined>;
  failEvents?: boolean;
  store?: boolean;
} = {}) {
  const inserted: ReportRow[] = [];
  const statuses: Array<[string, EmailStatus]> = [];
  const sent: EmailMessage[] = [];
  const logs: string[] = [];
  const windows: string[] = [];
  const store: Store = {
    isAdminEmail: (email) => Promise.resolve(email.toLowerCase() === 'owner@example.com'),
    findFullReport: () => Promise.resolve(options.existing ?? null),
    fetchEvents: (window) => {
      if (options.failEvents) return Promise.reject(new Error('relation "secret_table" does not exist'));
      windows.push(`${window.start.toISOString()}/${window.end.toISOString()}`);
      return Promise.resolve(windows.length === 1 ? fixture.events : []);
    },
    firstEventAt: (action) => Promise.resolve(action === 'engaged' ? new Date('2026-08-01T04:00:00Z') : null),
    listProjects: () => Promise.resolve([{ id: 'p1', title: 'Alpha', hasDemo: true }]),
    sectionEdits: () => Promise.resolve([{ name: 'Hero', updatedAt: new Date('2026-09-20T00:00:00Z') }]),
    insertReport: (row) => {
      if (options.duplicateInsert) return Promise.resolve({ duplicate: true as const });
      inserted.push(row);
      return Promise.resolve({ id: `report-${inserted.length}` });
    },
    setEmailStatus: (id, status) => {
      statuses.push([id, status]);
      return Promise.resolve();
    },
  };
  const deps: HandlerDeps = {
    env: {
      REPORT_CRON_SECRET: SECRET,
      RESEND_API_KEY: 're_test',
      REPORT_RECIPIENT_EMAIL: 'reports@example.com',
      CONTACT_RECIPIENT_EMAIL: 'contact@example.com',
      CONTACT_SENDER: 'Contact <contact@example.com>',
      ...options.env,
    },
    store: options.store === false ? null : store,
    getUser: () => Promise.resolve(options.user === undefined ? ADMIN : options.user),
    sendEmail: (message) => {
      sent.push(message);
      return Promise.resolve(options.email === 'fail' ? { error: 'Resend said no' } : { id: 'email-1' });
    },
    now: () => options.now ?? SCHEDULED,
    log: (message) => logs.push(message),
  };
  return { deps, inserted, statuses, sent, logs, windows };
}

const cron = (secret = SECRET) =>
  new Request('https://x.functions.supabase.co/quarterly-report', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-report-secret': secret },
    body: '{}',
  });

const manual = (bearer?: string, origin: string | null = ORIGIN) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (origin) headers.origin = origin;
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return new Request('https://x.functions.supabase.co/quarterly-report', { method: 'POST', headers, body: '{}' });
};

const ADMIN_AAL2 = token({ sub: 'user-1', aal: 'aal2' });

Deno.test('secretsMatch compares in full, whatever the lengths', async () => {
  assert(await secretsMatch(SECRET, SECRET));
  assertFalse(await secretsMatch(SECRET.slice(0, -1), SECRET));
  assertFalse(await secretsMatch('', SECRET));
  assertFalse(await secretsMatch(`${SECRET}x`, SECRET));
});

Deno.test('scheduled run at 9 AM New York stores and sends the previous quarter', async () => {
  const { deps, inserted, statuses, sent, windows } = makeDeps();
  const response = await handleRequest(cron(), deps);
  assertEquals(response.status, 200);
  assertEquals((await response.json()).data, {
    id: 'report-1',
    quarter: 'Q3 2026',
    partial: false,
    email_status: 'sent',
  });
  assertEquals(inserted.length, 1);
  const row = inserted[0];
  assertEquals([row.quarter, row.period_label, row.period_start, row.period_end], [
    'Q3 2026',
    'July to September 2026',
    '2026-07-01',
    '2026-09-30',
  ]);
  assertEquals([row.partial, row.trigger, row.email_status], [false, 'schedule', 'failed']);
  assertEquals(row.summary.windows.current.visits, 10);
  assertStringIncludes(row.body_text, 'You had 10 visits and 3 reach-outs.');
  assertEquals(statuses, [['report-1', 'sent']]);
  assertEquals(sent[0].to, ['reports@example.com']);
  assertEquals(sent[0].from, 'Contact <contact@example.com>');
  assertEquals(sent[0].subject, 'Quarterly report: July to September 2026');
  assertEquals(windows, [
    '2026-07-01T04:00:00.000Z/2026-10-01T04:00:00.000Z',
    '2026-04-01T04:00:00.000Z/2026-07-01T04:00:00.000Z',
    '2025-07-01T04:00:00.000Z/2025-10-01T04:00:00.000Z',
  ]);
});

Deno.test('the cron call that is not 9 AM New York does nothing', async () => {
  const { deps, inserted, sent } = makeDeps({ now: NOT_DUE });
  const response = await handleRequest(cron(), deps);
  assertEquals(response.status, 200);
  assertEquals((await response.json()).data, { status: 'not_due' });
  assertEquals([inserted.length, sent.length], [0, 0]);
});

Deno.test('a quarter already stored is not stored or sent again', async () => {
  const { deps, inserted, sent } = makeDeps({ existing: { id: 'old', email_status: 'sent' } });
  const response = await handleRequest(cron(), deps);
  assertEquals((await response.json()).data, {
    id: 'old',
    quarter: 'Q3 2026',
    partial: false,
    email_status: 'sent',
    existing: true,
  });
  assertEquals([inserted.length, sent.length], [0, 0]);
});

Deno.test('a concurrent run that loses the unique index returns the stored row without sending', async () => {
  const { deps, sent } = makeDeps({ duplicateInsert: true });
  // findFullReport is consulted twice: before (nothing yet) and after the conflict.
  let calls = 0;
  (deps.store as Store).findFullReport = () => {
    calls += 1;
    return Promise.resolve(calls === 1 ? null : { id: 'winner', email_status: 'sent' as const });
  };
  const response = await handleRequest(cron(), deps);
  assertEquals((await response.json()).data.id, 'winner');
  assertEquals(sent.length, 0);
});

Deno.test('a wrong or missing cron secret is refused; a short configured secret counts as not set up', async () => {
  const wrong = await handleRequest(cron('b'.repeat(45)), makeDeps().deps);
  assertEquals(wrong.status, 401);
  assertEquals((await wrong.json()).error, MESSAGES.forbidden);

  const empty = await handleRequest(cron(''), makeDeps().deps);
  assertEquals(empty.status, 401);

  const short = await handleRequest(cron('short'), makeDeps({ env: { REPORT_CRON_SECRET: 'short' } }).deps);
  assertEquals(short.status, 503);
  assertEquals((await short.json()).code, 'not_configured');
});

Deno.test('a failed email is recorded as failed; no Resend key stores the row as skipped', async () => {
  const failing = makeDeps({ email: 'fail' });
  const response = await handleRequest(cron(), failing.deps);
  assertEquals((await response.json()).data.email_status, 'failed');
  assertEquals(failing.statuses, [['report-1', 'failed']]);
  assert(failing.logs.some((line) => line.includes('delivery failed')));
  assertFalse(failing.logs.join(' ').includes('Resend said no'));

  const unset = makeDeps({ env: { RESEND_API_KEY: undefined } });
  const skipped = await handleRequest(cron(), unset.deps);
  assertEquals((await skipped.json()).data.email_status, 'skipped');
  assertEquals(unset.inserted[0].email_status, 'skipped');
  assertEquals([unset.sent.length, unset.statuses.length], [0, 0]);
});

Deno.test('recipient and sender fall back to the contact settings', async () => {
  const { deps, sent } = makeDeps({
    env: { REPORT_RECIPIENT_EMAIL: undefined, REPORT_SENDER: 'Reports <r@example.com>' },
  });
  await handleRequest(cron(), deps);
  assertEquals(sent[0].to, ['contact@example.com']);
  assertEquals(sent[0].from, 'Reports <r@example.com>');
});

Deno.test('manual run by the admin at aal2 reports the quarter so far', async () => {
  const { deps, inserted, sent } = makeDeps({ now: MID_QUARTER });
  const response = await handleRequest(manual(ADMIN_AAL2), deps);
  assertEquals(response.status, 200);
  assertEquals(response.headers.get('access-control-allow-origin'), ORIGIN);
  assertEquals((await response.json()).data, {
    id: 'report-1',
    quarter: 'Q4 2026',
    partial: true,
    email_status: 'sent',
  });
  assertEquals([inserted[0].partial, inserted[0].trigger, inserted[0].period_end], [true, 'manual', '2026-11-19']);
  assertEquals(sent[0].subject, 'Quarter so far: October to December 2026 (day 50 of 92)');
});

Deno.test('manual runs need a real admin session that has passed the second factor', async () => {
  const cases: Array<[Request, ReturnType<typeof makeDeps>, number, string]> = [
    [manual(), makeDeps(), 401, 'unauthorized'],
    [manual('not-a-jwt'), makeDeps(), 401, 'unauthorized'],
    [manual(ADMIN_AAL2), makeDeps({ user: null }), 401, 'unauthorized'],
    [manual(token({ sub: 'someone-else', aal: 'aal2' })), makeDeps(), 401, 'unauthorized'],
    [
      manual(ADMIN_AAL2),
      makeDeps({ user: { id: 'user-1', email: 'x@example.com', isAnonymous: false } }),
      403,
      'forbidden',
    ],
    [manual(ADMIN_AAL2), makeDeps({ user: { ...ADMIN, isAnonymous: true } }), 403, 'forbidden'],
    [manual(token({ sub: 'user-1', aal: 'aal1' })), makeDeps(), 403, 'insufficient_aal'],
  ];
  for (const [request, made, status, code] of cases) {
    const response = await handleRequest(request, made.deps);
    assertEquals(response.status, status, code);
    assertEquals((await response.json()).code, code);
    assertEquals(made.inserted.length, 0);
  }
});

Deno.test('origins: browsers must come from an allowed origin; preflight answers it', async () => {
  const foreign = await handleRequest(manual(ADMIN_AAL2, 'https://evil.example'), makeDeps().deps);
  assertEquals(foreign.status, 403);
  const preflight = await handleRequest(
    new Request('https://x/quarterly-report', {
      method: 'OPTIONS',
      headers: { origin: ORIGIN, 'access-control-request-headers': 'authorization, apikey, x-client-info' },
    }),
    makeDeps().deps,
  );
  assertEquals(preflight.status, 204);
  assertEquals(preflight.headers.get('access-control-allow-headers'), 'authorization, apikey, x-client-info');
  const get = await handleRequest(new Request('https://x/quarterly-report', { method: 'GET' }), makeDeps().deps);
  assertEquals(get.status, 405);
});

Deno.test('oversized bodies are refused', async () => {
  const response = await handleRequest(
    new Request('https://x/quarterly-report', {
      method: 'POST',
      headers: { 'x-report-secret': SECRET },
      body: 'x'.repeat(5000),
    }),
    makeDeps().deps,
  );
  assertEquals(response.status, 413);
});

Deno.test('a database failure returns the fixed sentence and logs only the error class', async () => {
  const made = makeDeps({ failEvents: true });
  const response = await handleRequest(cron(), made.deps);
  assertEquals(response.status, 500);
  const body = await response.json();
  assertEquals(body, { success: false, code: 'server_error', error: MESSAGES.server });
  assertEquals(made.logs, ['quarterly-report: schedule failed (Error)']);
  assertFalse(JSON.stringify(body).includes('secret_table'));
});

Deno.test('without a service key the function says it is not set up', async () => {
  const response = await handleRequest(cron(), makeDeps({ store: false }).deps);
  assertEquals(response.status, 503);
  assertEquals((await response.json()).error, MESSAGES.notConfigured);
});
