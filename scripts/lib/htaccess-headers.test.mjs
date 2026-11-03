import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { headersForFile, parseHtaccessHeaders } from './htaccess-headers.mjs';

const SAMPLE = `
# Security headers
<IfModule mod_headers.c>
  Header always set Content-Security-Policy "default-src 'self'; script-src 'self'"
  Header set X-Content-Type-Options nosniff
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  # Header set Ignored "commented out"
  <FilesMatch "^index\\.html$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>
RewriteEngine On
`;

describe('parseHtaccessHeaders', () => {
  it('reads set directives with quoted and bare values, skipping comments and other directives', () => {
    const rules = parseHtaccessHeaders(SAMPLE);
    assert.deepEqual(rules.map((r) => [r.name, r.value]), [
      ['Content-Security-Policy', "default-src 'self'; script-src 'self'"],
      ['X-Content-Type-Options', 'nosniff'],
      ['Referrer-Policy', 'strict-origin-when-cross-origin'],
      ['Cache-Control', 'no-cache'],
    ]);
  });

  it('scopes directives inside FilesMatch to matching files', () => {
    const rules = parseHtaccessHeaders(SAMPLE);
    assert.equal(headersForFile(rules, 'index.html')['Cache-Control'], 'no-cache');
    assert.equal(headersForFile(rules, 'main.5ab1939e.js')['Cache-Control'], undefined);
    assert.equal(headersForFile(rules, 'main.5ab1939e.js')['X-Content-Type-Options'], 'nosniff');
  });

  it('returns no rules for empty or missing content', () => {
    assert.deepEqual(parseHtaccessHeaders(''), []);
    assert.deepEqual(parseHtaccessHeaders(undefined), []);
  });

  it('lets a later set replace an earlier one and append add to it', () => {
    const rules = parseHtaccessHeaders([
      'Header set X-Test "one"',
      'Header set X-Test "two"',
      'Header append Vary "Accept"',
      'Header append Vary "Origin"',
    ].join('\n'));
    const headers = headersForFile(rules, 'index.html');
    assert.equal(headers['X-Test'], 'two');
    assert.equal(headers.Vary, 'Accept, Origin');
  });
});
