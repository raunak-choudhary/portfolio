/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
import ButtonSpinner from './ButtonSpinner';
import { React, mount } from '../admin/SkyBackground/testUtils';

describe('ButtonSpinner', () => {
  it('renders one inline status element with no text of its own', () => {
    const view = mount(<ButtonSpinner label="Sending" />);
    const spinner = view.container.querySelector('.button-spinner');
    expect(spinner.tagName).toBe('SPAN');
    expect(spinner.getAttribute('role')).toBe('status');
    expect(spinner.getAttribute('aria-label')).toBe('Sending');
    expect(view.container.textContent).toBe('');
    view.unmount();
  });
});
