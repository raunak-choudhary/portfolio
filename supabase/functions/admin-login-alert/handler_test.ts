import { assert, assertEquals, assertFalse, assertStringIncludes } from 'jsr:@std/assert@1';
import { ALERT_INTERVAL_MS, type AlertState, handleRequest, maskAddress, nextState, renderAlert } from './handler.ts';

const ORIGIN = 'https://www.raunakchoudhary.com';
const KEY = 'sb_publishable_testkey1234567890';
const NOW = new Date('2026-11-09T20:00:00Z');

function makeDeps(initial: AlertState | null = null) {
  let state = initial;
  const sent: Array<{ to: string[]; subject: string; text: string }> = [];
  const deps = {
    env: { SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: KEY }), RESEND_API_KEY: 're_test' },
    readState: () => Promise.resolve(state),
    writeState: (next: AlertState) => {
      state = next;
      return Promise.resolve({});
    },
    sendEmail: (message: { to: string[]; subject: string; text: string }) => {
      sent.push(message);
      return Promise.resolve({ id: 'email-1' });
    },
    now: () => NOW,
  };
  return { deps, sent, state: () => state };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://x.functions.supabase.co/admin-login-alert', {
    method: 'POST',
    headers: { origin: ORIGIN, apikey: KEY, 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

Deno.test('maskAddress keeps a few letters and the domain, and refuses junk', () => {
  assertEquals(maskAddress('someone@example.com'), 'som•••••@example.com');
  assertEquals(maskAddress('ab@x.io'), 'a•••••@x.io');
  assertEquals(maskAddress('<script>@evil.com'), 'an unreadable address');
  assertEquals(maskAddress('nope'), 'an unreadable address');
});

Deno.test('nextState alerts on the first attempt and then once per interval', () => {
  const first = nextState(null, NOW);
  assert(first.sendAlert);
  assertEquals(first.attemptsToReport, 1);
  assertEquals(first.state.attempts, 0);

  const soon = new Date(NOW.getTime() + 60_000);
  const second = nextState(first.state, soon);
  assertFalse(second.sendAlert);
  assertEquals(second.state.attempts, 1);

  const third = nextState(second.state, new Date(soon.getTime() + 60_000));
  assertFalse(third.sendAlert);
  assertEquals(third.state.attempts, 2);

  const later = new Date(NOW.getTime() + ALERT_INTERVAL_MS);
  const fourth = nextState(third.state, later);
  assert(fourth.sendAlert);
  assertEquals(fourth.attemptsToReport, 3);
  assertEquals(fourth.state.attempts, 0);
  assertEquals(fourth.state.lastAlertAt, later.toISOString());
});

Deno.test('renderAlert escapes the address and states the count and the throttle', () => {
  const { subject, html, text } = renderAlert('<b>x</b>•••••@evil.com', 3, 'November 9, 2026 at 3:00 PM');
  assertStringIncludes(subject, '3 attempts');
  assertFalse(html.includes('<b>x</b>'));
  assertStringIncludes(html, '&lt;b&gt;x&lt;/b&gt;');
  assertStringIncludes(text, 'once every 30 minutes');
});

Deno.test('first attempt sends one masked alert to the owner and stores the window', async () => {
  const { deps, sent, state } = makeDeps();
  const response = await handleRequest(post({ attemptedEmail: 'Intruder@Example.com' }), deps);
  assertEquals(response.status, 200);
  assertEquals((await response.json()).data.alerted, true);
  assertEquals(sent.length, 1);
  assertEquals(sent[0].to, ['raunakchoudhary17@gmail.com']);
  assertStringIncludes(sent[0].text, 'int•••••@example.com');
  assertFalse(sent[0].text.includes('Intruder'));
  assertEquals(state()?.lastAlertAt, NOW.toISOString());
});

Deno.test('attempts inside the interval are counted but send no email', async () => {
  const { deps, sent } = makeDeps({ attempts: 4, windowStartedAt: NOW.toISOString(), lastAlertAt: new Date(NOW.getTime() - 5 * 60_000).toISOString() });
  const response = await handleRequest(post({ attemptedEmail: 'x@y.com' }), deps);
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.data, { alerted: false, attempts: 5 });
  assertEquals(sent.length, 0);
});

Deno.test('refuses foreign origins, unknown keys, oversized and malformed bodies', async () => {
  const { deps } = makeDeps();
  assertEquals((await handleRequest(post({ attemptedEmail: 'a@b.co' }, { origin: 'https://evil.example' }), deps)).status, 403);
  assertEquals((await handleRequest(post({ attemptedEmail: 'a@b.co' }, { apikey: 'sb_publishable_unknownkey000000' }), deps)).status, 401);
  assertEquals((await handleRequest(post('x'.repeat(3000)), deps)).status, 413);
  assertEquals((await handleRequest(post('{not json'), deps)).status, 400);
  assertEquals((await handleRequest(post({ attemptedEmail: '' }), deps)).status, 400);
  assertEquals((await handleRequest(post({}), deps)).status, 400);
});

Deno.test('a failed state write is reported and sends nothing', async () => {
  const { deps, sent } = makeDeps();
  deps.writeState = () => Promise.resolve({ error: 'db down' });
  const response = await handleRequest(post({ attemptedEmail: 'a@b.co' }), deps);
  assertEquals(response.status, 500);
  assertEquals(sent.length, 0);
});

Deno.test('preflight from an allowed origin is accepted', async () => {
  const { deps } = makeDeps();
  const response = await handleRequest(
    new Request('https://x.functions.supabase.co/admin-login-alert', { method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-headers': 'apikey, x-application-name' } }),
    deps,
  );
  assertEquals(response.status, 204);
  assertStringIncludes(response.headers.get('Access-Control-Allow-Headers') ?? '', 'x-application-name');
});
