import { supabase } from './supabaseClient';
import {
  ENGAGED_AFTER_MS,
  OWNER_DEVICE_KEY,
  PRODUCTION_HOSTS,
  deviceClassFor,
  initializeVisitorTracking,
  isAdminPath,
  isAnalyticsEnabled,
  isOwnerBrowser,
  isProductionHost,
  looksAutomated,
  markOwnerBrowser,
  pageNameForPath,
  referrerHostFor,
  resetEngagementTrackingForTests,
  shouldTrackVisit,
  startEngagementTimer,
  trackClick,
  trackContactSubmission,
  trackPageView,
  trackProjectLink,
  trackProjectOpen,
  trackReachOut,
  trackSectionView,
  trackingEnvironment,
} from './visitorTrackingService';

jest.mock('./supabaseClient', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

const ORIGINAL_FLAG = process.env.REACT_APP_ANALYTICS_ENABLED;

/** Builds the `from(...).insert(...)` chain and returns the insert mock. */
const mockInsertResult = (result = { error: null }) => {
  const insert = jest.fn().mockResolvedValue(result);
  supabase.from.mockReturnValue({ insert });
  return insert;
};

beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
  resetEngagementTrackingForTests();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  // jsdom serves the page from localhost, which is never counted; the tests of
  // the trackers themselves stand on the live host. The gate has its own tests below.
  jest.spyOn(trackingEnvironment, 'hostname').mockReturnValue('www.raunakchoudhary.com');
});

afterEach(() => {
  process.env.REACT_APP_ANALYTICS_ENABLED = ORIGINAL_FLAG;
  jest.restoreAllMocks();
});

describe('isAnalyticsEnabled', () => {
  it('is true only for the exact string "true"', () => {
    process.env.REACT_APP_ANALYTICS_ENABLED = 'true';
    expect(isAnalyticsEnabled()).toBe(true);
  });

  it.each(['false', 'TRUE', '1', ''])('is false for %p', (value) => {
    process.env.REACT_APP_ANALYTICS_ENABLED = value;
    expect(isAnalyticsEnabled()).toBe(false);
  });

  it('is false when the variable is unset', () => {
    delete process.env.REACT_APP_ANALYTICS_ENABLED;
    expect(isAnalyticsEnabled()).toBe(false);
  });
});

describe('trackers with analytics disabled', () => {
  beforeEach(() => {
    process.env.REACT_APP_ANALYTICS_ENABLED = 'false';
  });

  it.each([
    ['trackPageView', () => trackPageView('home-disabled', 'Home')],
    ['trackSectionView', () => trackSectionView('hero', 'disabled')],
    ['trackContactSubmission', () => trackContactSubmission('recruiter', 'Hello')],
    ['trackClick', () => trackClick('nav', 'projects', '/projects')],
  ])('%s never touches the database', async (_name, track) => {
    await expect(track()).resolves.toBeUndefined();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('initializeVisitorTracking never touches the database', () => {
    initializeVisitorTracking();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('does not mark the visitor as returning when disabled', async () => {
    await trackPageView('home-no-storage', 'Home');
    expect(window.localStorage.getItem('portfolio_visited')).toBeNull();
  });
});

describe('trackers with analytics enabled', () => {
  beforeEach(() => {
    process.env.REACT_APP_ANALYTICS_ENABLED = 'true';
  });

  it('trackPageView inserts one visitor page_view event that matches the insert policy', async () => {
    const insert = mockInsertResult();

    await trackPageView('projects-enabled', 'Projects');

    expect(supabase.from).toHaveBeenCalledWith('analytics_events');
    expect(insert).toHaveBeenCalledTimes(1);
    const [[rows]] = insert.mock.calls;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event_type: 'page_view',
      event_category: 'portfolio',
      user_type: 'visitor',
      event_label: 'projects-enabled',
    });
  });

  it('stores only coarse visitor context: device class, referrer host, returning flag', async () => {
    const insert = mockInsertResult();

    await trackPageView('skills-context', 'Skills');

    const [[rows]] = insert.mock.calls;
    const visitorInfo = rows[0].metadata.visitor_info;
    expect(Object.keys(visitorInfo).sort()).toEqual(['deviceClass', 'isReturningVisitor', 'referrer']);
    expect(['phone', 'tablet', 'desktop']).toContain(visitorInfo.deviceClass);
    expect(visitorInfo.referrer).toBe('direct');
    expect(JSON.stringify(rows[0])).not.toMatch(/userAgent|screenWidth|timezone|language/);
  });

  it('records the same page only once per session and day', async () => {
    const insert = mockInsertResult();

    await trackPageView('skills-dedup', 'Skills');
    await trackPageView('skills-dedup', 'Skills');

    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('trackClick inserts an interaction click event', async () => {
    const insert = mockInsertResult();

    await trackClick('header_navigation', 'projects', '/projects');

    expect(insert.mock.calls[0][0][0]).toMatchObject({
      event_type: 'click',
      event_category: 'interaction',
      user_type: 'visitor',
    });
  });

  it('trackContactSubmission inserts a contact form_submission event', async () => {
    const insert = mockInsertResult();

    await trackContactSubmission('recruiter', 'Opportunity');

    expect(insert.mock.calls[0][0][0]).toMatchObject({
      event_type: 'form_submission',
      event_category: 'contact',
    });
  });

  it('resolves without throwing when the insert returns an error', async () => {
    mockInsertResult({ error: { message: 'permission denied' } });

    await expect(trackClick('footer', 'github', 'https://github.com')).resolves.toBeUndefined();
  });

  it('resolves without throwing when the insert rejects', async () => {
    supabase.from.mockReturnValue({ insert: jest.fn().mockRejectedValue(new Error('network down')) });

    await expect(trackPageView('home-network-failure', 'Home')).resolves.toBeUndefined();
  });
});

describe('visitor context helpers', () => {
  it('deviceClassFor follows the site breakpoints and treats bad input as phone', () => {
    expect(deviceClassFor(375)).toBe('phone');
    expect(deviceClassFor(767)).toBe('phone');
    expect(deviceClassFor(768)).toBe('tablet');
    expect(deviceClassFor(1279)).toBe('tablet');
    expect(deviceClassFor(1280)).toBe('desktop');
    expect(deviceClassFor(undefined)).toBe('phone');
    expect(deviceClassFor(NaN)).toBe('phone');
  });

  it('referrerHostFor keeps only the host and never the path or query', () => {
    expect(referrerHostFor('https://www.linkedin.com/in/someone?trk=abc')).toBe('www.linkedin.com');
    expect(referrerHostFor('https://github.com/')).toBe('github.com');
    expect(referrerHostFor('')).toBe('direct');
    expect(referrerHostFor(undefined)).toBe('direct');
    expect(referrerHostFor('not a url')).toBe('direct');
  });
});

// ---------------------------------------------------------------------------
// Engagement events (V4b contract, section 1)
// ---------------------------------------------------------------------------

const PROJECT = { id: '7f1c2a9e-0000-4000-8000-000000000001', title: 'Tallyproof' };
const OTHER_PROJECT = { id: '7f1c2a9e-0000-4000-8000-000000000002', title: 'Knaq' };

/** The single row passed to the nth insert call. */
const insertedRow = (insert, call = 0) => insert.mock.calls[call][0][0];

/** Overrides document.hidden for visibility tests; returns a setter. */
const controlVisibility = () => {
  let hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  return (next) => {
    hidden = next;
    document.dispatchEvent(new Event('visibilitychange'));
  };
};

afterEach(() => {
  // Restore jsdom's own getter on Document.prototype.
  delete document.hidden;
});

describe('engagement events with analytics disabled', () => {
  beforeEach(() => {
    process.env.REACT_APP_ANALYTICS_ENABLED = 'false';
  });

  it.each([
    ['trackProjectOpen', () => trackProjectOpen(PROJECT, 'card')],
    ['trackProjectLink', () => trackProjectLink(PROJECT, 'repo', 'https://github.com/x/y')],
    ['trackReachOut', () => trackReachOut('linkedin', 'footer')],
  ])('%s never touches the database', async (_name, track) => {
    await expect(track()).resolves.toBeUndefined();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('startEngagementTimer schedules nothing and returns a callable no-op', () => {
    jest.useFakeTimers();
    try {
      const stop = startEngagementTimer();
      jest.advanceTimersByTime(ENGAGED_AFTER_MS * 3);
      expect(typeof stop).toBe('function');
      expect(() => stop()).not.toThrow();
      expect(supabase.from).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('initializeVisitorTracking returns a no-op cleanup', () => {
    const stop = initializeVisitorTracking();
    expect(typeof stop).toBe('function');
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('engagement events with analytics enabled', () => {
  beforeEach(() => {
    process.env.REACT_APP_ANALYTICS_ENABLED = 'true';
  });

  it('every engagement row matches the anon insert policy and carries visitor_info', async () => {
    const insert = mockInsertResult();

    await trackProjectOpen(PROJECT, 'card');
    await trackProjectLink(PROJECT, 'demo', 'https://tallyproof.example');
    await trackReachOut('email', 'contact');

    expect(supabase.from).toHaveBeenCalledWith('analytics_events');
    expect(insert).toHaveBeenCalledTimes(3);
    insert.mock.calls.forEach(([rows]) => {
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        event_type: 'click',
        event_category: 'interaction',
        event_value: 1,
        user_type: 'visitor',
        session_id: expect.stringMatching(/^visitor_/),
      });
      const { visitor_info: info, timestamp } = rows[0].metadata;
      expect(Object.keys(info).sort()).toEqual(['deviceClass', 'isReturningVisitor', 'referrer']);
      expect(Number.isNaN(Date.parse(timestamp))).toBe(false);
    });
  });

  it('trackProjectOpen labels the row with the project id and records title and surface', async () => {
    const insert = mockInsertResult();

    await trackProjectOpen(PROJECT, 'card');

    const row = insertedRow(insert);
    expect(row.event_action).toBe('project_open');
    expect(row.event_label).toBe(PROJECT.id);
    expect(row.metadata).toMatchObject({ title: 'Tallyproof', surface: 'card' });
  });

  it('trackProjectOpen accepts the page surface and coerces anything else to card', async () => {
    const insert = mockInsertResult();

    await trackProjectOpen(PROJECT, 'page');
    await trackProjectOpen(OTHER_PROJECT, 'modal');

    expect(insertedRow(insert, 0).metadata.surface).toBe('page');
    expect(insertedRow(insert, 1).metadata.surface).toBe('card');
  });

  it('trackProjectOpen records each project once per session', async () => {
    const insert = mockInsertResult();

    await trackProjectOpen(PROJECT, 'card');
    await trackProjectOpen(PROJECT, 'card');
    await trackProjectOpen(OTHER_PROJECT, 'card');

    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls.map(([rows]) => rows[0].event_label)).toEqual([PROJECT.id, OTHER_PROJECT.id]);
  });

  it('trackProjectOpen keeps its session memory across a reload of the tab', async () => {
    const insert = mockInsertResult();
    await trackProjectOpen(PROJECT, 'card');

    // A reload loses module state but keeps sessionStorage.
    resetEngagementTrackingForTests();
    await trackProjectOpen(PROJECT, 'card');

    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('trackProjectOpen ignores a project without an id', async () => {
    mockInsertResult();

    await trackProjectOpen({ title: 'No id' }, 'card');
    await trackProjectOpen(undefined, 'card');

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('trackProjectLink records the kind and url on every click', async () => {
    const insert = mockInsertResult();

    await trackProjectLink(PROJECT, 'repo', 'https://github.com/raunak-choudhary/tallyproof');
    await trackProjectLink(PROJECT, 'repo', 'https://github.com/raunak-choudhary/tallyproof');

    expect(insert).toHaveBeenCalledTimes(2);
    const row = insertedRow(insert);
    expect(row.event_action).toBe('project_link');
    expect(row.event_label).toBe(PROJECT.id);
    expect(row.metadata).toMatchObject({
      title: 'Tallyproof',
      kind: 'repo',
      url: 'https://github.com/raunak-choudhary/tallyproof',
    });
  });

  it('trackProjectLink ignores kinds outside repo and demo', async () => {
    mockInsertResult();

    await trackProjectLink(PROJECT, 'images', 'https://example.com');

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it.each(['linkedin', 'email', 'resume', 'contact_form'])(
    'trackReachOut records channel %p with the surface it came from',
    async (channel) => {
      const insert = mockInsertResult();

      await trackReachOut(channel, 'footer');

      const row = insertedRow(insert);
      expect(row.event_action).toBe('reach_out');
      expect(row.event_label).toBe(channel);
      expect(row.metadata.from).toBe('footer');
    }
  );

  it('trackReachOut ignores unknown channels', async () => {
    mockInsertResult();

    await trackReachOut('instagram', 'footer');

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('engagement trackers resolve without throwing when the insert fails', async () => {
    mockInsertResult({ error: { message: 'permission denied' } });
    await expect(trackReachOut('linkedin', 'footer')).resolves.toBeUndefined();

    supabase.from.mockReturnValue({ insert: jest.fn().mockRejectedValue(new Error('network down')) });
    await expect(trackProjectLink(PROJECT, 'demo', 'https://x.example')).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  describe('startEngagementTimer', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('writes one engaged row after ten visible seconds, labelled with the page name', () => {
      const insert = mockInsertResult();
      window.history.pushState(null, '', '/projects');

      startEngagementTimer();
      jest.advanceTimersByTime(ENGAGED_AFTER_MS - 1);
      expect(insert).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);

      expect(insert).toHaveBeenCalledTimes(1);
      const row = insertedRow(insert);
      expect(row).toMatchObject({
        event_type: 'click',
        event_category: 'interaction',
        event_action: 'engaged',
        event_label: 'projects',
        user_type: 'visitor',
      });
      expect(row.metadata.seconds).toBe(10);
      expect(row.metadata.visitor_info).toBeDefined();
      window.history.pushState(null, '', '/');
    });

    it('does not count time while the tab is hidden', () => {
      const insert = mockInsertResult();
      const setHidden = controlVisibility();

      startEngagementTimer();
      jest.advanceTimersByTime(4000);
      setHidden(true);
      jest.advanceTimersByTime(60000);
      expect(insert).not.toHaveBeenCalled();

      setHidden(false);
      jest.advanceTimersByTime(5999);
      expect(insert).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(insert).toHaveBeenCalledTimes(1);
    });

    it('waits for the tab to become visible when started hidden', () => {
      const insert = mockInsertResult();
      const setHidden = controlVisibility();
      setHidden(true);

      startEngagementTimer();
      jest.advanceTimersByTime(30000);
      expect(insert).not.toHaveBeenCalled();

      setHidden(false);
      jest.advanceTimersByTime(ENGAGED_AFTER_MS);
      expect(insert).toHaveBeenCalledTimes(1);
    });

    it('fires once per session, even when started again or after a reload', () => {
      const insert = mockInsertResult();

      startEngagementTimer();
      startEngagementTimer();
      jest.advanceTimersByTime(ENGAGED_AFTER_MS * 2);
      startEngagementTimer();
      jest.advanceTimersByTime(ENGAGED_AFTER_MS * 2);
      resetEngagementTrackingForTests();
      startEngagementTimer();
      jest.advanceTimersByTime(ENGAGED_AFTER_MS * 2);

      expect(insert).toHaveBeenCalledTimes(1);
    });

    it('a stopped clock writes nothing and can be started again (React strict mode)', () => {
      const insert = mockInsertResult();

      const stop = startEngagementTimer();
      jest.advanceTimersByTime(5000);
      stop();
      jest.advanceTimersByTime(ENGAGED_AFTER_MS * 2);
      expect(insert).not.toHaveBeenCalled();

      startEngagementTimer();
      jest.advanceTimersByTime(ENGAGED_AFTER_MS);
      expect(insert).toHaveBeenCalledTimes(1);
    });

    it('stops listening for visibility changes once it has fired', () => {
      mockInsertResult();
      const remove = jest.spyOn(document, 'removeEventListener');

      startEngagementTimer();
      jest.advanceTimersByTime(ENGAGED_AFTER_MS);

      expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });
  });

  it('initializeVisitorTracking records the page view and starts the engaged clock', () => {
    jest.useFakeTimers();
    try {
      const insert = mockInsertResult();
      window.history.pushState(null, '', '/skills');

      const stop = initializeVisitorTracking();
      expect(insertedRow(insert)).toMatchObject({ event_type: 'page_view', event_label: 'skills' });

      jest.advanceTimersByTime(ENGAGED_AFTER_MS);
      expect(insert).toHaveBeenCalledTimes(2);
      expect(insertedRow(insert, 1)).toMatchObject({ event_action: 'engaged', event_label: 'skills' });
      stop();
      window.history.pushState(null, '', '/');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('pageNameForPath', () => {
  it.each([
    ['/', 'home'],
    ['/home', 'home'],
    ['/projects', 'projects'],
    ['/work-experience', 'work-experience'],
    ['/internships', 'internships'],
    ['/recommendations', 'recommendations'],
    ['/leadership', 'leadership'],
    ['', 'home'],
  ])('%p is %p', (path, name) => {
    expect(pageNameForPath(path)).toBe(name);
  });
});

describe('admin routes are not visitor pages (deep pass 2026-11-20)', () => {
  afterEach(() => { window.history.pushState(null, '', '/'); });

  it('knows the admin routes', () => {
    expect(['/adminlogin', '/admindashboard', '/admindashboard/voyage', '/adminsignout', '/AdminLogin'].every(isAdminPath)).toBe(true);
    expect(['/', '/home', '/projects', '/about/admin', ''].some(isAdminPath)).toBe(false);
  });

  it.each(['/adminlogin', '/admindashboard', '/adminsignout'])('writes nothing and starts no clock on %s', (route) => {
    process.env.REACT_APP_ANALYTICS_ENABLED = 'true';
    jest.useFakeTimers();
    try {
      const insert = mockInsertResult();
      window.history.pushState(null, '', route);
      const stop = initializeVisitorTracking();
      jest.advanceTimersByTime(ENGAGED_AFTER_MS * 2);
      expect(insert).not.toHaveBeenCalled();
      expect(supabase.from).not.toHaveBeenCalled();
      expect(() => stop()).not.toThrow();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not write the engaged event when the visitor has moved to an admin route, and keeps it for later', () => {
    process.env.REACT_APP_ANALYTICS_ENABLED = 'true';
    jest.useFakeTimers();
    try {
      const insert = mockInsertResult();
      window.history.pushState(null, '', '/projects');
      startEngagementTimer();
      window.history.pushState(null, '', '/adminlogin');
      jest.advanceTimersByTime(ENGAGED_AFTER_MS);
      expect(insert).not.toHaveBeenCalled();
      // the session's one engaged event is still available on a public page
      window.history.pushState(null, '', '/projects');
      startEngagementTimer();
      jest.advanceTimersByTime(ENGAGED_AFTER_MS);
      expect(insert).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('who counts as a visitor (honest numbers, 2026-11-21)', () => {
  const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  const asNavigator = (nav) => jest.spyOn(trackingEnvironment, 'navigator').mockReturnValue(nav);
  const onHost = (host) => trackingEnvironment.hostname.mockReturnValue(host);

  beforeEach(() => {
    process.env.REACT_APP_ANALYTICS_ENABLED = 'true';
    asNavigator({ webdriver: false, userAgent: CHROME });
  });
  afterEach(() => { window.history.pushState(null, '', '/'); });

  it('counts a person on the live site, with or without www', () => {
    expect(PRODUCTION_HOSTS).toEqual(['www.raunakchoudhary.com', 'raunakchoudhary.com']);
    expect(shouldTrackVisit()).toBe(true);
    onHost('raunakchoudhary.com');
    expect(shouldTrackVisit()).toBe(true);
    onHost('WWW.RaunakChoudhary.com');
    expect(shouldTrackVisit()).toBe(true);
  });

  it.each([
    'localhost', '127.0.0.1', '192.168.1.20', 'portfolio-git-main.vercel.app', 'abc.trycloudflare.com',
    'raunakchoudhary.com.evil.example', 'staging.raunakchoudhary.com', '',
  ])('never counts a visit served from %p', async (host) => {
    onHost(host);
    expect(isProductionHost(host)).toBe(false);
    expect(shouldTrackVisit()).toBe(false);
    const insert = mockInsertResult();
    await trackPageView('home', 'Home');
    await trackClick('nav', 'projects');
    await trackContactSubmission('general', 'Hello');
    await trackSectionView('projects', 'main', 5);
    await trackProjectOpen({ id: 'p1' });
    await trackProjectLink({ id: 'p1' }, 'repo', 'https://github.com/x/y');
    await trackReachOut('email', 'footer');
    expect(initializeVisitorTracking()()).toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('portfolio_visited')).toBeNull();
  });

  it('never counts the admin routes', () => {
    window.history.pushState(null, '', '/admindashboard');
    expect(shouldTrackVisit()).toBe(false);
  });

  it('never counts an automated browser', () => {
    asNavigator({ webdriver: true, userAgent: CHROME });
    expect(shouldTrackVisit()).toBe(false);
  });

  it.each([
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 11) Chrome/130 Mobile Safari/537.36 Chrome-Lighthouse',
    'facebookexternalhit/1.1', 'Slackbot-LinkExpanding 1.0', 'UptimeRobot/2.0', 'curl/8.4.0', 'python-requests/2.31',
    'Hostinger Operations monitoring',
  ])('never counts the agent %p', (userAgent) => {
    expect(looksAutomated({ userAgent })).toBe(true);
    asNavigator({ webdriver: false, userAgent });
    expect(shouldTrackVisit()).toBe(false);
  });

  it('takes ordinary browsers for people', () => {
    expect(looksAutomated({ userAgent: CHROME })).toBe(false);
    expect(looksAutomated({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })).toBe(false);
    expect(looksAutomated(undefined)).toBe(false);
  });

  it('never counts the owner: a browser that has opened the dashboard, even after sign-out', () => {
    markOwnerBrowser();
    expect(window.localStorage.getItem(OWNER_DEVICE_KEY)).toBe('1');
    expect(isOwnerBrowser(window.localStorage)).toBe(true);
    expect(shouldTrackVisit()).toBe(false);
  });

  it('never counts a browser that holds an admin session', () => {
    window.localStorage.setItem('sb-abcdefghijklmnop-auth-token', '{"access_token":"x"}');
    expect(isOwnerBrowser(window.localStorage)).toBe(true);
    expect(shouldTrackVisit()).toBe(false);
  });

  it('does not take other stored keys for a session', () => {
    window.localStorage.setItem('portfolio-theme', 'dark');
    window.localStorage.setItem('sb-auth-token-note', 'x');
    expect(isOwnerBrowser(window.localStorage)).toBe(false);
    expect(shouldTrackVisit()).toBe(true);
  });

  it('counts nothing with the flag off', () => {
    process.env.REACT_APP_ANALYTICS_ENABLED = 'false';
    expect(shouldTrackVisit()).toBe(false);
  });

  it('treats storage that cannot be read as a visitor\'s, and marking the owner there does not throw', () => {
    const blocked = { get length() { throw new DOMException('denied', 'SecurityError'); }, getItem() { throw new DOMException('denied', 'SecurityError'); }, setItem() { throw new DOMException('denied', 'SecurityError'); }, key() { return null; } };
    expect(isOwnerBrowser(blocked)).toBe(false);
    expect(isOwnerBrowser(null)).toBe(false);
    jest.spyOn(trackingEnvironment, 'storage').mockReturnValue(blocked);
    expect(() => markOwnerBrowser()).not.toThrow();
    expect(shouldTrackVisit()).toBe(true);
    trackingEnvironment.storage.mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    expect(() => markOwnerBrowser()).not.toThrow();
    expect(shouldTrackVisit()).toBe(true);
  });

  it('counts nothing when the browser itself cannot be read', () => {
    trackingEnvironment.hostname.mockImplementation(() => { throw new Error('no window'); });
    expect(shouldTrackVisit()).toBe(false);
  });
});
