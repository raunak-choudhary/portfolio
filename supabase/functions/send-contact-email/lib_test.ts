import { assert, assertEquals, assertFalse, assertMatch, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  acceptedPublicKeys,
  allowedOriginsFrom,
  ATTACHMENT_PREFIX,
  corsHeadersFor,
  DEFAULT_ALLOWED_ORIGINS,
  escapeHtml,
  inquiryLabel,
  isAllowedAttachmentPath,
  isAllowedOrigin,
  looksLikePublicKey,
  MAX_ATTACHMENTS,
  normalizeAttachmentPath,
  renderEmail,
  selectServiceKey,
  validateContactRequest,
} from './lib.ts';

/** Builds a JWT-shaped token at runtime so no key-like literal sits in the source (keeps secret scanners quiet). */
const jwtShaped = (claims: Record<string, unknown>) =>
  [{ alg: 'HS256', typ: 'JWT' }, claims]
    .map((part) => btoa(JSON.stringify(part)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))
    .concat('c2lnbmF0dXJlLWZpbGxlci12YWx1ZQ')
    .join('.');

const validBody = () => ({
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  organization: 'Analytical Engines',
  role: 'recruiter',
  inquiryType: 'full-time-opportunity',
  subject: 'Role at Analytical Engines',
  message: 'We would like to discuss an engineering position with you.',
  attachments: [{
    name: 'brief.pdf',
    filePath: `${ATTACHMENT_PREFIX}1730000000-1-brief.pdf`,
    size: 2048,
    type: 'application/pdf',
  }],
});

Deno.test('escapeHtml neutralises markup and quotes', () => {
  assertEquals(
    escapeHtml(`<script>alert("x")</script> & 'y'`),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;',
  );
  assertEquals(escapeHtml(undefined), '');
});

Deno.test('normalizeAttachmentPath accepts plain paths and storage URLs of this bucket', () => {
  assertEquals(
    normalizeAttachmentPath('contact-attachments/contact-1-1-a.pdf'),
    'contact-attachments/contact-1-1-a.pdf',
  );
  assertEquals(
    normalizeAttachmentPath('/contact-attachments/contact-1-1-a.pdf'),
    'contact-attachments/contact-1-1-a.pdf',
  );
  assertEquals(
    normalizeAttachmentPath(
      'https://p.supabase.co/storage/v1/object/public/contact-attachments/contact-attachments/contact-1-1-a%20b.pdf',
    ),
    'contact-attachments/contact-1-1-a b.pdf',
  );
  assertEquals(normalizeAttachmentPath('https://p.supabase.co/storage/v1/object/public/documents/secret.pdf'), '');
  assertEquals(normalizeAttachmentPath(42), '');
});

Deno.test('isAllowedAttachmentPath allows only direct uploads under the contact prefix', () => {
  assert(isAllowedAttachmentPath(`${ATTACHMENT_PREFIX}1-1-resume.pdf`));
  assertFalse(isAllowedAttachmentPath('documents/private.pdf'));
  assertFalse(isAllowedAttachmentPath('contact-attachments/other.pdf'));
  assertFalse(isAllowedAttachmentPath(`${ATTACHMENT_PREFIX}1/../../documents/x.pdf`));
  assertFalse(isAllowedAttachmentPath(`${ATTACHMENT_PREFIX}1/nested.pdf`));
  assertFalse(isAllowedAttachmentPath(''));
});

Deno.test('origin checks use the configured list or the defaults', () => {
  assert(isAllowedOrigin('https://www.raunakchoudhary.com'));
  assertFalse(isAllowedOrigin('https://evil.example'));
  assertFalse(isAllowedOrigin(null));
  assertEquals(allowedOriginsFrom(undefined), DEFAULT_ALLOWED_ORIGINS);
  assertEquals(allowedOriginsFrom(' https://a.example , https://b.example '), [
    'https://a.example',
    'https://b.example',
  ]);
  assertEquals(corsHeadersFor('https://a.example')['Access-Control-Allow-Origin'], 'https://a.example');
  assertStringIncludes(corsHeadersFor('https://a.example')['Access-Control-Allow-Headers'], 'x-application-name');
  assertEquals(
    corsHeadersFor('https://a.example', 'X-Custom, Apikey')['Access-Control-Allow-Headers'],
    'x-custom, apikey',
  );
});

Deno.test('acceptedPublicKeys merges publishable keys and the legacy anon key', () => {
  const keys = acceptedPublicKeys({
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_one', other: 'sb_publishable_two' }),
    SUPABASE_ANON_KEY: 'legacy.anon.jwt',
  });
  assertEquals([...keys].sort(), ['legacy.anon.jwt', 'sb_publishable_one', 'sb_publishable_two']);
  assertEquals(acceptedPublicKeys({ SUPABASE_PUBLISHABLE_KEYS: 'not json' }).size, 0);
});

Deno.test('selectServiceKey prefers the default secret key, then any secret, then legacy', () => {
  assertEquals(
    selectServiceKey({
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_a', b: 'sb_secret_b' }),
      SUPABASE_SERVICE_ROLE_KEY: 'legacy',
    }),
    { key: 'sb_secret_a', source: 'secret' },
  );
  assertEquals(selectServiceKey({ SUPABASE_SECRET_KEYS: JSON.stringify({ b: 'sb_secret_b' }) }), {
    key: 'sb_secret_b',
    source: 'secret',
  });
  assertEquals(selectServiceKey({ SUPABASE_SERVICE_ROLE_KEY: 'legacy' }), { key: 'legacy', source: 'legacy' });
  assertEquals(selectServiceKey({ SUPABASE_SECRET_KEYS: '{broken' }), null);
});

Deno.test('validateContactRequest accepts a well-formed request and trims fields', () => {
  const result = validateContactRequest({ ...validBody(), name: '  Ada Lovelace ' });
  assert(result.ok);
  assertEquals(result.data.name, 'Ada Lovelace');
  assertEquals(result.data.attachments[0].filePath, `${ATTACHMENT_PREFIX}1730000000-1-brief.pdf`);
});

Deno.test('validateContactRequest rejects missing, short and oversized fields', () => {
  const result = validateContactRequest({ ...validBody(), name: '', subject: 'Hi', message: 'short', email: 'nope' });
  assertFalse(result.ok);
  assertEquals(result.errors.length, 4);

  const long = validateContactRequest({ ...validBody(), message: 'x'.repeat(5001) });
  assertFalse(long.ok);
  assertMatch(long.errors[0], /message/);
});

Deno.test('validateContactRequest refuses attachments outside the upload prefix, too many, or oversized', () => {
  const outside = validateContactRequest({
    ...validBody(),
    attachments: [{ name: 'x.pdf', filePath: 'documents/private.pdf', size: 1, type: 'application/pdf' }],
  });
  assertFalse(outside.ok);
  assertMatch(outside.errors[0], /not an allowed upload path/);

  const many = validateContactRequest({
    ...validBody(),
    attachments: Array(MAX_ATTACHMENTS + 1).fill(validBody().attachments[0]),
  });
  assertFalse(many.ok);

  const huge = validateContactRequest({
    ...validBody(),
    attachments: [{ ...validBody().attachments[0], size: 11 * 1024 * 1024 }],
  });
  assertFalse(huge.ok);
  assertMatch(huge.errors[0], /size/);
});

Deno.test('looksLikePublicKey accepts publishable keys and legacy JWTs only', () => {
  assert(looksLikePublicKey('sb_publishable_abcDEF123456'));
  assert(looksLikePublicKey(jwtShaped({ role: 'anon' })));
  assertFalse(looksLikePublicKey('random-garbage'));
  assertFalse(looksLikePublicKey('sb_secret_abcDEF123456'));
});

Deno.test('validateContactRequest rejects control characters and query-style emails', () => {
  const crlf = validateContactRequest({ ...validBody(), subject: 'Hello\r\nBcc: x' });
  assertFalse(crlf.ok);
  const query = validateContactRequest({ ...validBody(), email: 'a@b.co?cc=x%40evil.com' });
  assertFalse(query.ok);
});

Deno.test('validateContactRequest rejects non-object bodies', () => {
  assertFalse(validateContactRequest(null).ok);
  assertFalse(validateContactRequest([1]).ok);
  assertFalse(validateContactRequest('text').ok);
});

Deno.test('renderEmail escapes every visitor-supplied value in the HTML version', () => {
  const data = validateContactRequest({
    ...validBody(),
    name: 'Mallory <img src=x onerror=alert(1)>',
    message: '<b>bold</b> & more text to pass the minimum length',
  });
  assert(data.ok);
  const { html, text } = renderEmail(data.data, [], 'November 2, 2026 at 9:00 PM');
  assertFalse(html.includes('<img src=x'));
  assertStringIncludes(html, '&lt;img src=x onerror=alert(1)&gt;');
  assertStringIncludes(html, '&lt;b&gt;bold&lt;/b&gt; &amp; more text');
  assertStringIncludes(text, '<b>bold</b> & more text');
});

Deno.test('renderEmail lists attachment links and explains missing ones', () => {
  const data = validateContactRequest(validBody());
  assert(data.ok);
  const attachments = [
    { ...data.data.attachments[0], url: 'https://p.supabase.co/sign/one?token=abc', signedUrlError: '' },
    { ...data.data.attachments[0], name: 'two.pdf', url: '', signedUrlError: 'object not found' },
  ];
  const { html, text } = renderEmail(data.data, attachments, 'now');
  assertStringIncludes(html, 'href="https://p.supabase.co/sign/one?token=abc"');
  assertStringIncludes(html, 'link unavailable: object not found');
  assertStringIncludes(text, 'two.pdf (0.00 MB): link unavailable: object not found');
  assertStringIncludes(html, 'expire in 24 hours');
});

Deno.test('inquiryLabel maps known types and passes unknown ones through', () => {
  assertEquals(inquiryLabel('networking'), 'Professional networking');
  assertEquals(inquiryLabel('something-else'), 'something-else');
  assertEquals(inquiryLabel(''), 'Not specified');
});
