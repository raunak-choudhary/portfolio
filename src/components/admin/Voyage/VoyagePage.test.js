/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
import { ThemeProvider } from '../../../contexts/ThemeContext';
import { CHAPTERS } from './chapters';
import VoyagePage from './VoyagePage';
import { React, act, click, mount, stubCanvas } from '../SkyBackground/testUtils';
import { isDashboardReady, resetDashboardReady } from '../AdminWelcome/adminReadiness';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
jest.mock('./skyField', () => ({ createSkyField: jest.fn(), webglAvailable: () => false }));
// cmdk ships package "exports" this Jest cannot resolve; the palette is verified in the real browser.
// The stand-in honours the same props so the page's wiring (open on Cmd+K, jump, actions) is still exercised.
jest.mock('./CommandPalette', () => {
  const React = require('react');
  const { CHAPTERS } = require('./chapters');
  return function MockPalette({ open, onOpenChange, onJump, actions = [] }) {
    React.useEffect(() => { const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') onOpenChange(!open); }; global.document.addEventListener('keydown', onKey); return () => global.document.removeEventListener('keydown', onKey); }, [open, onOpenChange]);
    if (!open) return null;
    return React.createElement('div', { className: 'voyage-palette' },
      CHAPTERS.map((c, i) => React.createElement('button', { key: c.id, 'data-cmdk-item': '', onClick: () => { onJump(i); onOpenChange(false); } }, c.name)),
      actions.map((a) => React.createElement('button', { key: a.id, 'data-cmdk-item': '', onClick: () => { a.run(); onOpenChange(false); } }, a.label)));
  };
});
jest.mock('../../../services/dataService', () => ({ getPortfolioStats: jest.fn() }));
jest.mock('../../../services/analyticsService', () => ({ __esModule: true, default: { getPortfolioHealth: jest.fn() } }));
// voyageData pulls in the Supabase client, which needs env; the tiles only need these five names.
jest.mock('../../../services/voyageData', () => ({
  getVisitorSeries: jest.fn(), getUnreadMessages: jest.fn(), getRecentEdits: jest.fn(), getTopPages: jest.fn(), relativeTime: () => 'just now',
}));
jest.mock('../../../services/adminSessionFacts', () => ({ startSession: jest.fn() }));
const { getPortfolioStats } = jest.requireMock('../../../services/dataService');
const analyticsService = jest.requireMock('../../../services/analyticsService').default;
const voyageData = jest.requireMock('../../../services/voyageData');

const health = {
  summary: { score: 86, status: 'needs_attention', issueCounts: { critical: 1, warning: 1, info: 0 } },
  sections: [
    { name: 'Projects', completeness: 96, issues: [] },
    { name: 'Work', completeness: 30, issues: [{ severity: 'critical', message: 'Systems Engineer is missing position.' }] },
  ],
};

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); await Promise.resolve(); });

describe('VoyagePage (2D fallback)', () => {
  let canvas, matchMediaOriginal;

  beforeEach(() => {
    canvas = stubCanvas();
    resetDashboardReady();
    global.fetch = jest.fn((url) => Promise.resolve({ ok: true, json: () => Promise.resolve(String(url).includes('manifest') ? [] : { figures: [{ id: 'UMa', name: 'Ursa Major', lines: [[[0, 0], [1, 1]]], verts: [{ x: 0, y: 0, mag: 2 }], box: { x0: 0, x1: 1, y0: 0, y1: 1 }, art: null }] }) }));
    matchMediaOriginal = window.matchMedia;
    window.matchMedia = () => ({ matches: false });
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    window.scrollTo = jest.fn();
    Element.prototype.scrollIntoView = jest.fn();
    getPortfolioStats.mockResolvedValue({ projects: 30, skills: 110, messages: 0 });
    analyticsService.getPortfolioHealth.mockResolvedValue(health);
    voyageData.getVisitorSeries.mockResolvedValue({ days: [{ date: '2026-11-12', views: 3, visitors: 2 }], totalViews: 3, totalVisitors: 2, previousVisitors: 1 });
    voyageData.getUnreadMessages.mockResolvedValue({ count: 2, latest: [{ id: '1', name: 'NYU Career Services', subject: 'Hello', createdAt: new Date().toISOString() }] });
    voyageData.getRecentEdits.mockResolvedValue([{ section: 'Projects', label: 'Tallyproof', at: new Date().toISOString() }]);
    voyageData.getTopPages.mockResolvedValue([{ page: '/home', views: 94 }, { page: '/projects', views: 20 }]);
    mockNavigate.mockClear();
  });

  afterEach(() => { canvas.restore(); jest.restoreAllMocks(); delete global.fetch; window.matchMedia = matchMediaOriginal; window.sessionStorage.clear(); window.localStorage.clear(); });

  const render = () => mount(<ThemeProvider><VoyagePage /></ThemeProvider>);

  it('mounts sixteen chapters on the 2D sky, lifts the body transform, and reports the dashboard ready', async () => {
    document.body.style.transform = 'scale(1)';
    const view = render();
    await flush();
    expect(view.container.querySelectorAll('.voyage-chapter')).toHaveLength(CHAPTERS.length);
    expect(view.container.querySelector('.voyage--flat')).not.toBeNull();
    expect(view.container.querySelector('.sky-background')).not.toBeNull();
    expect(document.body.style.getPropertyValue('transform')).toBe('none');
    expect(isDashboardReady()).toBe(true);
    const titles = [...view.container.querySelectorAll('.voyage-chapter__title')].map((h) => h.textContent);
    expect(titles[0]).toMatch(/^Good (morning|afternoon|evening|night), Raunak$/); expect(titles[1]).toBe('Mission control'); expect(titles[4]).toBe('Projects'); expect(titles[16]).toBe('Security');
    expect(view.container.querySelector('#chapter-earth .voyage-placeholder')).toBeNull();
    view.unmount();
    expect(document.body.style.getPropertyValue('transform')).toBe('scale(1)');
    document.body.style.removeProperty('transform');
  });

  it('fills mission control with the loaded facts and counts the deck chapters', async () => {
    const view = render();
    await flush();
    const bento = view.container.querySelector('[data-testid="bento"]');
    expect(bento.querySelectorAll('.tile')).toHaveLength(8);
    expect(bento.textContent).toContain('86');
    expect(bento.textContent).toContain('1 strong · 1 need attention');
    expect(bento.textContent).toContain('Systems Engineer is missing position.');
    expect(bento.textContent).toContain('NYU Career Services');
    expect(bento.textContent).toContain('/home');
    expect(bento.textContent).toContain('Tallyproof');
    const projects = view.container.querySelector('#chapter-projects');
    expect(projects.textContent).toContain('30');
    expect(projects.textContent).toContain('items in this section');
    view.unmount();
  });

  it('jumps from the rail and the palette, and opens the classic dashboard from an action', async () => {
    const view = render();
    await flush();
    const dots = view.container.querySelectorAll('.voyage-rail__dot');
    expect(dots).toHaveLength(17);
    expect(dots[0].textContent).toBe('⊕');
    click(dots[4]);
    expect(window.scrollTo).toHaveBeenCalled();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true })); });
    const palette = document.querySelector('.voyage-palette');
    expect(palette).not.toBeNull();
    const items = [...palette.querySelectorAll('[data-cmdk-item]')];
    expect(items.length).toBeGreaterThanOrEqual(16);
    const classic = items.find((i) => i.textContent.includes('classic dashboard'));
    click(classic);
    expect(mockNavigate).toHaveBeenCalledWith('/admindashboard');
    expect(document.querySelector('.voyage-palette')).toBeNull();
    view.unmount();
  });

  it('holds the managers back until an authenticator is confirmed', async () => {
    const view = mount(<ThemeProvider><VoyagePage requireSecurityEnrollment /></ThemeProvider>);
    await flush();
    expect(view.container.querySelector('.voyage-notice').textContent).toMatch(/authenticator/);
    expect(view.container.querySelector('[data-testid="bento"]')).toBeNull();
    view.unmount();
  });
});
