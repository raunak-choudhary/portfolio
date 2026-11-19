// src/services/visitorTrackingService.js
// Real-time visitor tracking for your portfolio

import { supabase } from './supabaseClient';

/**
 * Whether visitor analytics may write to the database.
 *
 * Tracking is opt-in: it runs only when REACT_APP_ANALYTICS_ENABLED is the
 * exact string "true". Anything else, including an unset variable, disables
 * it. Defaulting to off keeps local development, unit tests, the browser
 * suite and CI from inserting fake visitors into `analytics_events`; the
 * production environment file sets the flag explicitly.
 *
 * The variable is read on every call rather than once at module load so
 * tests can toggle it without re-importing the module. Create React App
 * inlines the value at build time, so in a production bundle this is a
 * constant comparison.
 *
 * @returns {boolean} true when trackers should write events.
 */
export const isAnalyticsEnabled = () => process.env.REACT_APP_ANALYTICS_ENABLED === 'true';

// =====================================================
// REAL VISITOR TRACKING SERVICE
// Tracks actual visitors to your live portfolio
// =====================================================

// =====================================================
// SESSION-BASED DUPLICATE PREVENTION
// =====================================================

// Track what's already been tracked in this browser session
const sessionTracking = {
  pageViews: new Set(),
  sectionViews: new Set()
};

// Generate unique key for tracking prevention
const getSessionKey = (type, identifier) => {
  const today = new Date().toISOString().split('T')[0];
  return `${type}_${identifier}_${today}`;
};

// Generate unique visitor session ID
const generateVisitorSessionId = () => {
  let sessionId = sessionStorage.getItem('portfolio_session_id');
  if (!sessionId) {
    sessionId = `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('portfolio_session_id', sessionId);
  }
  return sessionId;
};

// Get visitor info (privacy-friendly)
/**
 * Buckets a viewport width into the three classes the site's breakpoints use.
 * Stored instead of the exact screen size so an event cannot identify a device.
 */
export const deviceClassFor = (width) => {
  if (!Number.isFinite(width) || width < 768) return 'phone';
  return width < 1280 ? 'tablet' : 'desktop';
};

/**
 * Reduces a referrer URL to its host ('direct' when absent or unparseable).
 * The path and query of a referrer can carry search terms or identifiers.
 */
export const referrerHostFor = (referrer) => {
  if (!referrer) return 'direct';
  try {
    return new URL(referrer).hostname || 'direct';
  } catch {
    return 'direct';
  }
};

/**
 * Coarse visitor context stored with each event. Deliberately no user agent,
 * screen size, language or timezone: together those fingerprint a device,
 * and the portfolio only needs the kind of device and where the visit came
 * from (owner decision, 2026-11-03). The stored history was reduced to the
 * same shape by the migration of the same date.
 */
const getVisitorInfo = () => ({
  deviceClass: deviceClassFor(window.innerWidth),
  referrer: referrerHostFor(document.referrer),
  isReturningVisitor: localStorage.getItem('portfolio_visited') !== null,
});

// Track page view
export const trackPageView = async (page, title = '') => {
  if (!isAnalyticsEnabled()) return;
  try {
    // Create unique session key
    const sessionKey = getSessionKey('page', page);
    
    // Check if already tracked in this session
    if (sessionTracking.pageViews.has(sessionKey)) {
      return;
    }
    
    // Mark as tracked in this session
    sessionTracking.pageViews.add(sessionKey);
    
    const sessionId = generateVisitorSessionId();
    const visitorInfo = getVisitorInfo();
    
    // Mark as visited for return visitor detection
    localStorage.setItem('portfolio_visited', 'true');

    const { error } = await supabase
      .from('analytics_events')
      .insert([
        {
          event_type: 'page_view',
          event_category: 'portfolio',
          event_action: 'view_page',
          event_label: page,
          event_value: 1,
          user_type: 'visitor',
          session_id: sessionId,
          metadata: {
            page_title: title,
            timestamp: new Date().toISOString(),
            visitor_info: visitorInfo
          }
        }
      ]);

    if (error) {
      console.error('Error tracking page view:', error);
    }

  } catch (error) {
    console.error('Error in trackPageView:', error);
  }
};

// Track section view (when user scrolls to or clicks on a section)
export const trackSectionView = async (sectionType, sectionId = 'main', timeSpent = 0) => {
  if (!isAnalyticsEnabled()) return;
  try {
    // Create unique session key
    const sessionKey = getSessionKey('section', `${sectionType}_${sectionId}`);
    
    // Check if already tracked in this session
    if (sessionTracking.sectionViews.has(sessionKey)) {
      return;
    }
    
    // Mark as tracked in this session
    sessionTracking.sectionViews.add(sessionKey);
    
    const sessionId = generateVisitorSessionId();

    // Track the event
    const { error } = await supabase
      .from('analytics_events')
      .insert([
        {
          event_type: 'section_view',
          event_category: 'portfolio',
          event_action: `view_${sectionType}`,
          event_label: sectionId,
          event_value: timeSpent,
          user_type: 'visitor',
          session_id: sessionId,
          metadata: {
            section_type: sectionType,
            time_spent_seconds: timeSpent,
            timestamp: new Date().toISOString()
          }
        }
      ]);

    if (error) {
      console.error('Error tracking section view:', error);
      return;
    }

    // Update content performance
    await updateContentPerformance(sectionType, sectionId, timeSpent);

  } catch (error) {
    console.error('Error in trackSectionView:', error);
  }
};

// Track contact form submission
export const trackContactSubmission = async (contactType, subject) => {
  if (!isAnalyticsEnabled()) return;
  try {
    const sessionId = generateVisitorSessionId();

    const { error } = await supabase
      .from('analytics_events')
      .insert([
        {
          event_type: 'form_submission',
          event_category: 'contact',
          event_action: 'submit_contact_form',
          event_label: contactType,
          event_value: 1,
          user_type: 'visitor',
          session_id: sessionId,
          metadata: {
            contact_type: contactType,
            subject: subject,
            timestamp: new Date().toISOString()
          }
        }
      ]);

    if (error) {
      console.error('Error tracking contact submission:', error);
    }

  } catch (error) {
    console.error('Error in trackContactSubmission:', error);
  }
};

// Track click events (portfolio navigation, external links, etc.)
export const trackClick = async (elementType, elementId, targetUrl = '') => {
  if (!isAnalyticsEnabled()) return;
  try {
    const sessionId = generateVisitorSessionId();

    const { error } = await supabase
      .from('analytics_events')
      .insert([
        {
          event_type: 'click',
          event_category: 'interaction',
          event_action: `click_${elementType}`,
          event_label: elementId,
          event_value: 1,
          user_type: 'visitor',
          session_id: sessionId,
          metadata: {
            element_type: elementType,
            element_id: elementId,
            target_url: targetUrl,
            timestamp: new Date().toISOString()
          }
        }
      ]);

    if (error) {
      console.error('Error tracking click:', error);
    }

  } catch (error) {
    console.error('Error in trackClick:', error);
  }
};

// Update content performance based on real visitor interactions
const updateContentPerformance = async (contentType, contentId, timeSpent) => {
  try {
    // Input validation
    if (!contentType || !contentId) {
      console.warn('Invalid parameters for content performance tracking');
      return false;
    }

    // Public content-performance mutation was retired because it
    // required an exposed SECURITY DEFINER RPC. Keep this graceful no-op until
    // content performance aggregation is moved to an Edge Function or cron job.
    return false;

  } catch (error) {
    // Catch-all error handling for production
    console.error('Unexpected error in updateContentPerformance:', {
      error: error.message,
      stack: error.stack,
      contentType,
      contentId,
      timeSpent
    });
    
    // Fail gracefully - don't break user experience
    return false;
  }
};

// Hook for tracking time spent on page/section
export const useTimeTracking = (sectionType, sectionId = 'main') => {
  let startTime = Date.now();
  
  const startTracking = () => {
    startTime = Date.now();
  };
  
  const stopTracking = () => {
    const timeSpent = Math.round((Date.now() - startTime) / 1000);
    if (timeSpent > 2) { // Only track if spent more than 2 seconds
      trackSectionView(sectionType, sectionId, timeSpent);
    }
    return timeSpent;
  };
  
  return { startTracking, stopTracking };
};

// =====================================================
// ENGAGEMENT EVENTS (V4b contract, section 1)
// =====================================================
//
// Project opens, project links, reach-outs and the engaged signal are all
// stored as `event_type 'click'`, `event_category 'interaction'` rows, told
// apart by `event_action`. That shape is already allowed by the anon insert
// policy on `analytics_events`, so no policy change is needed. Every row
// carries the same coarse `visitor_info` as a page view, so whichever event
// opens a session still records its source and kind of device.

/** How long the tab must be visible before a visit counts as engaged. */
export const ENGAGED_AFTER_MS = 10000;

const PROJECT_LINK_KINDS = new Set(['repo', 'demo']);
const REACH_OUT_CHANNELS = new Set(['linkedin', 'email', 'resume', 'contact_form']);

// Session-scoped de-duplication. sessionStorage survives a reload in the same
// tab, matching the lifetime of `portfolio_session_id`, so a reload does not
// count a project twice. The in-memory sets back it up when storage throws
// (private windows, blocked site data).
const OPENED_PROJECTS_KEY = 'portfolio_opened_projects';
const ENGAGED_KEY = 'portfolio_engaged';
const memoryOnce = new Set();

const readOnceList = () => {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(OPENED_PROJECTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Records `key` as done for this session and reports whether it was new.
 * The engaged flag and the opened project ids share this helper.
 */
const markOncePerSession = (key) => {
  if (memoryOnce.has(key)) return false;
  memoryOnce.add(key);
  try {
    if (key === ENGAGED_KEY) {
      if (sessionStorage.getItem(ENGAGED_KEY) === 'true') return false;
      sessionStorage.setItem(ENGAGED_KEY, 'true');
      return true;
    }
    const opened = readOnceList();
    if (opened.includes(key)) return false;
    sessionStorage.setItem(OPENED_PROJECTS_KEY, JSON.stringify([...opened, key]));
  } catch {
    // Storage unavailable: the in-memory set above already guards this page load.
  }
  return true;
};

/** Inserts one engagement row. Failures are logged and never thrown. */
const insertEngagementEvent = async (action, label, details) => {
  try {
    const { error } = await supabase
      .from('analytics_events')
      .insert([
        {
          event_type: 'click',
          event_category: 'interaction',
          event_action: action,
          event_label: label,
          event_value: 1,
          user_type: 'visitor',
          session_id: generateVisitorSessionId(),
          metadata: {
            ...details,
            timestamp: new Date().toISOString(),
            visitor_info: getVisitorInfo()
          }
        }
      ]);
    if (error) {
      console.error(`Error tracking ${action}:`, error);
    }
  } catch (error) {
    console.error(`Error tracking ${action}:`, error);
  }
};

/**
 * A project's details were opened: its card flipped to the back
 * (`surface 'card'`) or a project detail view shown (`surface 'page'`).
 * Recorded once per project per session; flipping back and forth adds nothing.
 *
 * @param {{ id: string, title?: string }} project row from `projects`
 * @param {'card'|'page'} [surface]
 */
export const trackProjectOpen = async (project, surface = 'card') => {
  if (!isAnalyticsEnabled() || !project?.id) return;
  if (!markOncePerSession(`project:${project.id}`)) return;
  await insertEngagementEvent('project_open', project.id, {
    title: project.title || '',
    surface: surface === 'page' ? 'page' : 'card'
  });
};

/**
 * A project's repository or live-demo link was followed. Every click counts.
 *
 * @param {{ id: string, title?: string }} project row from `projects`
 * @param {'repo'|'demo'} kind
 * @param {string} url the address the link opens
 */
export const trackProjectLink = async (project, kind, url) => {
  if (!isAnalyticsEnabled() || !project?.id || !PROJECT_LINK_KINDS.has(kind)) return;
  await insertEngagementEvent('project_link', project.id, {
    title: project.title || '',
    kind,
    url: url || ''
  });
};

/**
 * A visitor reached out: followed the LinkedIn profile or a mailto link,
 * opened the resume, or sent the contact form successfully.
 *
 * @param {'linkedin'|'email'|'resume'|'contact_form'} channel
 * @param {string} from the surface it happened on, e.g. 'footer' or 'contact'
 */
export const trackReachOut = async (channel, from) => {
  if (!isAnalyticsEnabled() || !REACH_OUT_CHANNELS.has(channel)) return;
  await insertEngagementEvent('reach_out', channel, { from: from || 'unknown' });
};

/**
 * Maps a path to the page names page_view uses, so the engaged event's label
 * lines up with the page-view labels it is compared against.
 */
export const pageNameForPath = (pathname = '') => {
  const pages = [
    'projects', 'skills', 'education', 'work-experience', 'internships',
    'certifications', 'recommendations', 'achievements', 'leadership'
  ];
  return pages.find((page) => pathname.includes(`/${page}`)) || 'home';
};

let engagementTimer = null;

/**
 * Starts the engaged clock: after ENGAGED_AFTER_MS of the tab being visible
 * one `engaged` row is written, labelled with the page the visitor is on at
 * that moment. Hidden time does not count; the clock pauses on
 * `visibilitychange` and resumes where it stopped. Runs at most once per
 * session, and a second call while the clock runs reuses it.
 *
 * @returns {() => void} stops the clock (for effect cleanup); a no-op when
 *   analytics is off or the session is already engaged.
 */
export const startEngagementTimer = () => {
  if (!isAnalyticsEnabled()) return () => {};
  if (engagementTimer) return engagementTimer.stop;
  try {
    if (sessionStorage.getItem(ENGAGED_KEY) === 'true') return () => {};
  } catch {
    // Storage unavailable: fall through and rely on the in-memory guard.
  }
  if (memoryOnce.has(ENGAGED_KEY)) return () => {};

  let remaining = ENGAGED_AFTER_MS;
  let visibleSince = null;
  let timeoutId = null;

  const fire = () => {
    stop();
    if (!markOncePerSession(ENGAGED_KEY)) return;
    insertEngagementEvent('engaged', pageNameForPath(window.location.pathname), {
      seconds: ENGAGED_AFTER_MS / 1000
    });
  };

  const resume = () => {
    if (timeoutId !== null) return;
    visibleSince = Date.now();
    timeoutId = setTimeout(fire, remaining);
  };

  const pause = () => {
    if (timeoutId === null) return;
    clearTimeout(timeoutId);
    timeoutId = null;
    remaining = Math.max(0, remaining - (Date.now() - visibleSince));
  };

  const onVisibilityChange = () => {
    if (document.hidden) pause();
    else resume();
  };

  function stop() {
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = null;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (engagementTimer && engagementTimer.stop === stop) engagementTimer = null;
  }

  engagementTimer = { stop };
  document.addEventListener('visibilitychange', onVisibilityChange);
  if (!document.hidden) resume();
  return stop;
};

/**
 * Test hook: forgets the in-memory session guards and stops a running
 * engaged clock, so each test starts from a fresh page load.
 */
export const resetEngagementTrackingForTests = () => {
  if (engagementTimer) engagementTimer.stop();
  memoryOnce.clear();
};

/**
 * Starts tracking for this page load: records the landing page view and
 * starts the engaged clock. Nothing happens unless analytics is enabled.
 *
 * @returns {() => void} cleanup that stops the engaged clock.
 */
export const initializeVisitorTracking = () => {
  if (!isAnalyticsEnabled()) return () => {};
  trackPageView(pageNameForPath(window.location.pathname), document.title);
  return startEngagementTimer();
};

// Create the service object
const visitorTrackingService = {
  isAnalyticsEnabled,
  trackPageView,
  trackSectionView,
  trackContactSubmission,
  trackClick,
  trackProjectOpen,
  trackProjectLink,
  trackReachOut,
  startEngagementTimer,
  useTimeTracking,
  initializeVisitorTracking
};

// Export the service object
export default visitorTrackingService;
