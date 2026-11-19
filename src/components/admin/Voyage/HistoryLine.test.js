/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import HistoryLine, { HISTORY_LIMIT } from './HistoryLine';
import { React, act, click, mount } from '../SkyBackground/testUtils';

jest.mock('../../../services/activityService', () => ({ listActivity: jest.fn(), recordHistory: jest.fn(), isActivityAvailable: jest.fn(), logSecurityEvent: jest.fn() }));
const service = jest.requireMock('../../../services/activityService');

const NOW = new Date('2026-11-19T19:00:00.000Z');
const row = (id, over) => ({ id, at: '2026-11-19T18:40:00.000Z', action: 'upload', section: 'projects', recordId: 'p1', recordTitle: 'CareVault', fields: ['image_urls'], detail: { added: 2 }, source: 'admin', ...over });
const HISTORY = [
  row(4),
  row(3, { at: '2026-11-18T21:02:00.000Z', action: 'edit', fields: ['description', 'key_features'], detail: {} }),
  row(2, { at: '2026-11-09T23:30:00.000Z', action: 'edit', fields: ['title', 'duration'], detail: {}, source: 'outside' }),
];
const flush = () => act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });

describe('HistoryLine', () => {
  let view;
  const render = (props = {}) => { view = mount(<HistoryLine table="projects" recordId="p1" now={NOW} {...props} />); return view; };
  beforeEach(() => {
    service.isActivityAvailable.mockResolvedValue(true);
    service.recordHistory.mockResolvedValue(HISTORY);
  });
  afterEach(() => { view?.unmount(); view = null; });

  it('shows a skeleton while loading, then the last change and the count', async () => {
    render();
    expect(view.container.querySelector('[data-testid="history-loading"]')).not.toBeNull();
    await flush();
    expect(service.recordHistory).toHaveBeenCalledWith('projects', 'p1', HISTORY_LIMIT);
    expect(view.container.querySelector('.hist__line').textContent).toBe('Last edited Today 13:40 · 3 changes recordedHistory');
    expect(view.container.querySelector('.hist__list')).toBeNull();
  });

  it('opens the timeline in place, marks outside changes, and ends with "Before tracking began"', async () => {
    render();
    await flush();
    const toggle = view.container.querySelector('.hist__toggle');
    click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('Hide history');
    const list = view.container.querySelector('.hist__list');
    expect(list.id).toBe(toggle.getAttribute('aria-controls'));
    expect([...list.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Today 13:40Added 2 images', 'Yesterday 16:02Edited: description, key features', '9 Nov 18:30Changed outside the admin: title, duration', 'CreatedBefore tracking began',
    ]);
    expect(list.querySelector('.is-outside').textContent).toContain('outside the admin');
    click(toggle);
    expect(view.container.querySelector('.hist__list')).toBeNull();
  });

  it('lists the create event itself when it is known, and never claims one past a full page', async () => {
    service.recordHistory.mockResolvedValue([row(5, { action: 'create', fields: [] })]);
    render();
    await flush();
    click(view.container.querySelector('.hist__toggle'));
    expect(view.container.querySelector('.hist__list').textContent).toBe('Today 13:40Created');
    view.unmount();
    service.recordHistory.mockResolvedValue(Array.from({ length: HISTORY_LIMIT }, (_, i) => row(i + 10, { action: 'edit', fields: ['title'] })));
    render();
    await flush();
    expect(view.container.textContent).toContain(`${HISTORY_LIMIT}+ changes recorded`);
    click(view.container.querySelector('.hist__toggle'));
    expect(view.container.textContent).toContain('Older changes are not listed here.');
    expect(view.container.textContent).not.toContain('Before tracking began');
  });

  it('renders nothing while the activity table is missing', async () => {
    service.isActivityAvailable.mockResolvedValue(false);
    render();
    await flush();
    expect(view.container.innerHTML).toBe('');
    expect(service.recordHistory).not.toHaveBeenCalled();
  });

  it('says so in one line when nothing is recorded or the read fails', async () => {
    service.recordHistory.mockResolvedValue([]);
    render();
    await flush();
    expect(view.container.textContent).toBe('No changes recorded since tracking began.');
    view.unmount();
    service.recordHistory.mockRejectedValue(new Error('boom'));
    render();
    await flush();
    expect(view.container.textContent).toBe('History could not be loaded.');
  });

  it('reloads and closes the timeline when it moves to another record', async () => {
    render();
    await flush();
    click(view.container.querySelector('.hist__toggle'));
    view.rerender(<HistoryLine table="projects" recordId="p2" now={NOW} />);
    await flush();
    expect(service.recordHistory).toHaveBeenLastCalledWith('projects', 'p2', HISTORY_LIMIT);
    expect(view.container.querySelector('.hist__list')).toBeNull();
  });
});
