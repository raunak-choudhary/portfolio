// scripts/lib/admin-open-path.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAdminOpenPath, normaliseRoute } from './admin-open-path.mjs';

test('dashboard routes are allowed and keep their path', () => {
  for (const value of ['/admindashboard', '/admindashboard/voyage', '/admindashboard/classic']) {
    assert.deepEqual(checkAdminOpenPath(value), { ok: true, route: value });
  }
});

test('the sign-out route is refused in every spelling the router would match', () => {
  for (const value of ['/adminsignout', '/AdminSignOut', '/adminsignout/', 'adminsignout', '/adminsignout?x=1#top', '/%61dminsignout', '//adminsignout', 'http://localhost:3000/adminsignout']) {
    const result = checkAdminOpenPath(value);
    assert.equal(result.ok, false, value);
    assert.equal(result.route, '/adminsignout');
    assert.match(result.message, /signs the owner out/);
    assert.ok(result.message.includes(value), 'the message names what was passed');
  }
});

test('the message names the flag that carried the path', () => {
  assert.match(checkAdminOpenPath('/adminsignout', 'the address').message, /^admin-open refuses the address \/adminsignout:/);
});

test('the login route is refused', () => {
  const result = checkAdminOpenPath('/adminlogin');
  assert.equal(result.ok, false);
  assert.match(result.message, /saved session already signs in/);
});

test('routes that only start like a refused one are allowed', () => {
  assert.equal(checkAdminOpenPath('/adminsignoutx').ok, true);
  assert.equal(checkAdminOpenPath('/adminlogin-help').ok, true);
});

test('normaliseRoute copes with empty and malformed input', () => {
  assert.equal(normaliseRoute(''), '/');
  assert.equal(normaliseRoute(undefined), '/');
  assert.equal(normaliseRoute('/%E0%A4%A'), '/%e0%a4%a');
});
