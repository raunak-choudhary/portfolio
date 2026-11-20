/* eslint-disable testing-library/no-container, testing-library/no-node-access */
// The fix queue pane: ranked groups with gains, filters, a walk started from a
// group or one item, "Not needed" with an optional reason, "Marked not needed"
// with Bring back, the stale list and the empty and failure states. Also the
// hook that loads it and the bento tile that previews it.

import FixQueuePane, { SHOWN_ITEMS, formatDay, useFixQueue } from './FixQueuePane';
import Bento from './Bento';
import { buildFixQueue } from './fixQueueModel';
import { clearIntent, noteFixesChanged, queueRequests, recordIntent } from './recordIntent';
import { React, act, click, mount, setInputValue } from '../SkyBackground/testUtils';

jest.mock('../../../services/supabaseClient', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('../../../services/fixDismissalsService', () => ({ dismiss: jest.fn(), restore: jest.fn(), listDismissals: jest.fn() }));
jest.mock('../../../services/fixQueueData', () => ({ loadFixQueueData: jest.fn() }));
const service = jest.requireMock('../../../services/fixDismissalsService');
const { loadFixQueueData } = jest.requireMock('../../../services/fixQueueData');
const flush = () => act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });

const LONG = 'A short description that is comfortably over forty characters.';
const project = (id, extra = {}) => ({ id, title: `Project ${id}`, short_description: LONG, image_urls: [], github_urls: ['https://github.com/x'], status: 'active', ...extra });
const rowsByTable = () => ({
  projects: [project('p1'), project('p2'), project('p3', { short_description: 'Too short' }), ...Array.from({ length: 6 }, (_, i) => project(`q${i}`))],
  skills: [{ id: 's1', skill_name: 'Go', category: null }],
});
const fixesFor = (overrides = {}) => {
  const model = buildFixQueue({ rowsByTable: rowsByTable(), dismissals: overrides.dismissals || [] });
  return { model, stale: [], loading: false, failed: false, dismissalsAvailable: true, dismissalsProblem: null, dismissItem: jest.fn().mockResolvedValue(), restoreItem: jest.fn().mockResolvedValue(), ...overrides, ...(overrides.model === undefined ? { model } : {}) };
};
const button = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text || b.getAttribute('aria-label') === text);
const rows = (view) => [...view.container.querySelectorAll('.fx-row')];

describe('FixQueuePane', () => {
  afterEach(() => { act(() => clearIntent()); document.body.innerHTML = ''; });

  it('ranks the groups by gain with their why, severity, section and field, and sums them in the head', () => {
    const fixes = fixesFor();
    const view = mount(<FixQueuePane fixes={fixes} onReview={jest.fn()} />);
    const { groups } = fixes.model;
    expect(rows(view).map((r) => r.dataset.rule)).toEqual(groups.map((g) => g.ruleKey));
    const first = rows(view)[0];
    expect(first.querySelector('.fx-row__title').textContent).toBe(groups[0].title);
    expect(first.querySelector('.fx-row__why').textContent).toBe(groups[0].why);
    expect(first.querySelector('.fx-chip').textContent).toBe(groups[0].section);
    expect(first.textContent).toContain(`Field: ${groups[0].fieldLabel}`);
    expect(view.container.querySelector('.v5-head__sum').textContent).toContain(`${groups.length} things`);
    expect(view.container.querySelector('.fx-score__labels').textContent).toMatch(/Now \d+\.\dAfter every fix \d+\.\d/);
    view.unmount();
  });

  it('opens How the score works as a dialog of four blocks from the real numbers, and closes back to its button', () => {
    const fixes = fixesFor();
    const view = mount(<FixQueuePane fixes={fixes} onReview={jest.fn()} />);
    const trigger = button(view.container, 'How the score works');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    trigger.focus();
    click(trigger);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.querySelectorAll('.explain-step')).toHaveLength(4);
    expect(dialog.querySelector('.explain__lead').textContent).toContain(`Your score now: ${Math.round(fixes.model.preciseScore * 10) / 10}`);
    // block 1: every section, Projects first with its weight
    const legend = [...dialog.querySelectorAll('.sg-legend li')];
    expect(legend).toHaveLength(11);
    expect(legend[0].textContent).toMatch(/^Projects[\d.]+ \/ 20$/);
    // block 3: nine projects fill the three dots, one skill lights one of eight
    const targets = [...dialog.querySelectorAll('.sg-targets li')];
    expect(targets[0].textContent).toContain('full points');
    expect(targets[1].querySelectorAll('i.is-on')).toHaveLength(1);
    expect(targets[1].textContent).toContain('1 of 8');
    // block 4: the queue's top gains, biggest first
    expect(dialog.querySelectorAll('.sg-gains li')[0].textContent).toContain(fixes.model.groups[0].title);
    act(() => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    view.unmount();
  });

  it('filters by kind and back to all', () => {
    const view = mount(<FixQueuePane fixes={fixesFor()} onReview={jest.fn()} />);
    const seg = view.container.querySelector('.v5-seg');
    const labels = [...seg.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels[0]).toBe('All');
    click(button(seg, 'Images'));
    expect(rows(view).every((r) => r.dataset.rule.endsWith('images'))).toBe(true);
    expect(button(seg, 'Images').getAttribute('aria-pressed')).toBe('true');
    click(button(seg, 'All'));
    expect(rows(view).length).toBeGreaterThan(1);
    view.unmount();
  });

  it('opens a group, shows six items then the rest, and starts a walk from the group or one item', () => {
    const fixes = fixesFor();
    const view = mount(<FixQueuePane fixes={fixes} onReview={jest.fn()} />);
    const row = view.container.querySelector('[data-rule="projects:images"]');
    const group = fixes.model.groups.find((g) => g.ruleKey === 'projects:images');
    expect(group.items.length).toBeGreaterThan(SHOWN_ITEMS);
    const toggle = row.querySelector('.fx-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(row.querySelectorAll('.fx-items > li:not(.fx-items__more)')).toHaveLength(SHOWN_ITEMS);
    click(button(row, `Show ${group.items.length - SHOWN_ITEMS} more`));
    expect(row.querySelectorAll('.fx-items > li:not(.fx-items__more)')).toHaveLength(group.items.length);

    let queued = 0;
    const off = queueRequests.subscribe?.(() => { queued += 1; });
    click(button(row, `Fix ${group.items.length}, one by one`));
    expect(recordIntent.get()).toMatchObject({ table: 'projects', mode: 'edit', field: 'image_urls', recordId: group.items[0].recordId });
    expect(recordIntent.get().walk).toMatchObject({ ruleKey: 'projects:images', index: 0, score: fixes.model.preciseScore });
    const third = group.items[2];
    click(button(row, `Fix ${third.label}`));
    expect(recordIntent.get()).toMatchObject({ recordId: third.recordId });
    expect(recordIntent.get().walk.index).toBe(2);
    if (off) off();
    expect(queued).toBe(0);
    view.unmount();
  });

  it('marks a group not needed with a reason, cancels with Escape, and shows a save error in place', async () => {
    const fixes = fixesFor();
    const notify = jest.fn();
    const view = mount(<FixQueuePane fixes={fixes} onReview={jest.fn()} notify={notify} />);
    const row = view.container.querySelector('[data-rule="skills:category"]');
    click(button(row, `Not needed: ${fixes.model.groups.find((g) => g.ruleKey === 'skills:category').title}`));
    let form = row.querySelector('[data-testid="fx-dismiss"]');
    const input = form.querySelector('input');
    expect(document.activeElement).toBe(input);
    expect(input.maxLength).toBe(140);
    act(() => { form.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(row.querySelector('[data-testid="fx-dismiss"]')).toBeNull();
    expect(document.activeElement).toBe(button(row, `Not needed: ${fixes.model.groups.find((g) => g.ruleKey === 'skills:category').title}`));

    click(button(row, `Not needed: ${fixes.model.groups.find((g) => g.ruleKey === 'skills:category').title}`));
    form = row.querySelector('[data-testid="fx-dismiss"]');
    fixes.dismissItem.mockRejectedValueOnce(new Error('This needs your authenticator code.'));
    setInputValue(form.querySelector('input'), 'Categories are not shown');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(form.querySelector('[role="alert"]').textContent).toContain('This needs your authenticator code.');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(fixes.dismissItem).toHaveBeenLastCalledWith('skills:category', null, 'Categories are not shown');
    expect(notify).toHaveBeenCalledWith('Marked not needed.');
    expect(row.querySelector('[data-testid="fx-dismiss"]')).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    view.unmount();
  });

  it('returns focus to the opener when the reason form is cancelled', () => {
    const fixes = fixesFor();
    const view = mount(<FixQueuePane fixes={fixes} onReview={jest.fn()} />);
    const row = view.container.querySelector('[data-rule="projects:short_description"]');
    click(row.querySelector('.fx-toggle'));
    const opener = button(row, 'Not needed: Project p3');
    click(opener);
    click(button(row.querySelector('[data-testid="fx-dismiss"]'), 'Cancel'));
    expect(row.querySelector('[data-testid="fx-dismiss"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    view.unmount();
  });

  it('dismisses one record from the item list', async () => {
    const fixes = fixesFor();
    const view = mount(<FixQueuePane fixes={fixes} onReview={jest.fn()} />);
    const row = view.container.querySelector('[data-rule="projects:short_description"]');
    click(row.querySelector('.fx-toggle'));
    click(button(row, 'Not needed: Project p3'));
    expect(row.querySelector('[data-testid="fx-dismiss"]').textContent).toContain('Project p3 leaves the queue');
    await act(async () => { row.querySelector('[data-testid="fx-dismiss"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(fixes.dismissItem).toHaveBeenCalledWith('projects:short_description', 'p3', '');
    view.unmount();
  });

  it('lists what was marked not needed, counts it honestly, and brings it back', async () => {
    const dismissals = [{ id: 'd1', ruleKey: 'skills:category', recordId: null, note: 'Not shown on the site', createdAt: '2026-11-12T15:00:00Z' }];
    const fixes = fixesFor({ dismissals });
    const notify = jest.fn();
    const view = mount(<FixQueuePane fixes={fixes} onReview={jest.fn()} notify={notify} />);
    expect(view.container.querySelector('[data-rule="skills:category"]')).toBeNull();
    const score = view.container.querySelector('.fx-score').textContent;
    expect(score).toContain(`Now ${fixes.model.preciseScore.toFixed(1)}`);
    expect(score).toContain('the 1 item marked not needed still counts as gaps');
    expect(score).toContain(`Counting them as passing would give ${fixes.model.scoreWithDismissals.toFixed(1)}`);
    const hidden = view.container.querySelector('[data-testid="fx-hidden"]');
    expect(hidden.textContent).toContain('1 item');
    click(button(hidden, 'Show them'));
    expect(document.activeElement).toBe(button(hidden, `Bring back: ${fixes.model.dismissed[0].title}`));
    click(button(hidden, 'Hide them'));
    expect(document.activeElement).toBe(button(hidden, 'Show them'));
    click(button(hidden, 'Show them'));
    expect(hidden.textContent).toContain('“Not shown on the site”');
    expect(hidden.textContent).toContain('12 Nov');
    await act(async () => { click(button(hidden, `Bring back: ${fixes.model.dismissed[0].title}`)); });
    expect(fixes.restoreItem).toHaveBeenCalledWith('d1');
    expect(notify).toHaveBeenCalledWith('Back in the queue.');
    expect(document.activeElement).not.toBe(document.body);
    expect(hidden.contains(document.activeElement)).toBe(true);
    fixes.restoreItem.mockRejectedValueOnce(new Error('The item could not be brought back.'));
    await act(async () => { click(button(hidden, `Bring back: ${fixes.model.dismissed[0].title}`)); });
    expect(hidden.querySelector('[role="alert"]').textContent).toContain('could not be brought back');
    view.unmount();
  });

  it('turns Not needed off calmly when the dismissals are not set up or could not load', () => {
    let view = mount(<FixQueuePane fixes={fixesFor({ dismissalsAvailable: false, dismissalsProblem: 'not-set-up' })} onReview={jest.fn()} />);
    expect(view.container.textContent).toContain('Not needed starts working once the activity migration has been run.');
    expect([...view.container.querySelectorAll('button')].some((b) => b.textContent === 'Not needed')).toBe(false);
    expect(view.container.querySelector('[data-rule]')).not.toBeNull();
    view.unmount();
    view = mount(<FixQueuePane fixes={fixesFor({ dismissalsAvailable: false, dismissalsProblem: 'failed' })} onReview={jest.fn()} />);
    expect(view.container.textContent).toContain('could not be loaded, so Not needed is off for now');
    view.unmount();
  });

  it('shows skeletons while loading, an alert on failure, the empty state, and sections it could not check', () => {
    let view = mount(<FixQueuePane fixes={fixesFor({ model: null, loading: true })} onReview={jest.fn()} />);
    expect(view.container.querySelector('.fx-skeletons')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="fix-queue"]').getAttribute('aria-busy')).toBe('true');
    view.unmount();
    view = mount(<FixQueuePane fixes={fixesFor({ model: null, failed: true })} onReview={jest.fn()} />);
    expect(view.container.querySelector('[role="alert"]').textContent).toContain('could not be loaded');
    view.unmount();
    const empty = buildFixQueue({ rowsByTable: { projects: [project('p1', { image_urls: ['x'] })] } });
    view = mount(<FixQueuePane fixes={fixesFor({ model: { ...empty, groups: [] } })} onReview={jest.fn()} />);
    expect(view.container.querySelector('.v5-empty').textContent).toContain('Nothing to fix.');
    expect(view.container.textContent).toContain('Could not check');
    view.unmount();
  });

  it('lists sections untouched for over 90 days with a Review that opens the chapter', () => {
    const onReview = jest.fn();
    const view = mount(<FixQueuePane fixes={fixesFor({ stale: [{ table: 'projects', section: 'Projects', chapterId: 'projects', days: 120 }] })} onReview={onReview} />);
    expect(view.container.textContent).toContain('Last edit 120 days ago');
    click(button(view.container, 'Review Projects'));
    expect(onReview).toHaveBeenCalledWith('projects');
    view.unmount();
  });

  it('formats a day in New York time and leaves bad dates blank', () => {
    expect(formatDay('2026-11-12T15:00:00Z')).toBe('12 Nov');
    expect(formatDay('nope')).toBe('');
  });
});

describe('useFixQueue', () => {
  function Probe({ out }) { out.current = useFixQueue(); return null; }
  afterEach(() => { document.body.innerHTML = ''; });

  it('loads, reloads when the content changes, and keeps dismissals in step without a reload', async () => {
    loadFixQueueData.mockResolvedValue({ rowsByTable: rowsByTable(), dismissals: [], dismissalsAvailable: true, dismissalsProblem: null, freshness: [{ table: 'projects', section: 'Projects', at: '2020-01-01T00:00:00Z' }] });
    const out = { current: null };
    const view = mount(<Probe out={out} />);
    expect(out.current.loading).toBe(true);
    await flush();
    expect(out.current.loading).toBe(false);
    expect(out.current.model.groups.length).toBeGreaterThan(0);
    expect(out.current.stale.map((s) => s.table)).toEqual(['projects']);
    act(() => noteFixesChanged());
    await flush();
    expect(loadFixQueueData).toHaveBeenCalledTimes(2);

    service.dismiss.mockResolvedValue({ id: 'd9', ruleKey: 'skills:category', recordId: null, note: null, createdAt: '2026-11-19T00:00:00Z' });
    await act(async () => { await out.current.dismissItem('skills:category', null, ''); });
    expect(out.current.model.groups.some((g) => g.ruleKey === 'skills:category')).toBe(false);
    service.restore.mockResolvedValue();
    await act(async () => { await out.current.restoreItem('d9'); });
    expect(out.current.model.groups.some((g) => g.ruleKey === 'skills:category')).toBe(true);
    expect(loadFixQueueData).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('keeps a dismissal made while a reload was already on its way', async () => {
    let finish;
    loadFixQueueData.mockResolvedValueOnce({ rowsByTable: rowsByTable(), dismissals: [], dismissalsAvailable: true, dismissalsProblem: null, freshness: [] });
    const out = { current: null };
    const view = mount(<Probe out={out} />);
    await flush();
    loadFixQueueData.mockImplementationOnce(() => new Promise((r) => { finish = r; }));
    act(() => noteFixesChanged());
    service.dismiss.mockResolvedValue({ id: 'd7', ruleKey: 'skills:category', recordId: null, note: null, createdAt: '2026-11-19T00:00:00Z' });
    await act(async () => { await out.current.dismissItem('skills:category', null, ''); });
    await act(async () => { finish({ rowsByTable: rowsByTable(), dismissals: [], dismissalsAvailable: true, dismissalsProblem: null, freshness: [] }); });
    await flush();
    expect(out.current.model.groups.some((g) => g.ruleKey === 'skills:category')).toBe(false);
    view.unmount();
  });

  it('reports a failed load', async () => {
    loadFixQueueData.mockRejectedValue(new Error('offline'));
    const out = { current: null };
    const view = mount(<Probe out={out} />);
    await flush();
    expect(out.current).toMatchObject({ failed: true, loading: false, model: null });
    view.unmount();
  });
});

describe('the bento fix tile', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('shows the top three groups with their gains and opens the queue', () => {
    const fixes = fixesFor();
    const before = queueRequests.get();
    const view = mount(<Bento data={{ fixes }} onGo={jest.fn()} />);
    const tile = view.container.querySelector('.tile__fix');
    const lines = [...tile.children].map((d) => d.querySelector('span').textContent);
    expect(lines).toEqual(fixes.model.groups.slice(0, 3).map((g) => g.title));
    expect(tile.parentNode.querySelector('.tile__gain').textContent).toMatch(/^Health \d+\.\d now, \d+\.\d after every fix$/);
    click(button(view.container, 'Open the fix queue'));
    expect(queueRequests.get()).toBe(before + 1);
    view.unmount();
  });

  it('shows the plain score and discloses what the dismissals would add', () => {
    const dismissals = [{ id: 'd1', ruleKey: 'skills:category', recordId: null, note: null, createdAt: '2026-11-12T15:00:00Z' }];
    const fixes = fixesFor({ dismissals });
    const view = mount(<Bento data={{ fixes }} onGo={jest.fn()} />);
    const line = view.container.querySelector('.tile__gain').textContent;
    expect(line).toContain(`Health ${fixes.model.preciseScore.toFixed(1)} now, ${fixes.model.scoreWithDismissals.toFixed(1)} counting 1 marked not needed`);
    view.unmount();
  });
});
