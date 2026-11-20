/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
// The dashboard gate. Covers the hand-off from the authenticator step: a
// verified code lifts the session to level 2 through an auth event before
// step 03 has played, so the code step holds the route until it lets go.

import AppRouter, { ProtectedAdminRoute } from './Router';
import { beginFilmHandoff, cancelFilmHandoff } from './services/signOutHandoff';
import { React, act, mount } from './components/admin/SkyBackground/testUtils';

// react-router 7 ships package exports that this Jest cannot resolve; the gate only needs these.
// Routes lists each route's path and, for a redirect, its target, so the
// route table can be read without a real router.
jest.mock('react-router-dom', () => {
  const mockReact = require('react');
  const Navigate = () => <p data-testid="navigate" />;
  return {
    Navigate,
    Route: () => null,
    Routes: ({ children }) => (
      <ul data-testid="routes">
        {mockReact.Children.map(children, (route) => (
          <li data-path={route.props.path} data-redirect={route.props.element.type === Navigate ? route.props.element.props.to : ''} />
        ))}
      </ul>
    ),
    useLocation: () => ({ pathname: '/admindashboard' })
  };
});

let mockAuth;
jest.mock('./contexts/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuthContext: () => mockAuth
}));

// The public pages and site chrome are not under test here.
jest.mock('./components/common/Header', () => () => null);
jest.mock('./components/common/Footer', () => () => null);
jest.mock('./pages/LandingPage', () => () => null);
jest.mock('./pages/ProjectsPage', () => () => null);
jest.mock('./pages/InternshipsPage', () => () => null);
jest.mock('./pages/EducationPage', () => () => null);
jest.mock('./pages/WorkExperiencePage', () => () => null);
jest.mock('./pages/SkillsPage', () => () => null);
jest.mock('./pages/CertificationsPage', () => () => null);
jest.mock('./pages/RecommendationsPage', () => () => null);
jest.mock('./pages/AchievementsPage', () => () => null);
jest.mock('./pages/LeadershipPage', () => () => null);
jest.mock('./components/admin/AdminLogin/AdminLogin', () => () => null);
jest.mock('./components/admin/AdminSignOut/AdminSignOut', () => () => null);

let mockHold;
jest.mock('./components/admin/AdminLogin/MfaCodeStep', () => (props) => {
  mockHold = props.onHoldChange;
  return <p data-testid="code-step" />;
});
jest.mock('./components/admin/AdminWelcome/AdminWelcome', () => (props) => <p data-testid="dashboard" data-locked={String(props.requireSecurityEnrollment)} />);

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const shown = (container) => container.querySelector('[data-testid]')?.dataset.testid || 'fallback';

const session = (level) => ({
  isAuthenticated: true,
  isLoading: false,
  sessionChecked: true,
  assurance: { checked: true, needsSecondFactor: level === 1, needsEnrollment: false }
});

describe('ProtectedAdminRoute', () => {
  it('sends a signed-out visitor to the login page', async () => {
    mockAuth = { ...session(1), isAuthenticated: false };
    const view = mount(<ProtectedAdminRoute />);
    await flush();
    expect(shown(view.container)).toBe('navigate');
    view.unmount();
  });

  it('keeps the code step on screen through the launch, then opens the dashboard', async () => {
    mockAuth = session(1);
    const view = mount(<ProtectedAdminRoute />);
    await flush();
    expect(shown(view.container)).toBe('code-step');

    // submit: the step holds the route, then the auth event raises the session
    act(() => mockHold(true));
    mockAuth = session(2);
    view.rerender(<ProtectedAdminRoute />);
    await flush();
    expect(shown(view.container)).toBe('code-step');

    // step 03 has played and the step lets go
    act(() => mockHold(false));
    await flush();
    expect(shown(view.container)).toBe('dashboard');
    view.unmount();
  });

  it('a released hold at level 1 (a wrong code) stays on the code step', async () => {
    mockAuth = session(1);
    const view = mount(<ProtectedAdminRoute />);
    await flush();
    act(() => mockHold(true));
    act(() => mockHold(false));
    await flush();
    expect(shown(view.container)).toBe('code-step');
    view.unmount();
  });

  const enrolling = () => ({ ...session(1), assurance: { checked: true, needsSecondFactor: false, needsEnrollment: true } });
  const locked = (container) => container.querySelector('[data-testid="dashboard"]')?.dataset.locked;

  it('opens the unlocked dashboard after the second step', async () => {
    mockAuth = session(2);
    const view = mount(<ProtectedAdminRoute />);
    await flush();
    expect(shown(view.container)).toBe('dashboard');
    expect(locked(view.container)).toBe('false');
    view.unmount();
  });

  it('opens a session with no authenticator on the locked voyage', async () => {
    mockAuth = enrolling();
    const view = mount(<ProtectedAdminRoute />);
    await flush();
    expect(shown(view.container)).toBe('dashboard');
    expect(locked(view.container)).toBe('true');
    view.unmount();
  });

  it('holds a dark screen, not the login, while sign out everywhere hands over to the film', async () => {
    mockAuth = { ...session(2), isAuthenticated: false };
    beginFilmHandoff();
    const view = mount(<ProtectedAdminRoute />);
    await flush();
    expect(shown(view.container)).toBe('fallback');
    cancelFilmHandoff();
    view.rerender(<ProtectedAdminRoute />);
    await flush();
    expect(shown(view.container)).toBe('navigate');
    view.unmount();
  });
});

describe('admin routes', () => {
  const routes = () => {
    mockAuth = session(2);
    const view = mount(<AppRouter />);
    const table = Object.fromEntries([...view.container.querySelectorAll('[data-path]')].map((li) => [li.dataset.path, li.dataset.redirect]));
    view.unmount();
    return table;
  };

  it('serves the dashboard at /admindashboard', () => {
    expect(routes()['/admindashboard']).toBe('');
  });

  it('sends the retired /classic and /voyage addresses to the dashboard', () => {
    const table = routes();
    expect(table['/admindashboard/classic']).toBe('/admindashboard');
    expect(table['/admindashboard/voyage']).toBe('/admindashboard');
  });
});
