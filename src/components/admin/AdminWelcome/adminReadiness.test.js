import { isDashboardReady, markDashboardReady, onDashboardReady, resetDashboardReady } from './adminReadiness';

beforeEach(() => resetDashboardReady());

describe('dashboard readiness signal', () => {
  it('calls back when the dashboard reports, once, and at once if already ready', () => {
    const calls = [];
    onDashboardReady(() => calls.push('a'));
    expect(isDashboardReady()).toBe(false);
    markDashboardReady();
    markDashboardReady();
    onDashboardReady(() => calls.push('b'));
    expect(calls).toEqual(['a', 'b']);
  });

  it('lets a listener unsubscribe before the signal', () => {
    const calls = [];
    const off = onDashboardReady(() => calls.push('x'));
    off();
    markDashboardReady();
    expect(calls).toEqual([]);
  });
});
