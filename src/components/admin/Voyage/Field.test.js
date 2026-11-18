/* eslint-disable testing-library/no-container, testing-library/no-node-access */
// Each control the schema kinds render: label, counter, the accessible error
// wiring, and what a click or a keystroke hands back through onChange.

import Field from './Field';
import { React, act, click, mount, setInputValue } from '../SkyBackground/testUtils';

const show = (props) => mount(<Field value="" onChange={() => {}} {...props} />);
const press = (input, key) => act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
const button = (root, text) => [...root.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || b.textContent.trim()) === text);
const upload = (over = {}) => ({ onUpload: jest.fn(), onRemove: jest.fn(), busy: false, canUpload: true, singular: 'skill', accept: ['image/png'], problems: [], ...over });

describe('Field', () => {
  it('links an error to its control with aria-invalid and aria-describedby, and shows help otherwise', () => {
    const field = { key: 't', label: 'Title', kind: 'text', max: 10, required: true, help: 'Short.' };
    const okView = show({ field, value: 'Hello' });
    const input = okView.container.querySelector('input');
    expect(okView.container.querySelector('label').textContent).toBe('Title *');
    expect(okView.container.querySelector('.field__count').textContent).toBe('5/10');
    expect(document.getElementById(input.getAttribute('aria-describedby')).textContent).toBe('Short.');
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    okView.unmount();
    const badView = show({ field, value: '', error: 'Title is required.' });
    const badInput = badView.container.querySelector('input');
    expect(badInput.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(badInput.getAttribute('aria-describedby')).textContent).toBe('Title is required.');
    badView.unmount();
  });

  it('disables a date while its toggle is on and shows the disabled help', () => {
    const field = { key: 'end', label: 'End date', kind: 'date', disabledWhen: 'current', disabledHelp: 'Cleared while current.', max: 'today' };
    const view = show({ field, value: '2026-01-01', form: { current: true } });
    const input = view.container.querySelector('input[type="date"]');
    expect(input.disabled).toBe(true); expect(input.value).toBe('');
    expect(input.getAttribute('max')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(view.container.textContent).toContain('Cleared while current.');
    expect(view.container.querySelector('.field').classList.contains('is-disabled')).toBe(true);
    view.unmount();
  });

  it('offers an empty choice and keeps an unknown stored value selectable', () => {
    const field = { key: 's', label: 'Skill type', kind: 'select', allowEmpty: true, emptyLabel: 'Select a type', options: [{ value: 'A', label: 'A' }] };
    const view = show({ field, value: 'Legacy' });
    expect([...view.container.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Select a type', 'Legacy (not in the list)', 'A']);
    expect(view.container.querySelector('select').value).toBe('Legacy');
    view.unmount();
  });

  it('rates with a radio group and clears', () => {
    const onChange = jest.fn();
    const view = show({ field: { key: 'r', label: 'Rating', kind: 'rating' }, value: 3, onChange });
    const group = view.container.querySelector('[role="radiogroup"]');
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(5);
    expect(group.querySelector('[aria-checked="true"]').getAttribute('aria-label')).toBe('3 of 5');
    expect(group.querySelectorAll('.is-on')).toHaveLength(3);
    click(button(view.container, '5 of 5'));
    expect(onChange).toHaveBeenLastCalledWith(5);
    click(button(view.container, 'Clear'));
    expect(onChange).toHaveBeenLastCalledWith('');
    view.unmount();
  });

  it('edits tags in place, adds on Enter, and hides the add box when full', () => {
    const onChange = jest.fn();
    const field = { key: 'h', label: 'Highlights', kind: 'tags', editable: true, max: 3 };
    const view = show({ field, value: ['One', 'Two'], onChange });
    expect(view.container.querySelector('.field__count').textContent).toBe('2/3 items');
    setInputValue(view.container.querySelector('input[aria-label="Highlights 2"]'), 'Too');
    expect(onChange).toHaveBeenLastCalledWith(['One', 'Too']);
    const add = view.container.querySelector('.chips__add input');
    setInputValue(add, 'Three');
    press(add, 'Enter');
    expect(onChange).toHaveBeenLastCalledWith(['One', 'Two', 'Three']);
    click(button(view.container, 'Remove highlights 1'));
    expect(onChange).toHaveBeenLastCalledWith(['Two']);
    view.rerender(<Field field={field} value={['1', '2', '3']} onChange={onChange} />);
    expect(view.container.querySelector('.chips__add')).toBeNull();
    view.unmount();
  });

  it('offers suggestions through a datalist', () => {
    const view = show({ field: { key: 't', label: 'Skills', kind: 'tags', suggestions: ['React', 'Rust'] }, value: [] });
    const input = view.container.querySelector('.chips__add input');
    const list = document.getElementById(input.getAttribute('list'));
    expect([...list.querySelectorAll('option')].map((o) => o.value)).toEqual(['React', 'Rust']);
    view.unmount();
  });

  it('edits, moves and adds pair rows', () => {
    const onChange = jest.fn();
    const value = [{ key: 'A', value: '1' }, { key: 'B', value: '2' }];
    const view = show({ field: { key: 'p', label: 'Basic info', kind: 'pairs', max: 10 }, value, onChange });
    expect(view.container.querySelector('[role="group"]')).not.toBeNull();
    // the value is a one-row textarea that grows, so a long value is never cut off at the edge
    const valueBox = view.container.querySelector('textarea[aria-label="Value 2"]');
    expect(valueBox.getAttribute('rows')).toBe('1');
    setInputValue(valueBox, '22');
    expect(onChange).toHaveBeenLastCalledWith([{ key: 'A', value: '1' }, { key: 'B', value: '22' }]);
    setInputValue(valueBox, 'Open to\nwork');   // a pasted line break becomes a space
    expect(onChange).toHaveBeenLastCalledWith([{ key: 'A', value: '1' }, { key: 'B', value: 'Open to work' }]);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    act(() => { valueBox.dispatchEvent(enter); });
    expect(enter.defaultPrevented).toBe(true);
    expect(button(view.container, 'Move row 1 up').disabled).toBe(true);
    click(button(view.container, 'Move row 1 down'));
    expect(onChange).toHaveBeenLastCalledWith([{ key: 'B', value: '2' }, { key: 'A', value: '1' }]);
    click(button(view.container, 'Add row'));
    expect(onChange).toHaveBeenLastCalledWith([...value, { key: '', value: '' }]);
    click(button(view.container, 'Remove row 1'));
    expect(onChange).toHaveBeenLastCalledWith([{ key: 'B', value: '2' }]);
    view.unmount();
  });

  it('asks for a first save before a single upload, then offers Replace and Remove', () => {
    const field = { key: 'icon_url', label: 'Icon', kind: 'image' };
    const laterView = show({ field, value: '', upload: upload({ canUpload: false }) });
    expect(laterView.container.textContent).toContain('Save the skill once, then add an image.');
    expect(laterView.container.querySelector('input[type="file"]')).toBeNull();
    laterView.unmount();
    const up = upload({ problems: [{ name: 'big.png', message: 'is 9 MB; the limit is 5 MB.' }] });
    const view = show({ field, value: 'https://cdn/x/icon.png', upload: up });
    expect(view.container.querySelector('.upload__current img').getAttribute('src')).toBe('https://cdn/x/icon.png');
    const picker = view.container.querySelector('input[type="file"]');
    expect(picker.getAttribute('accept')).toBe('image/png');
    expect(document.getElementById(picker.getAttribute('aria-describedby')).textContent).toContain('big.png is 9 MB');
    expect(view.container.textContent).toContain('Replace');
    click(button(view.container, 'Remove'));
    expect(up.onRemove).toHaveBeenCalledWith('https://cdn/x/icon.png');
    view.unmount();
  });

  it('lists files by name, keeps typed names, and removes each the right way', () => {
    const onChange = jest.fn();
    const up = upload();
    const value = ['AWS SAA', 'https://x.supabase.co/storage/v1/object/public/skill-icons/c/My%20Cert.pdf'];
    const view = show({ field: { key: 'c', label: 'Certifications', kind: 'files', allowText: true, max: 20 }, value, onChange, upload: up });
    const link = view.container.querySelector('a.file-link');
    expect(link.textContent).toBe('My Cert.pdf');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    click(button(view.container, 'Remove AWS SAA'));
    expect(onChange).toHaveBeenLastCalledWith([value[1]]);
    click(button(view.container, 'Remove My Cert.pdf'));
    expect(up.onRemove).toHaveBeenCalledWith(value[1]);
    const text = view.container.querySelector('.chips__add input');
    setInputValue(text, 'GCP ACE');
    press(text, 'Enter');
    expect(onChange).toHaveBeenLastCalledWith([...value, 'GCP ACE']);
    expect(view.container.querySelector('input[type="file"]').multiple).toBe(true);
    view.unmount();
  });

  it('shows a derived value read-only and a numeric text field as typed', () => {
    const derivedView = show({ field: { key: 'w', label: 'Words', kind: 'derived', compute: (f) => f.text.split(' ').length }, form: { text: 'a b c' } });
    expect(derivedView.container.querySelector('output').textContent).toBe('3');
    derivedView.unmount();
    const onChange = jest.fn();
    const gpaView = show({ field: { key: 'g', label: 'GPA', kind: 'numeric' }, value: '3.50', onChange });
    const input = gpaView.container.querySelector('input');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    setInputValue(input, '3.90');
    expect(onChange).toHaveBeenLastCalledWith('3.90');
    gpaView.unmount();
  });
});
