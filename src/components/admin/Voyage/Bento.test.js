/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
import Bento, { TILE_NAMES } from './Bento';
import { BENTO_ORDER_KEY, sanitizeOrder } from './bentoModel';
import { React, act, click, mount } from '../SkyBackground/testUtils';

jest.mock('../../../services/voyageData', () => ({ relativeTime: () => 'just now' }));
jest.mock('./TonightTile', () => () => null);

const data = {
  health: { summary: { score: 80 }, sections: [] },
  visitors: { days: [{ date: '2026-11-19', views: 9, visitors: 2 }], totalViews: 9, totalVisitors: 2, previousVisitors: 1 },
  inbox: { count: 1, latest: [{ id: 'm', name: 'Sender', createdAt: '2026-11-19T10:00:00Z' }] },
  edits: [], pages: [], assetBase: '/admin/sky/',
};

describe('Bento', () => {
  afterEach(() => window.localStorage.clear());

  it('gives every tile a named drag handle and keeps the tile itself out of the tab order', () => {
    const view = mount(<Bento data={data} onGo={() => {}} />);
    const tiles = [...view.container.querySelectorAll('.tile')];
    expect(tiles).toHaveLength(8);
    for (const tile of tiles) {
      // the tile is a plain container: no button role, no tab stop, no keyboard-drag instructions on it
      expect(tile.getAttribute('role')).toBeNull();
      expect(tile.getAttribute('tabindex')).toBeNull();
      const grip = tile.querySelector('.tile__grip');
      expect(grip.getAttribute('aria-label')).toBe(`Move the ${TILE_NAMES[tile.dataset.tile]} tile`);
      expect(grip.getAttribute('aria-roledescription')).toBe('sortable');
    }
    view.unmount();
  });

  it('leaves Enter and Space on a button inside a tile alone, so the button is pressed and no drag starts', () => {
    const onGo = jest.fn();
    const view = mount(<Bento data={data} onGo={onGo} />);
    const link = [...view.container.querySelectorAll('.tile__link')].find((b) => b.textContent === 'Open the inbox');
    for (const code of ['Enter', 'Space']) {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code, key: code === 'Space' ? ' ' : code });
      act(() => { link.dispatchEvent(event); });
      expect(event.defaultPrevented).toBe(false);   // a keyboard drag would have prevented it, cancelling the click
    }
    expect(view.container.querySelector('.tile.is-dragging')).toBeNull();
    click(link);
    expect(onGo).toHaveBeenCalledWith('inbox');
    view.unmount();
  });

  it('says what the visitors number and its line each count', () => {
    const view = mount(<Bento data={data} onGo={() => {}} />);
    const tile = view.container.querySelector('[data-tile="visitors"]');
    expect(tile.querySelector('.tile__big').textContent).toContain('2');
    expect(tile.querySelector('.tile__note').textContent).toBe('sessions · the line is page views per day');
    view.unmount();
  });

  it('keeps the saved order format: a plain array of tile ids', () => {
    const saved = [...sanitizeOrder(null)].reverse();
    window.localStorage.setItem(BENTO_ORDER_KEY, JSON.stringify(saved));
    const view = mount(<Bento data={data} onGo={() => {}} />);
    const ids = [...view.container.querySelectorAll('.tile')].map((t) => t.dataset.tile);
    expect(ids).toEqual(saved);
    expect(JSON.parse(window.localStorage.getItem(BENTO_ORDER_KEY))).toEqual(saved);
    view.unmount();
  });
});
