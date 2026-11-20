/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
import StarRail from './StarRail';
import { CHAPTERS } from './chapters';
import { React, click, mount } from '../SkyBackground/testUtils';

describe('StarRail', () => {
  it('names one mark per chapter, lights the live one and jumps on a click', () => {
    const onJump = jest.fn();
    const view = mount(<StarRail active={2} onJump={onJump} names={{ UMa: 'Ursa Major' }} />);
    const dots = [...view.container.querySelectorAll('.voyage-rail__dot')];
    expect(dots).toHaveLength(CHAPTERS.length);
    expect(dots[1].getAttribute('aria-label')).toBe('Mission control (Ursa Major)');
    expect(dots[2].getAttribute('aria-current')).toBe('true');
    expect(dots[1].getAttribute('aria-current')).toBeNull();
    click(dots[5]);
    expect(onJump).toHaveBeenCalledWith(5);
    view.unmount();
  });

  it('names the prologue for the night scene by default and for the day scene in the light theme', () => {
    const night = mount(<StarRail active={0} onJump={() => {}} />);
    expect(night.container.querySelector('.voyage-rail__dot').getAttribute('aria-label')).toBe('Earth (Low Earth orbit)');
    night.unmount();
    const day = mount(<StarRail active={0} onJump={() => {}} theme="light" />);
    expect(day.container.querySelector('.voyage-rail__dot').getAttribute('aria-label')).toBe('Earth (Inner solar system)');
    expect(day.container.querySelector('.voyage-rail__dot').getAttribute('data-name')).toBe('Earth · Inner solar system');
    day.unmount();
  });
});
