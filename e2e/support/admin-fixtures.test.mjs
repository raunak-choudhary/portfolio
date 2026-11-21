// e2e/support/admin-fixtures.test.mjs
//
// The router's pure parts, plus a hygiene check on the admin fixtures: they
// are synthetic by rule (TEST- records, example.test addresses, no project
// host), and this test keeps them that way.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { STORAGE_PLACEHOLDER, classifyUrl, expandFixtureText, listStorageLevel } from './admin-fixtures.mjs';

const ORIGIN = 'https://abcdefghijklmnop.supabase.co';

test('classifyUrl separates the local build, the project and the stand-ins', () => {
  assert.equal(classifyUrl('http://localhost:4173/admindashboard', ORIGIN), 'local');
  assert.equal(classifyUrl(`${ORIGIN}/rest/v1/projects?select=*`, ORIGIN), 'supabase');
  assert.equal(classifyUrl('https://fonts.gstatic.com/s/x.woff2', ORIGIN), 'font');
  assert.equal(classifyUrl('https://sdo.gsfc.nasa.gov/assets/img/latest/x.jpg', ORIGIN), 'image');
  assert.equal(classifyUrl('https://example.test/repo', ORIGIN), 'image');
});

test('classifyUrl treats any other host, including another Supabase project, as unknown', () => {
  assert.equal(classifyUrl('https://otherproject1234.supabase.co/rest/v1/projects', ORIGIN), 'other');
  assert.equal(classifyUrl('http://localhost:3000/', ORIGIN), 'other');
  assert.equal(classifyUrl('https://example.test.evil.com/', ORIGIN), 'other');
});

test('expandFixtureText points the placeholder at the public storage path', () => {
  assert.equal(
    expandFixtureText(`"${STORAGE_PLACEHOLDER}/fixtures/a.png"`, ORIGIN),
    `"${ORIGIN}/storage/v1/object/public/fixtures/a.png"`,
  );
});

test('listStorageLevel answers one folder level the way storage does, paged', () => {
  const objects = [
    { name: 'b.png', size: 2, mimetype: 'image/png', updated_at: 't' },
    { name: 'alpha/cover.png', size: 1, mimetype: 'image/png', updated_at: 't' },
    { name: 'alpha/deep/x.png', size: 1, mimetype: 'image/png', updated_at: 't' },
    { name: 'a.png', size: 3, mimetype: 'image/png', updated_at: 't' },
  ];
  const top = listStorageLevel(objects, { prefix: '' });
  assert.deepEqual(top.map((e) => e.name), ['a.png', 'alpha', 'b.png']);
  assert.deepEqual(top[1], { id: null, name: 'alpha', metadata: null });   // a folder: no id, no metadata
  assert.deepEqual(top[0].metadata, { size: 3, mimetype: 'image/png' });
  assert.deepEqual(listStorageLevel(objects, { prefix: 'alpha' }).map((e) => e.name), ['cover.png', 'deep']);
  assert.deepEqual(listStorageLevel(objects, { prefix: 'alpha/deep/' }).map((e) => e.name), ['x.png']);
  assert.deepEqual(listStorageLevel(objects, { prefix: '', limit: 2, offset: 2 }).map((e) => e.name), ['b.png']);
  assert.deepEqual(listStorageLevel([], {}), []);
});

const FIXTURE_ROOT = path.resolve('e2e/fixtures/admin');
const fixtureFiles = readdirSync(FIXTURE_ROOT, { recursive: true })
  .filter((file) => file.endsWith('.json'))
  .map((file) => [file, readFileSync(path.join(FIXTURE_ROOT, file), 'utf8')]);

test('admin fixtures are valid JSON', () => {
  assert.ok(fixtureFiles.length > 10);
  for (const [file, text] of fixtureFiles) assert.doesNotThrow(() => JSON.parse(text), file);
});

test('admin fixtures hold no real addresses or project hosts', () => {
  for (const [file, text] of fixtureFiles) {
    const emails = text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? [];
    for (const email of emails) assert.match(email, /@example\.test$/, `${file}: ${email}`);
    assert.doesNotMatch(text, /supabase\.co/, `${file} names a Supabase host`);
    for (const url of text.match(/https?:\/\/[^\s"']+/g) ?? []) {
      assert.match(new URL(url).hostname, /(^|\.)example\.test$/, `${file}: ${url}`);
    }
  }
});

test('every admin fixture record is marked as test data', () => {
  for (const [file, text] of fixtureFiles) {
    if (!file.startsWith('tables')) continue;
    for (const row of JSON.parse(text)) {
      if (typeof row.id === 'string') assert.match(row.id, /^TEST-/, `${file}: ${row.id}`);
      for (const key of ['title', 'name', 'skill_name', 'recommender_name', 'record_title', 'degree']) {
        if (typeof row[key] === 'string') assert.match(row[key], /^TEST- /, `${file}: ${key}`);
      }
    }
  }
});
