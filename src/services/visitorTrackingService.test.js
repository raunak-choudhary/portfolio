import { supabase } from './supabaseClient';
import {
  initializeVisitorTracking,
  isAnalyticsEnabled,
  trackClick,
  trackContactSubmission,
  trackPageView,
  trackSectionView,
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
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
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
