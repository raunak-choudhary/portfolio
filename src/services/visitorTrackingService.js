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
const getVisitorInfo = () => {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    referrer: document.referrer || 'direct',
    isReturningVisitor: localStorage.getItem('portfolio_visited') !== null
  };
};

// Track page view
export const trackPageView = async (page, title = '') => {
  if (!isAnalyticsEnabled()) return;
  try {
    // Create unique session key
    const sessionKey = getSessionKey('page', page);
    
    // Check if already tracked in this session
    if (sessionTracking.pageViews.has(sessionKey)) {
      console.log('🚫 Page already tracked in session:', page);
      return;
    }
    
    // Mark as tracked in this session
    sessionTracking.pageViews.add(sessionKey);
    
    const sessionId = generateVisitorSessionId();
    const visitorInfo = getVisitorInfo();
    
    // Mark as visited for return visitor detection
    localStorage.setItem('portfolio_visited', 'true');
    
    console.log('📊 Tracking page view:', page, title);

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
      console.error('❌ Error tracking page view:', error);
    } else {
      console.log('✅ Page view tracked successfully');
    }

  } catch (error) {
    console.error('❌ Error in trackPageView:', error);
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
      console.log('🚫 Section already tracked in session:', sectionType, sectionId);
      return;
    }
    
    // Mark as tracked in this session
    sessionTracking.sectionViews.add(sessionKey);
    
    const sessionId = generateVisitorSessionId();
    
    console.log('📊 Tracking section view:', sectionType, sectionId);

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
      console.error('❌ Error tracking section view:', error);
      return;
    }

    // Update content performance
    await updateContentPerformance(sectionType, sectionId, timeSpent);
    
    console.log('✅ Section view tracked successfully');

  } catch (error) {
    console.error('❌ Error in trackSectionView:', error);
  }
};

// Track contact form submission
export const trackContactSubmission = async (contactType, subject) => {
  if (!isAnalyticsEnabled()) return;
  try {
    const sessionId = generateVisitorSessionId();
    
    console.log('📊 Tracking contact submission:', contactType, subject);

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
      console.error('❌ Error tracking contact submission:', error);
    } else {
      console.log('✅ Contact submission tracked successfully');
    }

  } catch (error) {
    console.error('❌ Error in trackContactSubmission:', error);
  }
};

// Track click events (portfolio navigation, external links, etc.)
export const trackClick = async (elementType, elementId, targetUrl = '') => {
  if (!isAnalyticsEnabled()) return;
  try {
    const sessionId = generateVisitorSessionId();
    
    console.log('📊 Tracking click:', elementType, elementId);

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
      console.error('❌ Error tracking click:', error);
    } else {
      console.log('✅ Click tracked successfully');
    }

  } catch (error) {
    console.error('❌ Error in trackClick:', error);
  }
};

// Update content performance based on real visitor interactions
const updateContentPerformance = async (contentType, contentId, timeSpent) => {
  try {
    // Input validation
    if (!contentType || !contentId) {
      console.warn('⚠️ Invalid parameters for content performance tracking');
      return false;
    }

    // Public content-performance mutation was retired because it
    // required an exposed SECURITY DEFINER RPC. Keep this graceful no-op until
    // content performance aggregation is moved to an Edge Function or cron job.
    return false;

  } catch (error) {
    // Catch-all error handling for production
    console.error('❌ Unexpected error in updateContentPerformance:', {
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

// Initialize visitor tracking
export const initializeVisitorTracking = () => {
  if (!isAnalyticsEnabled()) return;
  // Track initial page load
  const currentPath = window.location.pathname;
  let pageName = 'home';
  
  if (currentPath.includes('/projects')) pageName = 'projects';
  else if (currentPath.includes('/skills')) pageName = 'skills';
  else if (currentPath.includes('/education')) pageName = 'education';
  else if (currentPath.includes('/work-experience')) pageName = 'work-experience';
  else if (currentPath.includes('/internships')) pageName = 'internships';
  else if (currentPath.includes('/certifications')) pageName = 'certifications';
  else if (currentPath.includes('/recommendations')) pageName = 'recommendations';
  else if (currentPath.includes('/achievements')) pageName = 'achievements';
  else if (currentPath.includes('/leadership')) pageName = 'leadership';
  
  trackPageView(pageName, document.title);
  
  console.log('🚀 Visitor tracking initialized for page:', pageName);
};

// Create the service object
const visitorTrackingService = {
  isAnalyticsEnabled,
  trackPageView,
  trackSectionView,
  trackContactSubmission,
  trackClick,
  useTimeTracking,
  initializeVisitorTracking
};

// Export the service object
export default visitorTrackingService;
