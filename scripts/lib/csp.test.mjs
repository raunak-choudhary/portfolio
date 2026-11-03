import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkSecurityHeaders, parseCsp, supabaseHostFromIndexHtml } from './csp.mjs';

const HOST = 'ref.supabase.co';
const GOOD_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  `img-src 'self' data: blob: https://${HOST} https://cdn.jsdelivr.net`,
  `connect-src 'self' https://${HOST} wss://${HOST}`,
  `frame-src 'self' https://${HOST}`,
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const htaccessWith = (policy, extra = '') => `
<IfModule mod_headers.c>
  Header always set Content-Security-Policy "${policy}"
  Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  ${extra}
</IfModule>`;

const INDEX = `<link rel="preconnect" href="https://${HOST}" />`;
const input = (overrides = {}) => ({
  htaccess: htaccessWith(GOOD_POLICY),
  indexHtml: INDEX,
  supabaseHost: HOST,
  imageHosts: [HOST, 'cdn.jsdelivr.net'],
  documentHosts: [HOST],
  ...overrides,
});

describe('parseCsp', () => {
  it('maps directives to their sources, case-insensitively', () => {
    const csp = parseCsp("Default-Src 'self';  img-src 'self' data: https://a.example ; ");
    assert.deepEqual(csp.get('default-src'), ["'self'"]);
    assert.deepEqual(csp.get('img-src'), ["'self'", 'data:', 'https://a.example']);
  });
});

describe('checkSecurityHeaders', () => {
  it('passes a consistent configuration', () => {
    assert.deepEqual(checkSecurityHeaders(input()), []);
  });

  it('rejects inline and eval script sources', () => {
    const policy = GOOD_POLICY.replace("script-src 'self'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    const problems = checkSecurityHeaders(input({ htaccess: htaccessWith(policy) }));
    assert.ok(problems.includes("script-src must not include 'unsafe-inline'"));
    assert.ok(problems.includes("script-src must not include 'unsafe-eval'"));
  });

  it('rejects repeated directives, which browsers resolve to the first copy', () => {
    const policy = `${GOOD_POLICY}; script-src 'self'`;
    const problems = checkSecurityHeaders(input({ htaccess: htaccessWith(policy) }));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /malformed.*script-src appears more than once/);
  });

  it('rejects wildcard and scheme-only script sources', () => {
    const policy = GOOD_POLICY.replace("script-src 'self'", "script-src 'self' https: *");
    const problems = checkSecurityHeaders(input({ htaccess: htaccessWith(policy) }));
    assert.deepEqual(problems, ['script-src must not include *', 'script-src must not include https:']);
  });

  it('reports an image host the policy does not allow', () => {
    const problems = checkSecurityHeaders(input({ imageHosts: [HOST, 'images.unsplash.com'] }));
    assert.deepEqual(problems, ['img-src does not allow image host images.unsplash.com']);
  });

  it('reports a framed document host the policy does not allow', () => {
    const problems = checkSecurityHeaders(input({ documentHosts: ['docs.example'] }));
    assert.deepEqual(problems, ['frame-src does not allow framed document host docs.example']);
  });

  it('requires both https and wss connections to the Supabase project', () => {
    const policy = GOOD_POLICY.replace(`wss://${HOST}`, '');
    const problems = checkSecurityHeaders(input({ htaccess: htaccessWith(policy) }));
    assert.deepEqual(problems, [`connect-src must include wss://${HOST}`]);
  });

  it('reports a missing required directive', () => {
    const policy = GOOD_POLICY.replace("; frame-ancestors 'self'", '');
    const problems = checkSecurityHeaders(input({ htaccess: htaccessWith(policy) }));
    assert.deepEqual(problems, ['frame-ancestors directive is missing']);
  });

  it('rejects a CSP meta tag in index.html', () => {
    const indexHtml = `${INDEX}<meta http-equiv="Content-Security-Policy" content="default-src 'self'">`;
    const problems = checkSecurityHeaders(input({ indexHtml }));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /meta tag/);
  });

  it('checks the companion headers', () => {
    const htaccess = `<IfModule mod_headers.c>
      Header always set Content-Security-Policy "${GOOD_POLICY}"
      Header always set Strict-Transport-Security "max-age=300"
      Header always set X-Frame-Options "DENY"
    </IfModule>`;
    const problems = checkSecurityHeaders(input({ htaccess }));
    assert.deepEqual(problems, [
      'Strict-Transport-Security must set max-age of at least one year',
      'X-Content-Type-Options must be nosniff',
      'Referrer-Policy header is missing',
      'X-Frame-Options DENY blocks the admin preview iframe; use SAMEORIGIN',
    ]);
  });

  it('reports a missing policy once rather than one problem per directive', () => {
    const problems = checkSecurityHeaders(input({ htaccess: '' }));
    assert.ok(problems.includes('Content-Security-Policy header is missing from public/.htaccess'));
    assert.ok(!problems.some((p) => p.endsWith('directive is missing')));
  });
});

describe('supabaseHostFromIndexHtml', () => {
  it('reads the project host from the preconnect hint', () => {
    assert.equal(supabaseHostFromIndexHtml(INDEX), HOST);
    assert.equal(supabaseHostFromIndexHtml('<html></html>'), null);
  });
});
