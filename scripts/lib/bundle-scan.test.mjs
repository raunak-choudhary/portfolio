import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FORBIDDEN_STRINGS, decodeJwtPayload, findInlineScripts, readAnalyticsStamp, scanBuild } from './bundle-scan.mjs';

/** Builds an unsigned JWT-shaped token with the given claims (signature is filler). */
const jwt = (claims) =>
  [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(claims)).toString('base64url'),
    'c2lnbmF0dXJlLWZpbGxlci12YWx1ZQ',
  ].join('.');

const anonKey = jwt({ iss: 'supabase', ref: 'proj', role: 'anon' });
const serviceKey = jwt({ iss: 'supabase', ref: 'proj', role: 'service_role' });
const HTML = '<html><head><meta name="portfolio-analytics" content="true"></head><body></body></html>';
const checks = (problems) => problems.map((p) => p.check);

describe('decodeJwtPayload', () => {
  it('reads claims and returns null for garbage', () => {
    assert.equal(decodeJwtPayload(serviceKey).role, 'service_role');
    assert.equal(decodeJwtPayload('a.b.c'), null);
  });
});

describe('scanBuild', () => {
  it('passes a build carrying only the anon key before the cutover', () => {
    assert.deepEqual(scanBuild({ html: HTML, scripts: [{ name: 'main.js', text: `const k="${anonKey}"` }] }), []);
  });

  it('fails on a service-role key and names the file', () => {
    const problems = scanBuild({ html: HTML, scripts: [{ name: 'main.js', text: `x="${serviceKey}"` }] });
    assert.deepEqual(problems, [{ check: 'service-role-jwt', file: 'main.js', detail: 'service_role key for project proj' }]);
  });

  it('fails on any JWT key once the cutover policy is on', () => {
    const problems = scanBuild({ html: HTML, scripts: [{ name: 'main.js', text: anonKey }] }, { rejectAnyJwt: true });
    assert.deepEqual(checks(problems), ['legacy-jwt-key']);
  });

  it('accepts a publishable key under the cutover policy', () => {
    const text = 'k="sb_publishable_abcDEF123456"';
    assert.deepEqual(scanBuild({ html: HTML, scripts: [{ name: 'main.js', text }] }, { rejectAnyJwt: true }), []);
  });

  it('ignores JWT-shaped tokens that are not Supabase keys', () => {
    const other = jwt({ iss: 'someone-else', role: 'service_role' });
    assert.deepEqual(scanBuild({ html: HTML, scripts: [{ name: 'vendor.js', text: other }] }), []);
  });

  it('fails on secret API keys in every file, not just the first', () => {
    const scripts = [
      { name: 'a.js', text: 'sb_secret_aaaaaaaaaaaa' },
      { name: 'b.js', text: 'sb_secret_bbbbbbbbbbbb' },
    ];
    assert.deepEqual(checks(scanBuild({ html: HTML, scripts })), ['secret-key', 'secret-key']);
  });

  it('fails on every retired admin-login string', () => {
    for (const forbidden of FORBIDDEN_STRINGS) {
      const problems = scanBuild({ html: HTML, scripts: [{ name: 'main.js', text: `"${forbidden}"` }] });
      assert.deepEqual(checks(problems), ['forbidden-string'], forbidden);
    }
  });

  it('reports inline scripts only when that policy is on', () => {
    const html = `${HTML}<script>document.body.classList.add("loaded")</script>`;
    assert.deepEqual(scanBuild({ html, scripts: [] }), []);
    assert.deepEqual(checks(scanBuild({ html, scripts: [] }, { rejectInlineScripts: true })), ['inline-script']);
  });

  it('requires analytics compiled as "true" for production uploads', () => {
    assert.deepEqual(scanBuild({ html: HTML, scripts: [] }, { requireAnalytics: true }), []);
    const off = HTML.replace('content="true"', 'content="false"');
    assert.deepEqual(checks(scanBuild({ html: off, scripts: [] }, { requireAnalytics: true })), ['analytics-flag']);
    const missing = '<html></html>';
    assert.match(scanBuild({ html: missing, scripts: [] }, { requireAnalytics: true })[0].detail, /null/);
  });
});

describe('findInlineScripts', () => {
  it('skips external scripts, JSON-LD and empty blocks', () => {
    const html = [
      '<script src="/static/js/main.js"></script>',
      '<script type="application/ld+json">{"@type":"Person"}</script>',
      '<script></script>',
      '<script>  window.x = 1;  </script>',
      '<script type="module">import "./a.js"</script>',
    ].join('');
    assert.deepEqual(findInlineScripts(html), ['window.x = 1;', 'import "./a.js"']);
  });
});

describe('readAnalyticsStamp', () => {
  it('reads the stamp or returns null', () => {
    assert.equal(readAnalyticsStamp(HTML), 'true');
    assert.equal(readAnalyticsStamp('<html></html>'), null);
  });
});
