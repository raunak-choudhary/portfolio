/* eslint-disable testing-library/no-container, testing-library/no-node-access */
// The read rendering of the kinds added in V3a: pairs, single image, files,
// link, date, rating and derived values.

import RecordView, { ReadValue, readableDate } from './RecordView';
import { React, mount } from '../SkyBackground/testUtils';

const read = (field, value) => mount(<ReadValue field={{ key: 'k', label: 'Thing', ...field }} value={value} />);
const STORE = 'https://x.supabase.co/storage/v1/object/public/skill-icons/';

describe('read view of the new kinds', () => {
  it('writes dates out and keeps an odd value as stored', () => {
    expect(readableDate('2026-11-18')).toBe('18 Nov 2026');
    expect(readableDate('2026-11-18T10:00:00Z')).toBe('18 Nov 2026');
    expect(readableDate('soon')).toBe('soon');
  });

  it('shows pairs as a definition list in order, and Not set when empty', () => {
    const view = read({ kind: 'pairs' }, [{ key: 'City', value: 'NYC', order_index: 1 }, { key: 'Degree', value: 'MS', order_index: 0 }]);
    expect([...view.container.querySelectorAll('dt')].map((d) => d.textContent)).toEqual(['Degree', 'City']);
    view.unmount();
    const empty = read({ kind: 'pairs' }, null);
    expect(empty.container.textContent).toBe('Not set');
    empty.unmount();
  });

  it('links an image and file by name, splits typed names from files', () => {
    const image = read({ kind: 'image' }, `${STORE}a.png`);
    expect(image.container.querySelector('a').getAttribute('target')).toBe('_blank');
    image.unmount();
    const files = read({ kind: 'files' }, ['AWS SAA', `${STORE}cert%201.pdf`]);
    expect(files.container.querySelector('.record-view__chips').textContent).toBe('AWS SAA');
    expect(files.container.querySelector('.record-view__links a').textContent).toContain('cert 1.pdf');
    files.unmount();
  });

  it('shows an anchor link as code and a web link as a link', () => {
    const anchor = read({ kind: 'link' }, '#navigation');
    expect(anchor.container.querySelector('code').textContent).toBe('#navigation');
    expect(anchor.container.querySelector('a')).toBeNull();
    anchor.unmount();
    const web = read({ kind: 'link' }, 'https://x.dev');
    expect(web.container.querySelector('a').getAttribute('rel')).toBe('noopener noreferrer');
    web.unmount();
  });

  it('shows a rating as stars with a text equivalent', () => {
    const view = read({ kind: 'rating' }, 4);
    const rating = view.container.querySelector('.record-view__rating');
    expect(rating.getAttribute('aria-label')).toBe('4 of 5');
    expect(rating.querySelectorAll('.is-on')).toHaveLength(4);
    view.unmount();
  });

  it('computes a derived value from the row when the column is empty', () => {
    const schema = { fields: [{ key: 'c', label: 'Content', kind: 'textarea' }, { key: 'w', label: 'Words', kind: 'derived', compute: (r) => String(r.c).split(' ').length }], groups: [{ label: 'All', keys: ['c', 'w'] }], titleKey: 'c', card: () => ({}) };
    const view = mount(<RecordView schema={schema} row={{ id: 1, c: 'one two three' }} />);
    const item = [...view.container.querySelectorAll('.record-view__item')].find((i) => i.querySelector('dt').textContent === 'Words');
    expect(item.querySelector('dd').textContent).toBe('3');
    view.unmount();
  });
});
