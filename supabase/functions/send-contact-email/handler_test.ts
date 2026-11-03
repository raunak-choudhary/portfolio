import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { ATTACHMENT_PREFIX, MAX_BODY_BYTES } from './lib.ts';
import { DEFAULT_RECIPIENT, type HandlerDeps, handleRequest } from './handler.ts';

const ORIGIN = 'https://www.raunakchoudhary.com';
const PUBLIC_KEY = 'sb_publishable_test';

const body = () => ({
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  organization: 'Analytical Engines',
  role: 'recruiter',
  inquiryType: 'networking',
  subject: 'Let us talk',
  message: 'We would like to discuss an engineering position with you.',
  attachments: [{
    name: 'brief.pdf',
    filePath: `${ATTACHMENT_PREFIX}1-1-brief.pdf`,
    size: 2048,
    type: 'application/pdf',
  }],
});

/** Builds deps with recording fakes; overrides let a test break one part. */
function makeDeps(overrides: Partial<HandlerDeps> = {}) {
  const sent: unknown[] = [];
  const signed: string[] = [];
  const deps: HandlerDeps = {
    env: {
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUBLIC_KEY }),
      SUPABASE_ANON_KEY: 'legacy.anon.jwt',
      RESEND_API_KEY: 're_test',
      CONTACT_RECIPIENT_EMAIL: 'owner@example.com',
    },
    signUrl: (path) => {
      signed.push(path);
      return Promise.resolve({ url: `https://p.supabase.co/sign/${path}?token=t` });
    },
    sendEmail: (message) => {
      sent.push(message);
      return Promise.resolve({ id: 'em_123' });
    },
    now: () => new Date('2026-11-02T21:00:00Z'),
    ...overrides,
  };
  return { deps, sent, signed };
}

const post = (payload: unknown, headers: Record<string, string> = {}) =>
  new Request('https://fn.example/send-contact-email', {
    method: 'POST',
    headers: { origin: ORIGIN, apikey: PUBLIC_KEY, 'content-type': 'application/json', ...headers },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });

Deno.test('delivers a valid message with signed attachment links and reports success', async () => {
  const { deps, sent, signed } = makeDeps();

  const response = await handleRequest(post(body()), deps);
  const result = await response.json();

  assertEquals(response.status, 200);
  assertEquals(result.success, true);
  assertEquals(result.data.attachmentsWithLinks, 1);
  assertEquals(signed, [`${ATTACHMENT_PREFIX}1-1-brief.pdf`]);
  assertEquals(sent.length, 1);
  const message = sent[0] as { to: string[]; replyTo: string[]; subject: string; html: string };
  assertEquals(message.to, ['owner@example.com']);
  assertEquals(message.replyTo, ['ada@example.com']);
  assertEquals(message.subject, 'Portfolio contact: Let us talk');
  assertStringIncludes(message.html, 'https://p.supabase.co/sign/');
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

Deno.test('accepts the legacy anon key until the cutover', async () => {
  const { deps } = makeDeps();
  const response = await handleRequest(post(body(), { apikey: 'legacy.anon.jwt' }), deps);
  assertEquals(response.status, 200);
});

Deno.test('accepts the key as a bearer token, as the build live until the cutover sends it', async () => {
  const { deps } = makeDeps();
  const response = await handleRequest(post(body(), { apikey: '', authorization: 'Bearer legacy.anon.jwt' }), deps);
  assertEquals(response.status, 200);
});

Deno.test('accepts a key the project verifier confirms, and only asks it for unknown keys', async () => {
  const asked: string[] = [];
  const { deps } = makeDeps({
    verifyKey: (key) => {
      asked.push(key);
      return Promise.resolve(key === 'legacy.anon.jwt.not.injected');
    },
  });
  delete deps.env.SUPABASE_ANON_KEY;
  assertEquals((await handleRequest(post(body(), { apikey: 'legacy.anon.jwt.not.injected' }), deps)).status, 200);
  assertEquals((await handleRequest(post(body(), { apikey: PUBLIC_KEY }), deps)).status, 200);
  assertEquals((await handleRequest(post(body(), { apikey: 'sb_publishable_forged' }), deps)).status, 401);
  assertEquals(asked, ['legacy.anon.jwt.not.injected', 'sb_publishable_forged']);
});

Deno.test('refuses requests without a known public key', async () => {
  const { deps, sent } = makeDeps();
  const missing = await handleRequest(post(body(), { apikey: '' }), deps);
  const wrong = await handleRequest(post(body(), { apikey: 'sb_publishable_other' }), deps);
  assertEquals(missing.status, 401);
  assertEquals(wrong.status, 401);
  assertEquals(sent.length, 0);
});

Deno.test('refuses requests from other origins, including preflight', async () => {
  const { deps, sent } = makeDeps();
  const response = await handleRequest(post(body(), { origin: 'https://evil.example' }), deps);
  assertEquals(response.status, 403);
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), null);

  const preflight = await handleRequest(
    new Request('https://fn.example/x', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }),
    deps,
  );
  assertEquals(preflight.status, 403);
  assertEquals(sent.length, 0);
});

Deno.test('answers preflight from an allowed origin with CORS headers', async () => {
  const { deps } = makeDeps();
  const preflight = await handleRequest(
    new Request('https://fn.example/x', { method: 'OPTIONS', headers: { origin: ORIGIN } }),
    deps,
  );
  assertEquals(preflight.status, 204);
  assertEquals(preflight.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assertStringIncludes(preflight.headers.get('Access-Control-Allow-Headers') ?? '', 'apikey');
});

Deno.test('preflight echoes the headers the browser intends to send, lower-cased', async () => {
  const { deps } = makeDeps();
  const preflight = await handleRequest(
    new Request('https://fn.example/x', {
      method: 'OPTIONS',
      headers: { origin: ORIGIN, 'access-control-request-headers': 'Content-Type, apikey, X-Application-Name' },
    }),
    deps,
  );
  assertEquals(preflight.status, 204);
  assertEquals(preflight.headers.get('Access-Control-Allow-Headers'), 'content-type, apikey, x-application-name');
});

Deno.test('rejects oversized bodies before parsing', async () => {
  const { deps, sent } = makeDeps();
  const huge = JSON.stringify({ ...body(), message: 'x'.repeat(MAX_BODY_BYTES) });
  const response = await handleRequest(post(huge), deps);
  assertEquals(response.status, 413);
  assertEquals(sent.length, 0);
});

Deno.test('rejects malformed JSON and invalid fields with details', async () => {
  const { deps } = makeDeps();
  assertEquals((await handleRequest(post('{not json'), deps)).status, 400);

  const response = await handleRequest(
    post({ ...body(), attachments: [{ name: 'x', filePath: 'documents/private.pdf', size: 1 }] }),
    deps,
  );
  const result = await response.json();
  assertEquals(response.status, 400);
  assert(result.details.some((d: string) => d.includes('not an allowed upload path')));
});

Deno.test('still sends the email when a signed link cannot be created, and says so', async () => {
  const { deps, sent } = makeDeps({ signUrl: () => Promise.resolve({ error: 'object not found' }) });
  const response = await handleRequest(post(body()), deps);
  const result = await response.json();
  assertEquals(response.status, 200);
  assertEquals(result.data.attachmentsWithLinks, 0);
  assertStringIncludes((sent[0] as { text: string }).text, 'link unavailable: object not found');
});

Deno.test('reports configuration and delivery failures without leaking details', async () => {
  const noKey = makeDeps({
    env: {
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUBLIC_KEY }),
      CONTACT_RECIPIENT_EMAIL: 'o@example.com',
    },
  });
  assertEquals((await handleRequest(post(body()), noKey.deps)).status, 500);

  const failing = makeDeps({ sendEmail: () => Promise.resolve({ error: 'Resend responded 422' }) });
  const response = await handleRequest(post(body()), failing.deps);
  const result = await response.json();
  assertEquals(response.status, 502);
  assertEquals(result.error, 'Failed to send email');
  assertEquals(JSON.stringify(result).includes('422'), false);
});

Deno.test('delivers to the default recipient when no override is configured', async () => {
  const { deps, sent } = makeDeps();
  delete deps.env.CONTACT_RECIPIENT_EMAIL;
  const response = await handleRequest(post(body()), deps);
  assertEquals(response.status, 200);
  assertEquals((sent[0] as { to: string[] }).to, [DEFAULT_RECIPIENT]);
});

Deno.test('rejects methods other than POST', async () => {
  const { deps } = makeDeps();
  const response = await handleRequest(
    new Request('https://fn.example/x', { method: 'GET', headers: { origin: ORIGIN } }),
    deps,
  );
  assertEquals(response.status, 405);
});
