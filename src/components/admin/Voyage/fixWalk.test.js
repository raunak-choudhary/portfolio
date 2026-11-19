/* eslint-disable testing-library/no-container, testing-library/no-node-access */
// The fix walk end to end, below the page: the queue starts a walk through a
// group, the deck chapter opens each record in fix mode (banner, Missing tag,
// focus on the target field, "Save and next"), a save reports the new score,
// Next moves to the following record and Back to the queue ends the walk.
// Saves are mocked; nothing reaches a database.

import DeckChapter from './DeckChapter';
import SingletonChapter from './SingletonChapter';
import { fixBannerCopy } from './RecordDialog';
import { buildFixQueue } from './fixQueueModel';
import { startWalk } from './FixQueuePane';
import { clearIntent, fixesChanged, openRecord, queueRequests, recordIntent, setIntent } from './recordIntent';
import { walkIntent } from './fixQueueModel';
import { projectsSchema } from './managers/projects.schema';
import { heroSchema } from './managers/hero.schema';
import { React, act, click, mount, setInputValue } from '../SkyBackground/testUtils';

jest.mock('../../../services/supabaseClient', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('../../../services/fixDismissalsService', () => ({ listDismissals: jest.fn(), dismiss: jest.fn(), restore: jest.fn() }));
jest.mock('../../../services/fixQueueData', () => ({ loadFixQueueData: jest.fn(() => new Promise(() => {})) }));
jest.mock('../../../services/voyageRecords', () => ({
  listRecords: jest.fn(), saveRecord: jest.fn(), deleteRecord: jest.fn(), reorderRecords: jest.fn(), uploadImages: jest.fn(), removeImage: jest.fn(), imageProblems: jest.fn(), failureKind: jest.fn(), fetchUpdatedAt: jest.fn(), getRecord: jest.fn(),
  fileProblems: jest.fn(), uploadFieldFiles: jest.fn(), removeStoredFiles: jest.fn(),
}));
const records = jest.requireMock('../../../services/voyageRecords');
const flush = () => act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
const LONG = 'A short description that is comfortably over forty characters.';
const rows = [
  { id: 'a', title: 'Alpha', short_description: LONG, image_urls: ['https://example.com/a.png'], github_urls: [], status: 'active', order_index: 1, technologies: [] },
  { id: 'b', title: 'Bravo', short_description: LONG, image_urls: ['https://example.com/b.png'], github_urls: [], status: 'active', order_index: 2, technologies: [] },
  { id: 'c', title: 'Gamma', short_description: LONG, image_urls: ['https://example.com/c.png'], github_urls: ['https://github.com/x/y'], status: 'active', order_index: 3, technologies: [] },
];
const dialogButton = (text) => [...document.querySelectorAll('.record-dialog button')].find((b) => b.textContent.trim() === text);
const banner = () => document.querySelector('[data-testid="fix-banner"]');
const dialog = () => document.querySelector('[data-testid="record-dialog"]');
const liveInput = () => document.querySelector('.record-form [data-field="live_url"] input');
// every mounted view is unmounted after its test, even a failed one, so no chapter keeps listening to the intent store
let views = [];
const show = (element) => { const view = mount(element); views.push(view); return view; };

describe('the fix walk', () => {
  let notify;
  beforeEach(() => {
    notify = jest.fn();
    records.listRecords.mockResolvedValue(rows.map((r) => ({ ...r })));
    records.saveRecord.mockImplementation(async (_s, payload, id) => ({ ...rows.find((r) => r.id === id), ...payload, id }));
    records.fetchUpdatedAt.mockResolvedValue(null);
  });
  afterEach(() => { views.forEach((v) => v.unmount()); views = []; act(() => clearIntent()); document.body.innerHTML = ''; delete Element.prototype.scrollIntoView; });

  it('walks two records with mocked saves: banner, Missing tag, focus, Save and next, Fixed, Next, Back to the queue', async () => {
    const model = buildFixQueue({ rowsByTable: { projects: rows } });
    const group = model.groups.find((g) => g.ruleKey === 'projects:proof');
    expect(group.items.map((i) => i.recordId).sort()).toEqual(['a', 'b']);
    const [first, second] = group.items;

    show(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    act(() => startWalk(group, model));
    await flush();

    // step 1: the dialog opens in the form with the banner and the target field ringed
    expect(dialog().dataset.mode).toBe('edit');
    expect(document.querySelector('#record-title').textContent).toBe(first.label);
    expect(banner().textContent).toContain(`Fixing: ${first.task}`);
    expect(banner().textContent).toContain('1 of 2');
    expect(banner().textContent).toContain(`Save, then move on to ${second.label}.`);
    const target = document.querySelector('.record-form__cell.is-target');
    expect(target.querySelector('[data-field]').dataset.field).toBe('github_urls');
    expect(target.querySelector('.fix-missing').textContent).toBe('Missing');
    expect(target.contains(document.activeElement)).toBe(true);
    expect(dialogButton('Save and next')).toBeTruthy();

    // fill the live link (part of the same group) and save
    setInputValue(liveInput(), 'https://example.com/live');
    click(dialogButton('Save and next'));
    await flush();
    expect(records.saveRecord).toHaveBeenCalledWith(projectsSchema, expect.objectContaining({ live_url: 'https://example.com/live' }), first.recordId);
    const before = model.scoreWithDismissals, after = before + first.gain;
    expect(banner().textContent).toContain(`Fixed. Health ${(Math.round(before * 10) / 10).toFixed(1)} → ${(Math.round(after * 10) / 10).toFixed(1)}`);
    expect(banner().textContent).toContain(`1 left in this group. Next: ${second.label}.`);
    const next = [...banner().querySelectorAll('button')].find((b) => b.textContent === `Next: ${second.label}`);
    expect(document.activeElement).toBe(next);

    // step 2: Next opens the following record, still in the walk
    click(next);
    await flush();
    expect(document.querySelector('#record-title').textContent).toBe(second.label);
    expect(dialog().dataset.mode).toBe('edit');
    expect(banner().textContent).toContain('2 of 2');
    expect(banner().textContent).toContain('This is the last one in this group.');
    expect(recordIntent.get().walk.score).toBeCloseTo(after, 6);

    setInputValue(liveInput(), 'https://example.com/live-2');
    click(dialogButton('Save and next'));
    await flush();
    expect(banner().textContent).toContain('That was the last one in this group.');
    const back = [...banner().querySelectorAll('button')].find((b) => b.textContent === 'Back to the queue');
    expect(document.activeElement).toBe(back);
    expect([...banner().querySelectorAll('button')].some((b) => b.textContent.startsWith('Next:'))).toBe(false);

    // Back to the queue: the dialog closes, the walk ends, the page is asked for the queue and a reload
    const [q, f] = [queueRequests.get(), fixesChanged.get()];
    click(back);
    await flush();
    expect(dialog()).toBeNull();
    expect(recordIntent.get()).toBeNull();
    expect([queueRequests.get(), fixesChanged.get()]).toEqual([q + 1, f + 1]);
    expect(records.saveRecord).toHaveBeenCalledTimes(2);
  });

  it('says so when a save leaves the gap, offers Edit again, and Skip moves on without saving', async () => {
    const model = buildFixQueue({ rowsByTable: { projects: rows } });
    const group = model.groups.find((g) => g.ruleKey === 'projects:proof');
    show(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    act(() => startWalk(group, model));
    await flush();
    setInputValue(document.querySelector('.record-form [data-field="awards"] input'), 'Best in show');   // a change, but not the fix
    click(dialogButton('Save and next'));
    await flush();
    expect(banner().textContent).toContain('Saved, but this one still needs work.');
    click([...banner().querySelectorAll('button')].find((b) => b.textContent === 'Edit again'));
    expect(dialog().dataset.mode).toBe('edit');
    expect(banner().textContent).toContain('1 of 2');
    click([...banner().querySelectorAll('button')].find((b) => b.textContent === 'Skip this one'));
    await flush();
    expect(banner().textContent).toContain('2 of 2');
    expect(recordIntent.get().walk.fixed).toEqual([]);
    expect(records.saveRecord).toHaveBeenCalledTimes(1);
  });

  it('asks before Stop fixing throws away typed changes, then ends the walk', async () => {
    const model = buildFixQueue({ rowsByTable: { projects: rows } });
    const group = model.groups.find((g) => g.ruleKey === 'projects:proof');
    show(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    act(() => startWalk(group, model, group.items[1].recordId));
    await flush();
    expect(document.querySelector('#record-title').textContent).toBe(group.items[1].label);
    expect(banner().textContent).toContain('2 of 2');
    setInputValue(liveInput(), 'https://example.com/half');
    click([...banner().querySelectorAll('button')].find((b) => b.textContent === 'Stop fixing'));
    const confirm = document.querySelector('.dialog');
    expect(confirm).not.toBeNull();
    const f = fixesChanged.get();
    click([...confirm.querySelectorAll('button')].find((b) => /stop|discard|leave/i.test(b.textContent)));
    await flush();
    expect(dialog()).toBeNull();
    expect(recordIntent.get()).toBeNull();
    expect(fixesChanged.get()).toBe(f + 1);
    expect(records.saveRecord).not.toHaveBeenCalled();
  });

  it('tells the owner when the record of an intent is gone and asks for a reload', async () => {
    show(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    const f = fixesChanged.get();
    act(() => openRecord('projects', 'zzz', { mode: 'edit' }));
    await flush();
    expect(dialog()).toBeNull();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('no longer here'), 'bad');
    expect(recordIntent.get()).toBeNull();
    expect(fixesChanged.get()).toBe(f + 1);
  });

  it('ignores intents for other tables and opens a plain read intent once', async () => {
    show(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    act(() => openRecord('skills', 'a'));
    await flush();
    expect(dialog()).toBeNull();
    act(() => { clearIntent(); openRecord('projects', 'c'); });
    await flush();
    expect(dialog().dataset.mode).toBe('read');
    expect(banner()).toBeNull();
    expect(recordIntent.get()).toBeNull();   // a plain open is consumed
  });

  it('opens the singleton row in its editor from an intent', async () => {
    const hero = { id: 'h1', title: 'Hi', subtitle: 'Engineer', description: 'Builds things.', highlights: ['One'], cta_text: 'Explore', cta_link: '#navigation', is_active: true, updated_at: '2026-11-01' };
    records.listRecords.mockResolvedValue([hero]);
    records.fetchUpdatedAt.mockResolvedValue(hero.updated_at);
    show(<SingletonChapter schema={heroSchema} notify={notify} />);
    await flush();
    expect(dialog()).toBeNull();
    act(() => openRecord('hero_content', 'h1', { mode: 'edit' }));
    await flush();
    expect(dialog()).not.toBeNull();
    expect(dialog().dataset.mode).toBe('edit');
  });
});

describe('uploads, deletes and vanished records in a walk', () => {
  let notify;
  const noImages = rows.map((r) => (r.id === 'b' ? r : { ...r, image_urls: [] }));
  beforeEach(() => {
    notify = jest.fn();
    records.listRecords.mockResolvedValue(noImages.map((r) => ({ ...r })));
    records.saveRecord.mockImplementation(async (_s, payload, id) => ({ ...noImages.find((r) => r.id === id), ...payload, id }));
    records.fetchUpdatedAt.mockResolvedValue(null);
  });
  afterEach(() => { views.forEach((v) => v.unmount()); views = []; act(() => clearIntent()); document.body.innerHTML = ''; delete Element.prototype.scrollIntoView; });

  it('counts an upload to the ringed image field as the fix: Fixed, the new score and Next', async () => {
    const model = buildFixQueue({ rowsByTable: { projects: noImages } });
    const group = model.groups.find((g) => g.ruleKey === 'projects:images');
    const [first, second] = group.items;
    show(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    act(() => startWalk(group, model));
    await flush();
    const target = document.querySelector('.record-form__cell.is-target');
    expect(target.querySelector('[data-field]').dataset.field).toBe('image_urls');
    expect(target.contains(document.activeElement)).toBe(true);

    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    records.imageProblems.mockReturnValue({ accepted: [file], problems: [] });
    records.uploadImages.mockResolvedValue({ urls: ['https://cdn/shot.png'], failed: [] });
    const v = fixesChanged.get();
    const input = target.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    expect(records.saveRecord).toHaveBeenCalledWith(projectsSchema, { image_urls: ['https://cdn/shot.png'] }, first.recordId);
    expect(fixesChanged.get()).toBeGreaterThan(v);
    const before = model.preciseScore, after = before + first.gain;
    expect(banner().textContent).toContain(`Fixed. Health ${(Math.round(before * 10) / 10).toFixed(1)} → ${(Math.round(after * 10) / 10).toFixed(1)}`);
    expect(dialog().dataset.mode).toBe('read');
    const next = [...banner().querySelectorAll('button')].find((b) => b.textContent === `Next: ${second.label}`);
    expect(document.activeElement).toBe(next);
    click(next);
    await flush();
    expect(document.querySelector('#record-title').textContent).toBe(second.label);
    expect(recordIntent.get().walk.fixed).toEqual([first.recordId]);
  });

  it('scrolls the whole ringed cell to the top of the form and rings only the target', async () => {
    const scrolled = [];
    Element.prototype.scrollIntoView = function scrollIntoView(opts) { scrolled.push([this, opts]); };
    const model = buildFixQueue({ rowsByTable: { projects: noImages } });
    const group = model.groups.find((g) => g.ruleKey === 'projects:proof');
    show(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    act(() => startWalk(group, model));
    await flush();
    const ringed = document.querySelectorAll('.is-target');
    expect(ringed).toHaveLength(1);
    expect(ringed[0].contains(document.activeElement)).toBe(true);
    expect(scrolled.some(([el, opts]) => el === ringed[0] && opts.block === 'start')).toBe(true);
  });

  it('ends the walk when its record is deleted after Cancel, so a card opened by hand opens to read', async () => {
    const model = buildFixQueue({ rowsByTable: { projects: noImages } });
    const group = model.groups.find((g) => g.ruleKey === 'projects:proof');
    const view = show(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    act(() => startWalk(group, model));
    await flush();
    records.deleteRecord.mockResolvedValue();
    click(dialogButton('Cancel'));
    expect(dialog().dataset.mode).toBe('read');
    const v = fixesChanged.get();
    click(dialogButton('Delete'));
    await act(async () => { click([...document.querySelectorAll('.dialog button')].find((b) => b.textContent === 'Delete')); });
    await flush();
    expect(recordIntent.get()).toBeNull();
    expect(fixesChanged.get()).toBeGreaterThan(v);
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    click(view.container.querySelector('.card__open'));
    await flush();
    expect(dialog().dataset.mode).toBe('read');
    expect(banner()).toBeNull();
  });

  it('skips a record that vanished mid-walk with a short note', async () => {
    const model = buildFixQueue({ rowsByTable: { projects: noImages } });
    const group = model.groups.find((g) => g.ruleKey === 'projects:proof');
    const gone = { ...group.items[0], recordId: 'zzz', label: 'Ghost' };
    const walk = walkIntent({ ...group, items: [gone, ...group.items] }, { field: 'github_urls', score: model.preciseScore });
    show(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    act(() => setIntent(walk));
    await flush();
    expect(notify).toHaveBeenCalledWith('Ghost is no longer here, so the walk moved on.');
    expect(document.querySelector('#record-title').textContent).toBe(group.items[0].label);
    expect(banner().textContent).toContain('2 of 3');
  });

  it('tells the owner a hidden record is not a fix', () => {
    const copy = fixBannerCopy({ task: 'Add a link', step: 1, total: 2, gain: 0.3, next: { label: 'Bravo' } }, { passes: false, state: 'hidden', inactive: true });
    expect(copy).toMatchObject({ tone: 'warn', title: 'Saved, but hiding it is not a fix.' });
    expect(copy.body).toContain('Next: Bravo.');
  });
});

describe('fixBannerCopy', () => {
  const fix = { task: 'Add a GitHub or live link', step: 1, total: 3, gain: 0.333, next: { label: 'Beta' }, fieldLabel: 'Repository links' };

  it('states the task, the step and the gain before a save', () => {
    expect(fixBannerCopy(fix, null)).toEqual({ tone: 'fix', title: 'Fixing: Add a GitHub or live link', step: '1 of 3', body: 'Worth +0.3 to the health score. Save, then move on to Beta.' });
    expect(fixBannerCopy({ ...fix, step: 3, next: null }, null).body).toBe('Worth +0.3 to the health score. This is the last one in this group.');
  });

  it('reports the score change after a passing save', () => {
    expect(fixBannerCopy(fix, { passes: true, before: 96.84, after: 97.17 })).toEqual({ tone: 'good', title: 'Fixed. Health 96.8 → 97.2', step: null, body: '2 left in this group. Next: Beta.' });
    expect(fixBannerCopy({ ...fix, step: 3, next: null }, { passes: true, before: 90, after: 90.5 }).body).toBe('That was the last one in this group.');
  });

  it('says what is still wrong after a save that does not pass', () => {
    expect(fixBannerCopy(fix, { passes: false, state: 'missing' }).body).toBe('The repository links is still empty. Next: Beta.');
    expect(fixBannerCopy({ ...fix, fieldLabel: 'Summary' }, { passes: false, state: 'weak' }).body).toBe('The summary is still under 40 characters. Next: Beta.');
    expect(fixBannerCopy(fix, { passes: false, state: 'missing' }).tone).toBe('warn');
  });
});
