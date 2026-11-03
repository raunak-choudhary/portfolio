// scripts/lib/compare-captures.mjs
//
// Compares two capture runs (see e2e/capture.spec.mjs) page by page at the
// layout level rather than pixel by pixel. Animated backgrounds make pixel
// diffs noisy, while these signals change only when something a visitor
// would notice changes:
//
//   missing-shot   a shot present in one run and absent in the other
//   height         document height differs by more than the tolerance
//   overflow       horizontal scrolling appears
//   headings       headings added, removed or reordered
//   aria           the accessibility tree of <main> differs
//   style          colour or font of a probed landmark differs
//   console-error  an error appears that the earlier run did not have
//
// An allowlist marks expected differences so a review shows only surprises.

/** Height difference, in CSS pixels, below which pages count as equal. */
export const HEIGHT_TOLERANCE_PX = 24;

/**
 * Normalises an error line so the same problem matches across runs and
 * hosts: drops scheme and host, query strings and long hex hashes.
 */
export function normaliseError(line) {
  return String(line)
    .replace(/https?:\/\/[^/\s]+/g, '')
    .replace(/\?[^\s)]*/g, '')
    .replace(/\b[0-9a-f]{8,}\b/gi, '<hash>')
    .trim();
}

/** True when the finding matches an allowlist entry. */
function isAllowed(finding, allowlist) {
  return allowlist.find(
    (entry) =>
      (entry.shot === '*' || entry.shot === finding.shot) &&
      (entry.kind === '*' || entry.kind === finding.kind) &&
      new RegExp(entry.pattern ?? '.*').test(finding.detail),
  );
}

function compareStyles(shot, before = {}, after = {}) {
  const findings = [];
  for (const landmark of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[landmark];
    const b = after[landmark];
    if (!a && !b) continue;
    if (!a || !b) {
      findings.push({ shot, kind: 'style', detail: `${landmark}: ${a ? 'disappeared' : 'appeared'}` });
      continue;
    }
    for (const property of ['color', 'backgroundColor', 'fontFamily']) {
      if (a[property] !== b[property]) {
        findings.push({ shot, kind: 'style', detail: `${landmark}.${property}: ${a[property]} -> ${b[property]}` });
      }
    }
  }
  return findings;
}

/**
 * Compares two arrays of capture records.
 *
 * @param {object[]} before records from the reference run (e.g. live site).
 * @param {object[]} after records from the candidate run (e.g. local build).
 * @param {{ shot: string, kind: string, pattern?: string, reason: string }[]} [allowlist]
 * @returns {{ shot: string, kind: string, detail: string, expected: boolean, reason?: string }[]}
 */
export function compareCaptures(before, after, allowlist = []) {
  const findings = [];
  const beforeByShot = new Map(before.map((record) => [record.shot, record]));
  const afterByShot = new Map(after.map((record) => [record.shot, record]));

  for (const shot of new Set([...beforeByShot.keys(), ...afterByShot.keys()])) {
    const a = beforeByShot.get(shot);
    const b = afterByShot.get(shot);
    if (!a || !b) {
      findings.push({ shot, kind: 'missing-shot', detail: a ? 'missing from the second run' : 'missing from the first run' });
      continue;
    }

    const heightDelta = (b.documentHeight ?? 0) - (a.documentHeight ?? 0);
    if (Math.abs(heightDelta) > HEIGHT_TOLERANCE_PX) {
      findings.push({ shot, kind: 'height', detail: `${a.documentHeight}px -> ${b.documentHeight}px (${heightDelta > 0 ? '+' : ''}${heightDelta})` });
    }

    if (!a.horizontalOverflow && b.horizontalOverflow) {
      findings.push({ shot, kind: 'overflow', detail: `horizontal scroll appeared (${b.documentWidth}px wide)` });
    }

    const headingsA = a.headings ?? [];
    const headingsB = b.headings ?? [];
    if (JSON.stringify(headingsA) !== JSON.stringify(headingsB)) {
      const removed = headingsA.filter((h) => !headingsB.includes(h));
      const added = headingsB.filter((h) => !headingsA.includes(h));
      const detail = removed.length || added.length
        ? [...removed.map((h) => `- ${h}`), ...added.map((h) => `+ ${h}`)].join('; ')
        : 'same headings in a different order';
      findings.push({ shot, kind: 'headings', detail });
    }

    if ((a.ariaSnapshot ?? '') !== (b.ariaSnapshot ?? '')) {
      findings.push({ shot, kind: 'aria', detail: 'accessibility tree of <main> differs' });
    }

    findings.push(...compareStyles(shot, a.style, b.style));

    const knownErrors = new Set((a.errors ?? []).map(normaliseError));
    for (const error of new Set((b.errors ?? []).map(normaliseError))) {
      if (!knownErrors.has(error)) findings.push({ shot, kind: 'console-error', detail: error });
    }
  }

  return findings.map((finding) => {
    const entry = isAllowed(finding, allowlist);
    return entry ? { ...finding, expected: true, reason: entry.reason } : { ...finding, expected: false };
  });
}

/** Renders findings as a plain-text report, unexpected ones first. */
export function formatReport(findings) {
  if (findings.length === 0) return 'No differences.';
  const ordered = [...findings].sort((x, y) => Number(x.expected) - Number(y.expected));
  const unexpected = ordered.filter((f) => !f.expected).length;
  const lines = ordered.map((f) =>
    `${f.expected ? 'expected  ' : 'UNEXPECTED'} ${f.shot} [${f.kind}] ${f.detail}${f.reason ? `  (${f.reason})` : ''}`,
  );
  return [`${unexpected} unexpected, ${findings.length - unexpected} expected`, ...lines].join('\n');
}
