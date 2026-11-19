// src/components/admin/Voyage/fixQueueModel.js
//
// The fix queue as pure data: the health rules (SECTION_HEALTH_RULES) run
// over the loaded rows, turned from a score into a list of work.
//
// A group is one rule gap in one section: a quality group (projects without
// a picture) or a required field (leadership roles without an organisation).
// Its rule key is `<table>:<group name or field>`, with spaces in a group
// name written as hyphens (`internships:company-logo`). The key is what a
// dismissal stores, so it must never change for an existing rule.
//
// The gain of one item is the health arithmetic run forward. A section's
// completeness is the average item score (70 for required fields, 30 for
// quality groups, split evenly) times the volume multiplier
// min(1, active / minItems); the portfolio score is the weight-averaged
// completeness. So one item is worth
//   quality:  weight / totalWeight x (30 / groups) / N x volume
//   required: weight / totalWeight x (70 / fields) / N x volume
// points, where N is the section's active row count. The queue works on the
// unrounded (precise) score; the integer `score` is exactly what the
// existing health summary reports, kept for comparison.
//
// Dismissed items ("Not needed") leave the queue and count as passing in
// `scoreWithDismissals`. The queue and the tile show that number and say so
// when it differs from the plain one.
//
// No React, no network, no clock: `now` is passed in where time matters.

import {
  QUALITY_SHARE,
  REQUIRED_SHARE,
  DEFAULT_MIN_DESCRIPTION_LENGTH,
  SECTION_HEALTH_RULES,
  evaluateContentSectionHealth,
  fieldIsComplete,
  getRowLabel,
  hasAnyFieldValue,
  hasUsableValue,
  isActiveContentRow,
  summarizePortfolioHealth,
} from '../../../services/analyticsService';
import { CHAPTERS } from './chapters';
import { pickSingleton } from './managers/schemaModel';

/** Tables the voyage edits as one row (SingletonChapter): only the row it shows can be walked. */
export const SINGLETON_TABLES = Object.freeze(['hero_content', 'about_content']);

/** A section not edited for longer than this is listed under "Not touched for a while". */
export const STALE_DAYS = 90;
/** The longest reason a dismissal keeps (the table's check constraint). */
export const NOTE_MAX = 140;

const DAY_MS = 86400000;
const SEVERITY_RANK = Object.freeze({ critical: 0, warning: 1, info: 2 });

/** One decimal, for display. */
export const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

/** "+1.8" style text for a gain. */
export const gainText = (n) => `+${round1(n).toFixed(1)}`;

/** The column that names a row on its card, per table (EDITED_TABLES uses the same idea). */
const LABEL_COLUMN = Object.freeze({
  hero_content: 'title', about_content: 'about_me_title', projects: 'title', internships: 'title', education: 'degree',
  work_experience: 'title', skills: 'skill_name', certifications: 'title', recommendations: 'recommender_name', achievements: 'title', leadership: 'title',
});

/** How a section names one and several of its records in a sentence. */
const NOUNS = Object.freeze({
  hero_content: ['hero section', 'hero sections'], about_content: ['About section', 'About sections'], projects: ['project', 'projects'],
  internships: ['internship', 'internships'], education: ['education entry', 'education entries'], work_experience: ['role', 'roles'],
  skills: ['skill', 'skills'], certifications: ['certification', 'certifications'], recommendations: ['recommendation', 'recommendations'],
  achievements: ['achievement', 'achievements'], leadership: ['leadership role', 'leadership roles'],
});
/** Tables that hold one record: their sentences read "The hero section ..." instead of "1 hero section ...". */
const SINGLE_TABLES = new Set(['hero_content', 'about_content']);

/** Field names as the owner reads them in the form. */
const FIELD_NAMES = Object.freeze({
  about_me_title: 'title', about_me_content: 'about text', short_description: 'short description', skill_name: 'skill name',
  recommender_name: "recommender's name", content: 'recommendation text', cta_link: 'call-to-action link',
});
export const fieldName = (field) => FIELD_NAMES[field] || String(field).replace(/_/g, ' ');

/**
 * Per quality group: what the gap is called in a title (singular and plural
 * verb phrase), the task in the record dialog, and the filter it falls under.
 */
const QUALITY_COPY = Object.freeze({
  'projects:images': { has: ['has no picture', 'have no picture'], task: 'add a picture' },
  'projects:proof': { has: ['has no GitHub or live link', 'have no GitHub or live link'], task: 'add a GitHub or live link' },
  'internships:proof': { has: ['has no certificate or proof link', 'have no certificate or proof link'], task: 'add a certificate or proof link' },
  'certifications:proof': { has: ['has no certificate or verification link', 'have no certificate or verification link'], task: 'add a certificate or verification link' },
  'certifications:badge': { has: ['has no badge image', 'have no badge image'], task: 'add a badge image' },
  'recommendations:recommender-proof': { has: ['has no LinkedIn link for the recommender', 'have no LinkedIn link for the recommender'], task: "add the recommender's LinkedIn link" },
  'achievements:proof': { has: ['has no certificate or proof link', 'have no certificate or proof link'], task: 'add a certificate or proof link' },
  'about_content:profile-image': { has: ['has no profile picture', 'have no profile picture'], task: 'add a profile picture' },
  'hero_content:cta': { has: ['has no call-to-action link', 'have no call-to-action link'], task: 'add a call-to-action link' },
  'skills:category': { has: ['has no category', 'have no category'], task: 'choose a category' },
});

/** The recruiter-facing reason per group. Unknown keys fall back by kind. */
export const WHY = Object.freeze({
  'projects:images': 'A card with a screenshot is flipped far more often than a text-only one; the picture is what makes a recruiter stop scrolling.',
  'projects:proof': 'A recruiter who cannot open the code or a live demo has to take the card on trust. A repository link turns a claim into something they can check.',
  'internships:proof': 'Proof turns a line on a page into a fact. An offer letter or completion certificate is enough.',
  'internships:company-logo': 'A logo is recognised before the name is read, and it makes the timeline scan as real companies.',
  'work_experience:company-logo': 'A logo is recognised before the name is read, and it makes the timeline scan as real companies.',
  'education:institution-logo': 'The crest is the quickest way to place a degree; without it the card reads as plain text.',
  'certifications:badge': 'Badges are recognised at a glance; a list of names without them reads as filler.',
  'certifications:proof': 'A certificate with a verification link can be checked in one click; without it the line is easy to doubt.',
  'recommendations:recommender-proof': 'A quote anyone could write; a quote with a profile link is a reference.',
  'achievements:proof': 'A certificate or a results page turns an award into a fact a recruiter can check.',
  'achievements:description': 'Say what you did and what it beat: the field, the number of teams, the result.',
  'about_content:profile-image': 'A face makes the About section personal; without one the page reads like a form.',
  'hero_content:cta': 'The first screen should give a recruiter something to do next: open the work or get in touch.',
  'skills:category': 'Uncategorised skills fall to the bottom of the Skills page, under every group.',
});
const WHY_MISSING = 'Visitors see an empty space where this should be, which reads as unfinished.';
const WHY_WEAK = `A line under ${DEFAULT_MIN_DESCRIPTION_LENGTH} characters says what but not how: the problem, the method and the result are what a recruiter reads for.`;
const WHY_QUALITY = 'Small proof like this is what separates a claim from a fact on a recruiter\'s first pass.';

/** `<table>:<group name or field>`, spaces as hyphens. */
export const ruleKeyFor = (table, name) => `${table}:${String(name).trim().replace(/\s+/g, '-')}`;

/** The chapter that manages a table (for opening a record or a section). */
export const chapterForTable = (table) => CHAPTERS.find((c) => c.table === table)?.id || null;

const nounFor = (table, n) => { const [one, many] = NOUNS[table] || ['item', 'items']; return n === 1 ? one : many; };

/** "18 projects have no picture", "The hero section has no call-to-action link". */
function countPhrase(table, n, [one, many]) {
  if (SINGLE_TABLES.has(table) && n === 1) return `The ${nounFor(table, 1)} ${one}`;
  return `${n} ${nounFor(table, n)} ${n === 1 ? one : many}`;
}

/** A row's display label. */
export const rowLabel = (table, row = {}) => {
  const value = row[LABEL_COLUMN[table]];
  return (typeof value === 'string' && value.trim()) ? value.trim() : String(getRowLabel(row));
};

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/**
 * Does one row pass one rule check? Used by the fix walk after a save to say
 * honestly whether the item is fixed.
 * A row switched off is not a fix: it leaves the score, but the gap is still
 * there, so it reports passes: false with state 'hidden'.
 * @returns {{passes: boolean, state: 'missing'|'weak'|'hidden'|null, inactive?: boolean}}
 */
export function checkItem(ruleKey, row, rules = SECTION_HEALTH_RULES) {
  const target = findRuleTarget(ruleKey, rules);
  if (!target || !row) return { passes: false, state: 'missing' };
  if (!isActiveContentRow(row)) return { passes: false, state: 'hidden', inactive: true };
  const { rule, group, field } = target;
  if (group) return hasAnyFieldValue(row, group.fields) ? { passes: true, state: null } : { passes: false, state: 'missing' };
  if (fieldIsComplete(row, field, rule)) return { passes: true, state: null };
  return { passes: false, state: hasUsableValue(row[field]) ? 'weak' : 'missing' };
}

/** The rule and the quality group or required field a rule key names. */
export function findRuleTarget(ruleKey, rules = SECTION_HEALTH_RULES) {
  for (const rule of rules) {
    for (const group of rule.qualityGroups || []) if (ruleKeyFor(rule.table, group.name) === ruleKey) return { rule, group, field: null };
    for (const field of rule.requiredFields || []) if (ruleKeyFor(rule.table, field) === ruleKey) return { rule, group: null, field };
  }
  return null;
}

/** Which filter chip a group falls under besides All (and Critical by severity). */
function categoryOf(group) {
  if (group.issueType === 'missing_image') return 'images';
  if (group.issueType === 'missing_proof_link') return 'proof';
  return 'writing';
}

/** The precise (unrounded) section contributions and the gaps of one section. */
function evaluateSection(rule, rows, totalWeight) {
  const active = (Array.isArray(rows) ? rows : []).filter(isActiveContentRow);
  const n = active.length;
  const required = rule.requiredFields || [];
  const quality = rule.qualityGroups || [];
  const share = (rule.weight || 0) / totalWeight;
  if (!n) return { precise: 0, gaps: [] };
  const volume = Math.min(1, n / (rule.minItems || 1));
  const requiredEach = required.length ? (share * (REQUIRED_SHARE / required.length) / n) * volume : 0;
  const qualityEach = quality.length ? (share * (QUALITY_SHARE / quality.length) / n) * volume : 0;
  let itemTotal = 0;
  const gaps = [];
  active.forEach((row) => {
    const label = rowLabel(rule.table, row);
    const doneRequired = required.filter((f) => fieldIsComplete(row, f, rule)).length;
    const doneQuality = quality.filter((g) => hasAnyFieldValue(row, g.fields)).length;
    itemTotal += (required.length ? (doneRequired / required.length) * REQUIRED_SHARE : REQUIRED_SHARE)
      + (quality.length ? (doneQuality / quality.length) * QUALITY_SHARE : QUALITY_SHARE);
    required.forEach((field) => {
      if (fieldIsComplete(row, field, rule)) return;
      const weak = (rule.descriptionFields || []).includes(field) && hasUsableValue(row[field]);
      gaps.push({ ruleKey: ruleKeyFor(rule.table, field), recordId: row.id, label, gain: requiredEach, state: weak ? 'weak' : 'missing', severity: weak ? 'info' : 'critical' });
    });
    quality.forEach((group) => {
      if (hasAnyFieldValue(row, group.fields)) return;
      gaps.push({ ruleKey: ruleKeyFor(rule.table, group.name), recordId: row.id, label, gain: qualityEach, state: 'missing', severity: group.issueType === 'missing_required_field' ? 'critical' : 'warning' });
    });
  });
  return { precise: share * (itemTotal / n) * volume, gaps };
}

/** Title, task and why for a group from its items. */
function describeGroup(rule, def, items) {
  const n = items.length;
  if (def.group) {
    const key = ruleKeyFor(rule.table, def.group.name);
    const copy = QUALITY_COPY[key] || { has: [`has no ${def.group.label}`, `have no ${def.group.label}`], task: `add the ${def.group.label}` };
    return { title: countPhrase(rule.table, n, copy.has), why: WHY[key] || WHY_QUALITY, fieldLabel: capital(def.group.label), task: () => copy.task };
  }
  const key = ruleKeyFor(rule.table, def.field);
  const name = fieldName(def.field);
  const weak = items.filter((i) => i.state === 'weak').length;
  const min = rule.minDescriptionLength || DEFAULT_MIN_DESCRIPTION_LENGTH;
  const has = weak === 0 ? [`has no ${name}`, `have no ${name}`]
    : weak === n ? [`has a ${name} under ${min} characters`, `have a ${name} under ${min} characters`]
      : [`needs a ${name} of ${min} characters or more`, `need a ${name} of ${min} characters or more`];
  return {
    title: countPhrase(rule.table, n, has),
    why: WHY[key] || (weak === n ? WHY_WEAK : WHY_MISSING),
    fieldLabel: capital(name),
    task: (item) => (item.state === 'weak' ? `write a longer ${name}` : `fill in the ${name}`),
  };
}

/** Is one gap covered by a dismissal? A dismissal without a record id covers the whole group. */
const dismissalFor = (dismissals, gap) => dismissals.find((d) => d.ruleKey === gap.ruleKey && (d.recordId == null || sameId(d.recordId, gap.recordId)));

/**
 * The whole queue.
 * @param {object} input
 * @param {Object<string, Array<object>|null>} input.rowsByTable rows per table; null (or missing) = the table failed to load.
 * @param {Array<{id, ruleKey, recordId, note, createdAt}>} [input.dismissals]
 * @param {Array<object>} [input.rules] defaults to SECTION_HEALTH_RULES.
 */
export function buildFixQueue({ rowsByTable = {}, dismissals = [], rules = SECTION_HEALTH_RULES } = {}) {
  const totalWeight = rules.reduce((s, r) => s + (r.weight || 0), 0) || 1;
  const list = Array.isArray(dismissals) ? dismissals : [];
  const unavailable = [];
  const sections = [];
  let precise = 0, dismissedGain = 0;
  const groups = [];
  const coveredBy = new Map();   // dismissal id -> number of items it currently hides

  rules.forEach((rule) => {
    const rows = rowsByTable[rule.table];
    if (!Array.isArray(rows)) {
      unavailable.push(rule.name);
      sections.push({ name: rule.name, table: rule.table, weight: rule.weight || 0, completeness: 0, issues: [] });
      return;
    }
    sections.push(evaluateContentSectionHealth(rule, rows));
    const { precise: part, gaps: allGaps } = evaluateSection(rule, rows, totalWeight);
    precise += part;
    // a singleton chapter edits one row; gaps on any extra row cannot be walked there
    const shown = SINGLETON_TABLES.includes(rule.table) ? pickSingleton(rows.filter(isActiveContentRow)) : null;
    const gaps = shown ? allGaps.filter((g) => sameId(g.recordId, shown.id)) : allGaps;
    const defs = [
      ...(rule.requiredFields || []).map((field) => ({ field, group: null, issueType: 'missing_required_field' })),
      ...(rule.qualityGroups || []).map((group) => ({ field: null, group, issueType: group.issueType || 'quality_gap' })),
    ];
    defs.forEach((def) => {
      const ruleKey = ruleKeyFor(rule.table, def.group ? def.group.name : def.field);
      const all = gaps.filter((g) => g.ruleKey === ruleKey);
      const open = [];
      all.forEach((gap) => {
        const d = dismissalFor(list, gap);
        if (d) { dismissedGain += gap.gain; coveredBy.set(d.id, (coveredBy.get(d.id) || 0) + 1); } else open.push(gap);
      });
      if (!open.length) return;
      const copy = describeGroup(rule, def, open);
      const items = open.map((gap) => ({ ...gap, task: copy.task(gap) }));
      const severity = items.reduce((best, i) => (SEVERITY_RANK[i.severity] < SEVERITY_RANK[best] ? i.severity : best), 'info');
      groups.push({
        ruleKey, table: rule.table, section: rule.name, chapterId: chapterForTable(rule.table),
        kind: def.group ? 'quality' : 'required', issueType: def.issueType, category: categoryOf(def),
        fields: def.group ? [...def.group.fields] : [def.field], fieldLabel: copy.fieldLabel,
        title: copy.title, why: copy.why, severity, gain: items.reduce((s, i) => s + i.gain, 0), items,
      });
    });
  });

  // ties are judged on the gain as shown (one decimal), so the severity tie-break can work
  groups.sort((a, b) => (round1(b.gain) - round1(a.gain)) || (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) || a.title.localeCompare(b.title));
  const totalGain = groups.reduce((s, g) => s + g.gain, 0);
  const withDismissals = precise + dismissedGain;
  return {
    score: summarizePortfolioHealth(sections).score,   // identical to the existing health summary
    preciseScore: precise,
    scoreWithDismissals: withDismissals,
    afterEveryFix: Math.min(100, withDismissals + totalGain),
    // the real score once every open item is fixed, dismissed items still counted as gaps
    afterOpenFixes: Math.min(100, precise + totalGain),
    totalGain,
    groups,
    dismissed: describeDismissals(list, rowsByTable, rules, coveredBy),
    unavailable,
  };
}

/** The "Marked not needed" list: what each dismissal hides, in words. */
function describeDismissals(list, rowsByTable, rules, coveredBy) {
  return list.map((d) => {
    const target = findRuleTarget(d.ruleKey, rules);
    if (!target) return { ...d, title: 'A check that no longer exists', covers: 0 };
    const { rule, group, field } = target;
    const what = group ? (QUALITY_COPY[d.ruleKey]?.has[0] || `has no ${group.label}`) : `has no ${fieldName(field)}`;
    if (d.recordId == null) {
      const [, many] = NOUNS[rule.table] || ['item', 'items'];
      const plural = group ? (QUALITY_COPY[d.ruleKey]?.has[1] || `have no ${group.label}`) : `have no ${fieldName(field)}`;
      return { ...d, title: `All ${many} that ${plural}`, section: rule.name, covers: coveredBy.get(d.id) || 0 };
    }
    const row = (rowsByTable[rule.table] || []).find((r) => sameId(r.id, d.recordId));
    const label = row ? rowLabel(rule.table, row) : `A removed ${nounFor(rule.table, 1)}`;
    return { ...d, title: `${label} ${what}`, section: rule.name, covers: coveredBy.get(d.id) || 0 };
  });
}

/**
 * The numbers the queue and the Fix next tile show. The plain score comes
 * first: items marked not needed still count as gaps there. When any are
 * marked, the flattering figure that counts them as passing is offered
 * alongside, never instead.
 * @returns {{now: number, after: number, counted: number, withDismissals: number, line: string}}
 */
export function scoreSummary(model) {
  const now = round1(model.preciseScore);
  const after = round1(model.afterOpenFixes);
  const counted = model.dismissed.reduce((sum, d) => sum + (d.covers || 0), 0);
  const withDismissals = round1(model.scoreWithDismissals);
  const marked = counted ? `, ${withDismissals.toFixed(1)} counting ${counted} marked not needed` : '';
  return { now, after, counted, withDismissals, line: `${now.toFixed(1)} now${marked}, ${after.toFixed(1)} after every fix` };
}

/** Groups under one filter chip. */
export const FILTERS = Object.freeze([
  { id: 'all', label: 'All' }, { id: 'critical', label: 'Critical' }, { id: 'images', label: 'Images' }, { id: 'proof', label: 'Proof links' }, { id: 'writing', label: 'Writing' },
]);
export function filterGroups(groups, filter) {
  if (filter === 'critical') return groups.filter((g) => g.severity === 'critical');
  if (filter === 'images' || filter === 'proof' || filter === 'writing') return groups.filter((g) => g.category === filter);
  return groups;
}
/** Only the chips that would show something (All always). */
export const availableFilters = (groups) => FILTERS.filter((f) => f.id === 'all' || filterGroups(groups, f.id).length > 0);

/** Severity in words. */
export const SEVERITY_LABEL = Object.freeze({ critical: 'Critical', warning: 'Warning', info: 'Tip' });

/**
 * Sections not edited for more than STALE_DAYS, oldest first. They change
 * nothing in the score; the queue lists them with a Review button.
 * @param {Array<{table: string, section: string, at: string|null}>} freshness
 */
export function staleSections(freshness, now = new Date(), days = STALE_DAYS) {
  return (Array.isArray(freshness) ? freshness : [])
    .filter((f) => f && f.at)
    .map((f) => ({ ...f, days: Math.floor((now.getTime() - Date.parse(f.at)) / DAY_MS), chapterId: chapterForTable(f.table) }))
    .filter((f) => Number.isFinite(f.days) && f.days > days)
    .sort((a, b) => b.days - a.days);
}

/**
 * "How the score works", from the real rules: every weight, the 70/30
 * split, the description length and the volume targets.
 */
export function scoreExplainer(rules = SECTION_HEALTH_RULES) {
  const total = rules.reduce((s, r) => s + (r.weight || 0), 0);
  const weights = [...rules].sort((a, b) => (b.weight || 0) - (a.weight || 0)).map((r) => `${r.name} ${r.weight}`).join(', ');
  const targets = rules.filter((r) => (r.minItems || 1) > 1).map((r) => `${r.name} ${r.minItems}`).join(', ');
  return [
    `Each section has a weight: ${weights}; ${total} in all.`,
    `Inside a section every record earns ${REQUIRED_SHARE} for its required fields and ${QUALITY_SHARE} for its quality checks (pictures, proof links), and a description counts once it reaches ${DEFAULT_MIN_DESCRIPTION_LENGTH} characters.`,
    targets ? `A section with fewer records than its target (${targets}) is scaled down.` : '',
    'The gain beside each fix is that arithmetic run forward, so the queue is ordered by what moves the score most.',
  ].filter(Boolean).join(' ');
}

/**
 * The form field the record dialog rings: the first of the group's columns
 * the manager's form actually has.
 */
export function resolveTargetField(schema, fields) {
  const keys = new Set((schema?.fields || []).map((f) => f.key));
  return (fields || []).find((k) => keys.has(k)) || null;
}

/**
 * The record intent that starts a walk through a group (or one item of it).
 * Extra walk facts (labels, gains, task, the score at the start) ride along
 * so the dialog can show the banner without reloading the queue.
 */
export function walkIntent(group, { startId = null, field = null, score = 0 } = {}) {
  const items = group.items.map((i) => ({ id: i.recordId, label: i.label, gain: i.gain, task: i.task, state: i.state }));
  const index = startId == null ? 0 : Math.max(0, items.findIndex((i) => sameId(i.id, startId)));
  return {
    table: group.table, recordId: items[index]?.id ?? null, mode: 'edit', field,
    walk: { ruleKey: group.ruleKey, ids: items.map((i) => i.id), index, items, title: group.title, why: group.why, fieldLabel: group.fieldLabel, score, fixed: [] },
  };
}

/** The intent for the next item, or null at the end of the walk. */
export function stepIntent(intent, { fixedGain = 0 } = {}) {
  if (!intent?.walk) return null;
  const { walk } = intent;
  const fixed = fixedGain ? [...walk.fixed, walk.ids[walk.index]] : walk.fixed;
  const index = walk.index + 1;
  if (index >= walk.ids.length) return null;
  return { ...intent, recordId: walk.ids[index], walk: { ...walk, index, fixed, score: walk.score + fixedGain } };
}

const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
