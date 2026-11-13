/* eslint-disable testing-library/no-container */
import Deck, { SEARCH_FROM } from './Deck';
import { projectsSchema } from './managers/projects.schema';
import { React, click, mount, setInputValue } from '../SkyBackground/testUtils';

const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, title: `Project ${i}`, project_type: i % 2 ? 'Web app' : 'Research', technologies: ['React', 'Three'], featured: i === 0, awards: i === 1 ? 'Prize' : null, order_index: n - i }));

describe('Deck', () => {
  it('shows a new card first, one card per record with its flags, and opens on click', () => {
    const onOpen = jest.fn(), onCreate = jest.fn();
    const view = mount(<Deck schema={projectsSchema} records={rows(3)} loading={false} error={null} onOpen={onOpen} onCreate={onCreate} onReorder={() => {}} />);
    const grid = view.container.querySelector('.deck__grid');
    expect(grid.children[0].classList.contains('card--new')).toBe(true);
    expect(view.container.querySelectorAll('article.card')).toHaveLength(3);
    expect(view.container.textContent).toContain('3 projects · drag to reorder');
    expect(view.container.querySelector('article.card .card__flags span').getAttribute('aria-label')).toBe('Starred on the public page');
    click(view.container.querySelectorAll('.card__open')[1]);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
    click(grid.children[0]);
    expect(onCreate).toHaveBeenCalled();
    expect(view.container.querySelector('.deck__search')).toBeNull();
    view.unmount();
  });

  it('offers search from nine records, filters, and hides the new card while searching', () => {
    const view = mount(<Deck schema={projectsSchema} records={rows(SEARCH_FROM)} loading={false} error={null} onOpen={() => {}} onCreate={() => {}} onReorder={() => {}} />);
    const input = view.container.querySelector('.deck__search input');
    expect(input).not.toBeNull();
    setInputValue(input, 'project 7');
    expect(view.container.querySelectorAll('article.card')).toHaveLength(1);
    expect(view.container.querySelector('.card--new')).toBeNull();
    setInputValue(input, 'nothing here');
    expect(view.container.textContent).toContain('Nothing matches');
    view.unmount();
  });

  it('shows loading skeletons, an error line and the empty state', () => {
    const loading = mount(<Deck schema={projectsSchema} records={[]} loading error={null} onOpen={() => {}} onCreate={() => {}} onReorder={() => {}} />);
    expect(loading.container.querySelectorAll('.card--skeleton')).toHaveLength(3);
    loading.unmount();
    const empty = mount(<Deck schema={projectsSchema} records={[]} loading={false} error={null} onOpen={() => {}} onCreate={() => {}} onReorder={() => {}} />);
    expect(empty.container.textContent).toContain('No projects yet');
    empty.unmount();
    const failed = mount(<Deck schema={projectsSchema} records={[]} loading={false} error="The list could not be loaded." onOpen={() => {}} onCreate={() => {}} onReorder={() => {}} />);
    expect(failed.container.querySelector('.deck__error').textContent).toBe('The list could not be loaded.');
    failed.unmount();
  });
});
