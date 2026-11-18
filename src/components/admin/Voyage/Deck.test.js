/* eslint-disable testing-library/no-container */
import Deck, { SEARCH_FROM } from './Deck';
import { projectsSchema } from './managers/projects.schema';
import { skillsSchema } from './managers/skills.schema';
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
    expect(view.container.querySelectorAll('[aria-roledescription="sortable"]')).toHaveLength(3);
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
    expect(failed.container.querySelector('.deck__error').textContent).toBe('The list could not be loaded. Check the connection.');   // no retry handler, so no retry offered
    failed.unmount();
  });

  it('after a failed load shows the error with a retry, no count and no new card to press', () => {
    const onRetry = jest.fn();
    const view = mount(<Deck schema={projectsSchema} records={[]} loading={false} error="The list could not be loaded." onRetry={onRetry} onOpen={() => {}} onCreate={() => {}} onReorder={() => {}} />);
    expect(view.container.querySelector('.deck__count').textContent).toBe('Not loaded');
    expect(view.container.querySelector('.card--new').disabled).toBe(true);
    expect(view.container.querySelector('.deck__empty')).toBeNull();
    click([...view.container.querySelectorAll('.deck__error button')].find((b) => b.textContent.trim() === 'Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  describe('grouped', () => {
    const skills = [
      { id: 1, skill_name: 'Python', category: 'Languages', skill_type: 'Programming Languages', skill_type_priority: 1, proficiency_level: 9, status: 'active' },
      { id: 2, skill_name: 'AWS', category: 'Cloud', skill_type: 'Cloud Platforms', skill_type_priority: 2, status: 'draft', is_featured: true },
      { id: 3, skill_name: 'Go', category: 'Languages', skill_type: 'Programming Languages', skill_type_priority: 1, status: 'active' },
    ];
    const render = (props = {}) => mount(<Deck schema={skillsSchema} records={skills} loading={false} error={null} onOpen={() => {}} onCreate={() => {}} onReorder={() => {}} {...props} />);

    it('renders one collapsible section per group in priority order, with compact cards and no drag', () => {
      const view = render();
      const groups = [...view.container.querySelectorAll('.deck__group')];
      expect(groups.map((g) => g.querySelector('h3').textContent)).toEqual(['Programming Languages', 'Cloud Platforms']);
      expect(groups[0].querySelector('.deck__group-count').textContent).toBe('2');
      expect(view.container.querySelectorAll('article.card--compact')).toHaveLength(3);
      expect(view.container.querySelector('[aria-roledescription="sortable"]')).toBeNull();
      expect(view.container.textContent).not.toContain('drag to reorder');
      const aws = groups[1].querySelector('.card__flags');
      expect([...aws.querySelectorAll('span')].map((f) => f.getAttribute('aria-label'))).toEqual(['Featured', 'Hidden from the public page']);
      const toggle = groups[0].querySelector('.deck__group-toggle');
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(document.getElementById(toggle.getAttribute('aria-controls')).hidden).toBe(true);
      view.unmount();
    });

    it('moves a whole group with Up and Down, and hides the moves while searching', () => {
      const onMoveGroup = jest.fn();
      const many = Array.from({ length: SEARCH_FROM }, (_, i) => ({ ...skills[i % 3], id: i + 10, skill_name: `Skill ${i}` }));
      const view = render({ onMoveGroup, records: many });
      const up = view.container.querySelector('[aria-label="Move Programming Languages up"]');
      expect(up.disabled).toBe(true);
      click(view.container.querySelector('[aria-label="Move Cloud Platforms up"]'));
      expect(onMoveGroup).toHaveBeenCalledWith(1, -1, expect.any(Array));
      expect(onMoveGroup.mock.calls[0][2].map((g) => g.label)).toEqual(['Programming Languages', 'Cloud Platforms']);
      setInputValue(view.container.querySelector('.deck__search input'), 'skill 1');
      expect(view.container.querySelector('.deck__group-tools')).toBeNull();
      view.unmount();
    });
  });

  it('gives a schema without an order column still cards with no drag wiring', () => {
    const plain = { ...projectsSchema, orderKey: undefined };
    const view = mount(<Deck schema={plain} records={rows(3)} loading={false} error={null} onOpen={() => {}} onCreate={() => {}} onReorder={() => {}} />);
    expect(view.container.querySelectorAll('article.card')).toHaveLength(3);
    expect(view.container.querySelector('[aria-roledescription="sortable"]')).toBeNull();
    expect(view.container.textContent).not.toContain('drag to reorder');
    view.unmount();
  });
});
