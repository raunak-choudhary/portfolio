import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HEIGHT_TOLERANCE_PX, compareCaptures, formatReport, normaliseError } from './compare-captures.mjs';

const style = { color: 'rgb(255, 255, 255)', backgroundColor: 'rgb(0, 0, 0)', fontFamily: 'Inter' };

/** A complete capture record with sensible defaults, overridable per test. */
const record = (overrides = {}) => ({
  shot: 'home-dark-1440',
  documentHeight: 6000,
  documentWidth: 1440,
  horizontalOverflow: false,
  headings: ['h1: Hi', 'h2: About Me'],
  ariaSnapshot: '- heading "Hi" [level=1]',
  style: { body: style, header: style, firstHeading: style, firstCard: null },
  errors: [],
  ...overrides,
});

const kinds = (findings) => findings.map((finding) => finding.kind);

describe('compareCaptures', () => {
  it('reports nothing when a capture is compared with itself', () => {
    assert.deepEqual(compareCaptures([record()], [record()]), []);
  });

  it(`ignores height changes up to ${HEIGHT_TOLERANCE_PX}px and reports larger ones`, () => {
    assert.deepEqual(compareCaptures([record()], [record({ documentHeight: 6010 })]), []);

    const findings = compareCaptures([record()], [record({ documentHeight: 6030 })]);
    assert.deepEqual(kinds(findings), ['height']);
    assert.match(findings[0].detail, /6000px -> 6030px \(\+30\)/);
  });

  it('reports horizontal overflow only when it newly appears', () => {
    assert.deepEqual(kinds(compareCaptures([record()], [record({ horizontalOverflow: true, documentWidth: 900 })])), ['overflow']);
    assert.deepEqual(compareCaptures([record({ horizontalOverflow: true })], [record({ horizontalOverflow: true })]), []);
  });

  it('names removed and added headings', () => {
    const [finding] = compareCaptures([record()], [record({ headings: ['h1: Hi', 'h2: Contact'] })]);
    assert.equal(finding.kind, 'headings');
    assert.equal(finding.detail, '- h2: About Me; + h2: Contact');
  });

  it('reports reordered headings distinctly from changed ones', () => {
    const [finding] = compareCaptures([record()], [record({ headings: ['h2: About Me', 'h1: Hi'] })]);
    assert.equal(finding.detail, 'same headings in a different order');
  });

  it('reports colour and font changes on probed landmarks', () => {
    const changed = { ...style, color: 'rgb(0, 0, 0)' };
    const findings = compareCaptures([record()], [record({ style: { ...record().style, header: changed } })]);
    assert.deepEqual(kinds(findings), ['style']);
    assert.match(findings[0].detail, /^header\.color: rgb\(255, 255, 255\) -> rgb\(0, 0, 0\)$/);
  });

  it('reports only errors the reference run did not have, ignoring host and query differences', () => {
    const before = record({ errors: ['[http 401] POST https://live.example/rest/v1/rpc/x?a=1'] });
    const after = record({
      errors: ['[http 401] POST http://localhost:4173/rest/v1/rpc/x?a=2', '[pageerror] boom'],
    });
    const findings = compareCaptures([before], [after]);
    assert.deepEqual(findings.map((f) => f.detail), ['[pageerror] boom']);
  });

  it('does not report errors that disappeared', () => {
    assert.deepEqual(compareCaptures([record({ errors: ['[console] old failure'] })], [record()]), []);
  });

  it('reports shots missing from either run without failing', () => {
    const findings = compareCaptures([record(), record({ shot: 'skills-dark-375' })], [record()]);
    assert.deepEqual(findings.map((f) => [f.shot, f.kind]), [['skills-dark-375', 'missing-shot']]);
  });

  it('marks allowlisted findings as expected with the reason', () => {
    const allowlist = [{ shot: '*', kind: 'height', pattern: '6000px', reason: 'phone link removed' }];
    const [finding] = compareCaptures([record()], [record({ documentHeight: 5900 })], allowlist);
    assert.equal(finding.expected, true);
    assert.equal(finding.reason, 'phone link removed');
  });

  it('keeps findings unexpected when the allowlist pattern does not match', () => {
    const allowlist = [{ shot: 'other-shot', kind: 'height', reason: 'not this page' }];
    const [finding] = compareCaptures([record()], [record({ documentHeight: 5900 })], allowlist);
    assert.equal(finding.expected, false);
  });
});

describe('normaliseError', () => {
  it('drops hosts, query strings and hashes', () => {
    assert.equal(
      normaliseError('[http 404] GET https://x.example/static/js/main.5ab1939e.js?v=1'),
      '[http 404] GET /static/js/main.<hash>.js',
    );
  });
});

describe('formatReport', () => {
  it('says so when there are no differences', () => {
    assert.equal(formatReport([]), 'No differences.');
  });

  it('lists unexpected findings before expected ones with a summary line', () => {
    const report = formatReport([
      { shot: 'a', kind: 'height', detail: 'x', expected: true, reason: 'known' },
      { shot: 'b', kind: 'aria', detail: 'y', expected: false },
    ]);
    const lines = report.split('\n');
    assert.equal(lines[0], '1 unexpected, 1 expected');
    assert.match(lines[1], /^UNEXPECTED b \[aria\]/);
    assert.match(lines[2], /^expected {3}a \[height\] x {2}\(known\)$/);
  });
});
