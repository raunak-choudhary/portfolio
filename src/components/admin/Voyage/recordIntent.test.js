import { React, act, mount } from '../SkyBackground/testUtils';
import { backToQueue, clearIntent, fixesChanged, noteFixesChanged, openRecord, queueRequests, recordIntent, setIntent, showQueue, useRecordIntent } from './recordIntent';

function Probe() { const intent = useRecordIntent(); return <p>{intent ? `${intent.table}:${intent.recordId}:${intent.mode}` : 'none'}</p>; }

describe('recordIntent store', () => {
  afterEach(() => act(() => clearIntent()));

  it('opens a record with read mode by default and notifies readers', () => {
    const view = mount(<Probe />);
    expect(view.container.textContent).toBe('none');
    act(() => openRecord('projects', 7));
    expect(view.container.textContent).toBe('projects:7:read');
    expect(recordIntent.get()).toEqual({ table: 'projects', recordId: 7, mode: 'read', field: null, walk: null });
    act(() => clearIntent());
    expect(view.container.textContent).toBe('none');
    view.unmount();
  });

  it('keeps a walk intent as given', () => {
    const walk = { ruleKey: 'projects:images', ids: [1, 2], index: 0 };
    setIntent({ table: 'projects', recordId: 1, mode: 'edit', field: 'image_urls', walk });
    expect(recordIntent.get().walk).toBe(walk);
  });

  it('ends a walk, reloads and asks for the queue on Back to the queue', () => {
    setIntent({ table: 'projects', recordId: 1, mode: 'edit', walk: {} });
    const [q, f] = [queueRequests.get(), fixesChanged.get()];
    backToQueue();
    expect(recordIntent.get()).toBeNull();
    expect(queueRequests.get()).toBe(q + 1);
    expect(fixesChanged.get()).toBe(f + 1);
    showQueue();
    noteFixesChanged();
    expect([queueRequests.get(), fixesChanged.get()]).toEqual([q + 2, f + 2]);
  });
});
