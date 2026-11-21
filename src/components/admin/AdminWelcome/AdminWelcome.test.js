/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
// The entry screen and the dashboard meet through adminReadiness: the
// dashboard reports its first data, the entry stops waiting. This checks the
// order they are wired in. The reset used to run in an effect of the parent,
// which React runs after the children's effects, so it wiped the entry's
// subscription and the entry always waited out its full cap.

import AdminWelcome from './AdminWelcome';
import { isDashboardReady, markDashboardReady, onDashboardReady } from './adminReadiness';
import { React, act, mount } from '../SkyBackground/testUtils';

jest.mock('../../../contexts/AuthContext', () => ({ useAuthContext: () => ({ assurance: { currentLevel: 'aal2' } }) }));
jest.mock('../../../services/supabaseClient', () => {
  const answer = Promise.resolve({ count: 0, error: null });
  const query = { select: () => query, eq: () => query, neq: () => query, not: () => query, limit: () => answer };
  return { supabase: { from: () => query } };
});
jest.mock('../Voyage/VoyagePage', () => () => null);

const mockHeard = { count: 0, readyAtSubscribe: null };
jest.mock('./MatrixEntry', () => {
  const { useEffect } = jest.requireActual('react');
  const readiness = jest.requireActual('./adminReadiness');
  // subscribes in an effect, as the real entry does
  return function MatrixEntryStandIn() {
    useEffect(() => {
      mockHeard.readyAtSubscribe = readiness.isDashboardReady();
      return readiness.onDashboardReady(() => { mockHeard.count += 1; });
    }, []);
    return null;
  };
});

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe('AdminWelcome', () => {
  beforeEach(() => { mockHeard.count = 0; mockHeard.readyAtSubscribe = null; });

  it('lets the entry hear the dashboard report in', async () => {
    const view = mount(<AdminWelcome />);
    await flush();
    expect(mockHeard.count).toBe(0);
    act(() => { markDashboardReady(); });
    expect(mockHeard.count).toBe(1);
    view.unmount();
  });

  it('forgets an earlier dashboard before the entry subscribes', async () => {
    markDashboardReady();   // left over from a previous entry in this page
    expect(isDashboardReady()).toBe(true);
    const view = mount(<AdminWelcome />);
    await flush();
    expect(mockHeard.readyAtSubscribe).toBe(false);
    expect(mockHeard.count).toBe(0);
    const late = jest.fn();
    onDashboardReady(late);
    expect(late).not.toHaveBeenCalled();
    view.unmount();
  });

  it('marks this browser as the owner\'s, so its public visits are never counted', async () => {
    window.localStorage.clear();
    const view = mount(<AdminWelcome />);
    await flush();
    expect(window.localStorage.getItem('rc-owner-device')).toBe('1');
    view.unmount();
    // sign-out does not clear it
    expect(window.localStorage.getItem('rc-owner-device')).toBe('1');
  });
});
