import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveRequestPath } from './static-server.mjs';

const root = path.resolve('build');

describe('resolveRequestPath', () => {
  it('maps a URL path to a file under the root', () => {
    assert.equal(resolveRequestPath('build', '/static/js/main.js'), path.join(root, 'static/js/main.js'));
  });

  it('ignores the query string', () => {
    assert.equal(resolveRequestPath('build', '/favicon.ico?v=2'), path.join(root, 'favicon.ico'));
  });

  it('decodes percent-encoded characters', () => {
    assert.equal(resolveRequestPath('build', '/a%20b.png'), path.join(root, 'a b.png'));
  });

  it('refuses paths that escape the root after decoding', () => {
    // An encoded slash survives URL parsing and only becomes a separator
    // once decoded, so this is the case the explicit guard exists for.
    assert.equal(resolveRequestPath('build', '/..%2f..%2f.env.production'), null);
    assert.equal(resolveRequestPath('build', '/static/..%2f..%2f..%2fpackage.json'), null);
  });

  it('never resolves outside the root, whatever the dot segments', () => {
    // Plain and percent-encoded dot segments are collapsed by URL parsing
    // before the guard runs; they must still land inside the root.
    for (const url of ['/../package.json', '/%2e%2e/package.json', '/static/%2e%2e/%2e%2e/.env.production']) {
      const resolved = resolveRequestPath('build', url);
      assert.ok(resolved === null || resolved.startsWith(root + path.sep), `${url} -> ${resolved}`);
    }
  });
});
