/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
import { ThemeProvider } from '../../../contexts/ThemeContext';
import { CHAPTERS } from './chapters';
import { VOYAGE_POSITION_KEY } from '../../../services/voyagePosition';
import VoyagePage, { ENROLMENT_LOCK_TEXT, VOYAGE_ROOT_CLASS } from './VoyagePage';
import { React, act, click, mount, stubCanvas } from '../SkyBackground/testUtils';
import { isDashboardReady, resetDashboardReady } from '../AdminWelcome/adminReadiness';
import { openRecord, queueRequests, recordIntent, showQueue } from './recordIntent';

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
jest.mock('../../../services/fixDismissalsService', () => ({ DISMISSALS_NOT_SET_UP: 'DISMISSALS_NOT_SET_UP', listDismissals: jest.fn(), dismiss: jest.fn(), restore: jest.fn() }));
jest.mock('../../../services/fixQueueData', () => ({ loadFixQueueData: () => new Promise(() => {}) }));   // a plain function: the suite resets jest.fn mocks
// the decks load through the records service, which also needs the Supabase client; the page test checks the wiring only
// the history line and the activity pane read through the activity service, which opens the Supabase client
jest.mock('../../../services/activityService', () => ({ ACTIVITY_NOT_SET_UP: 'ACTIVITY_NOT_SET_UP', listActivity: jest.fn(), listDeletedRecords: jest.fn(), recordHistory: jest.fn(), isActivityAvailable: jest.fn(), logSecurityEvent: jest.fn() }));
jest.mock('../../../services/voyageRecords', () => ({ listRecords: jest.fn(), saveRecord: jest.fn(), deleteRecord: jest.fn(), reorderRecords: jest.fn(), uploadImages: jest.fn(), removeImage: jest.fn(), imageProblems: jest.fn(), failureKind: jest.fn(), fetchUpdatedAt: jest.fn(), getRecord: jest.fn() }));
// the inbox reads through its own service, which also needs the Supabase client
jest.mock('../../../services/inboxService', () => ({ listMessages: jest.fn(), updateMessages: jest.fn(), deleteMessages: jest.fn(), signedAttachmentUrl: jest.fn(), SIGNED_URL_SECONDS: 300 }));
const inboxService = jest.requireMock('../../../services/inboxService');
jest.mock('../../../services/mediaLibraryService', () => ({ getMediaLibrarySnapshot: jest.fn(), createMediaSignedUrl: jest.fn(), MEDIA_LIBRARY_BUCKETS: [] }));
const mediaLibrary = jest.requireMock('../../../services/mediaLibraryService');
// the Security chapter has its own tests; here only its place on the page and the sign-out hand-over are checked
jest.mock('./SecurityChapter', () => {
  const React = require('react');
  return function MockSecurity({ onLeave }) { return React.createElement('button', { 'data-testid': 'security-chapter', onClick: onLeave }, 'Sign out everywhere'); };
});
// the analytics chapter reads through its own services; the page test checks that it mounts in place of the placeholder
jest.mock('../../../services/insightsService', () => ({ loadInsights: jest.fn() }));
jest.mock('../../../services/reportsService', () => ({ REPORT_MESSAGES: { UNKNOWN: 'x' }, listReports: jest.fn(), generateReport: jest.fn() }));
jest.mock('../../../services/reportsTableProbe', () => ({ reportsTableMissing: jest.fn() }));
jest.mock('./TrendChart', () => () => null);
const insightsService = jest.requireMock('../../../services/insightsService');
const { getPortfolioStats } = jest.requireMock('../../../services/dataService');
const analyticsService = jest.requireMock('../../../services/analyticsService').default;
const voyageData = jest.requireMock('../../../services/voyageData');
const voyageRecords = jest.requireMock('../../../services/voyageRecords');
const activity = jest.requireMock('../../../services/activityService');

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
    // the activity table is missing, as before its migration runs
    activity.listActivity.mockRejectedValue(Object.assign(new Error('This is not set up yet.'), { code: 'ACTIVITY_NOT_SET_UP' }));
    activity.recordHistory.mockRejectedValue(Object.assign(new Error('This is not set up yet.'), { code: 'ACTIVITY_NOT_SET_UP' }));
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
    voyageRecords.listRecords.mockResolvedValue([{ id: 'p1', title: 'Tallyproof', order_index: 30, technologies: ['React'] }]);
    mediaLibrary.getMediaLibrarySnapshot.mockResolvedValue({ buckets: [], items: [{ id: 'project-images:a.png', bucketId: 'project-images', bucketLabel: 'Project Images', path: 'a.png', name: 'a.png', kind: 'image', status: 'referenced', previewUrl: null }], summary: {}, generatedAt: '' });
    inboxService.listMessages.mockResolvedValue([{ id: 'm1', name: 'Test Sender', email: 'sender@example.com', subject: 'Hello', message: 'Hi', status: 'unread', created_at: new Date().toISOString() }]);
    insightsService.loadInsights.mockResolvedValue({ current: [{ id: 'e1', session_id: 's1', created_at: new Date().toISOString(), event_type: 'page_view', event_action: 'view_page', event_label: 'home' }], before: [], projects: [], firstEngaged: null, firstProjectOpen: null, freshness: [], truncated: false });
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
    // the public gradient scrollbars are overridden only while the voyage is mounted
    expect(document.documentElement.classList.contains(VOYAGE_ROOT_CLASS)).toBe(true);
    view.unmount();
    expect(document.documentElement.classList.contains(VOYAGE_ROOT_CLASS)).toBe(false);
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
    expect(bento.textContent).toContain('Tallyproof');   // the activity table is missing: the tile falls back to the latest saves
    expect(bento.textContent).toContain('Recent activity');
    // V5: Mission Control adds the split with the activity pane under the bento
    const split = view.container.querySelector('#chapter-overview [data-testid="mission-split"]');
    expect(split.querySelector('[data-testid="activity-pane"]').textContent).toContain('Not set up yet.');
    expect(split.firstElementChild.dataset.testid).toBe('fix-queue');   // the fix queue fills Mission Control's slot, left of the activity
    const projects = view.container.querySelector('#chapter-projects');
    expect(projects.querySelector('[data-testid="deck"]')).not.toBeNull();   // Projects has a schema: it gets the deck
    expect(projects.textContent).toContain('Tallyproof'); expect(projects.textContent).toContain('New project');
    expect(view.container.querySelector('#chapter-skills [data-testid="deck"]')).not.toBeNull();   // grouped deck since V3a
    expect(view.container.querySelector('#chapter-hero [data-testid="singleton"]')).not.toBeNull();   // one record, no deck
    expect(view.container.querySelector('#chapter-hero [data-testid="deck"]')).toBeNull();
    expect(view.container.querySelector('#chapter-about [data-testid="singleton"]')).not.toBeNull();
    ['education', 'work', 'internships', 'certifications', 'achievements', 'leadership', 'recommendations'].forEach((id) => {
      expect([id, view.container.querySelector(`#chapter-${id} [data-testid="deck"]`) !== null]).toEqual([id, true]);   // V3b: the seven list sections
    });
    expect(view.container.querySelector('#chapter-media [data-testid="media"]').textContent).toContain('a.png');   // V4a: storage is its source
    expect(view.container.querySelector('#chapter-media .voyage-placeholder')).toBeNull();
    expect(view.container.querySelector('#chapter-analytics .voyage-placeholder')).toBeNull();   // V4b: the four questions
    expect(view.container.querySelector('#chapter-analytics [data-testid="analytics-chapter"]').textContent).toContain('Is it working?');
    expect(view.container.querySelector('#chapter-analytics .voyage-chapter__sub').textContent).toBe('Who visits, what they look at, and whether they reach out.');
    expect(view.container.querySelector('#chapter-inbox [data-testid="inbox"]').textContent).toContain('Hello');   // V4a: the telegraph office
    expect(view.container.querySelector('#chapter-inbox .voyage-placeholder')).toBeNull();
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
    expect(mockNavigate).toHaveBeenCalledWith('/admindashboard/classic');
    expect(document.querySelector('.voyage-palette')).toBeNull();
    view.unmount();
  });

  it('records where the camera was before moving to the sign-out film', async () => {
    const frames = [];
    window.requestAnimationFrame.mockImplementation((cb) => { frames.push(cb); return frames.length; });
    const location = window.location;
    delete window.location;
    window.location = { assign: jest.fn() };
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 900 });
    try {
      const view = render();
      await flush();
      act(() => { frames.splice(0).forEach((cb) => cb(16)); });   // one frame of the loop: the stage tops are 0 in jsdom, so 900 px is past the last
      click(view.container.querySelector('.voyage-bar__button[aria-label="Sign out"]'));
      expect(window.location.assign).toHaveBeenCalledWith('/adminsignout');
      const recorded = JSON.parse(window.sessionStorage.getItem(VOYAGE_POSITION_KEY));
      expect(recorded).toEqual({ f: CHAPTERS.length - 1, chapter: 'security', theme: expect.stringMatching(/^(dark|light)$/) });
      view.unmount();
    } finally {
      window.location = location;
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    }
  });

  it('works with the panels on and shows off with them off, marking the page and <html> for the CSS', async () => {
    const working = render();
    await flush();
    expect(working.container.querySelector('.voyage').dataset.mode).toBe('working');
    expect(document.documentElement.dataset.voyageMode).toBe('working');
    working.unmount();
    expect(document.documentElement.dataset.voyageMode).toBeUndefined();
    window.localStorage.setItem('rc-admin-sky', JSON.stringify({ panels: false }));
    const showcase = render();
    await flush();
    expect(showcase.container.querySelector('.voyage').dataset.mode).toBe('showcase');
    expect(document.documentElement.dataset.voyageMode).toBe('showcase');
    showcase.unmount();
  });

  it('lights the rail from the loop without re-rendering the chapters', async () => {
    const frames = [];
    window.requestAnimationFrame.mockImplementation((cb) => { frames.push(cb); return frames.length; });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 900 });
    try {
      const view = render();
      await flush();
      const title = view.container.querySelector('#chapter-projects .voyage-chapter__title');
      act(() => { frames.splice(0).forEach((cb) => cb(16)); });
      const active = view.container.querySelector('.voyage-rail__dot.is-active');
      expect(active.getAttribute('aria-current')).toBe('true');
      expect([...view.container.querySelectorAll('.voyage-rail__dot')].indexOf(active)).toBe(CHAPTERS.length - 1);
      expect(view.container.querySelector('#chapter-projects .voyage-chapter__title')).toBe(title);   // same node: the chapters were not re-mounted
      view.unmount();
    } finally {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    }
  });

  it('forgets intents and queue requests when the voyage unmounts', async () => {
    const view = render();
    await flush();
    act(() => { showQueue(); openRecord('skills', 'nope'); });
    expect(queueRequests.get()).toBeGreaterThan(0);
    view.unmount();
    expect(queueRequests.get()).toBe(0);
    expect(recordIntent.get()).toBeNull();
  });

  it('drops an intent for a chapter held behind the authenticator lock', async () => {
    const view = mount(<ThemeProvider><VoyagePage requireSecurityEnrollment /></ThemeProvider>);
    await flush();
    act(() => openRecord('projects', 'p1', { mode: 'edit' }));
    await flush();
    expect(recordIntent.get()).toBeNull();
    expect(view.container.textContent).toContain('Set up an authenticator app first');
    view.unmount();
  });

  it('holds every chapter but the Earth and Security until an authenticator is confirmed', async () => {
    const view = mount(<ThemeProvider><VoyagePage requireSecurityEnrollment /></ThemeProvider>);
    await flush();
    const notices = view.container.querySelectorAll('.voyage-notice');
    expect(notices).toHaveLength(CHAPTERS.length - 2);
    notices.forEach((n) => expect(n.textContent).toContain(ENROLMENT_LOCK_TEXT));
    expect(view.container.querySelector('#chapter-earth .voyage-notice')).toBeNull();
    expect(view.container.querySelector('#chapter-security .voyage-notice')).toBeNull();
    expect(view.container.querySelector('#chapter-security [data-testid="security-chapter"]')).not.toBeNull();
    expect(view.container.querySelector('#chapter-analytics .voyage-placeholder')).toBeNull();   // placeholders are locked too
    expect(view.container.querySelector('[data-testid="bento"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="inbox"]')).toBeNull();
    expect(inboxService.listMessages).not.toHaveBeenCalled();
    expect(mediaLibrary.getMediaLibrarySnapshot).not.toHaveBeenCalled();
    expect(voyageRecords.listRecords).not.toHaveBeenCalled();
    // the request leads straight to Security
    window.scrollTo.mockClear();
    click(view.container.querySelector('#chapter-projects .voyage-notice button'));
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('places the Security chapter and lets it hand over to the sign-out film', async () => {
    const location = window.location;
    delete window.location;
    window.location = { assign: jest.fn() };
    try {
      const view = render();
      await flush();
      expect(view.container.querySelector('#chapter-security .voyage-chapter__sub').textContent).toBe('Authenticator apps, passkeys and this session.');
      expect(view.container.querySelector('#chapter-security .voyage-placeholder')).toBeNull();
      expect(view.container.querySelectorAll('.voyage-notice')).toHaveLength(0);
      click(view.container.querySelector('[data-testid="security-chapter"]'));
      expect(window.location.assign).toHaveBeenCalledWith('/adminsignout');
      expect(JSON.parse(window.sessionStorage.getItem(VOYAGE_POSITION_KEY)).f).toEqual(expect.any(Number));
      view.unmount();
    } finally {
      window.location = location;
    }
  });
});
