// src/utils/routeNavigation.js - PRODUCTION VERSION (Test functions removed)

import routeEncoder from './routeEncoder';

/**
 * Navigation helpers for encrypted admin routes
 * Production version - no test functions
 */

// ====================================================
// ADMIN SESSION MANAGEMENT
// ====================================================

export const initializeAdminSession = () => {
  try {
    const routes = routeEncoder.initializeAdminRoutes();
    
    if (routes) {
      return {
        success: true,
        routes: routes,
        sessionId: routeEncoder.getCurrentSessionId()
      };
    } else {
      return {
        success: true,
        routes: {
          adminlogin: '/adminlogin',
          admindashboard: '/admindashboard',
          adminsignout: '/adminsignout'
        },
        sessionId: null
      };
    }
  } catch (error) {
    console.error('Failed to initialize admin session:', error);
    return {
      success: false,
      error: error.message,
      routes: null
    };
  }
};

export const cleanupAdminSession = () => {
  try {
    routeEncoder.clearAdminRoutes();
    sessionStorage.removeItem('admin_navigation_history');
    sessionStorage.removeItem('admin_current_section');
    
    return { success: true };
  } catch (error) {
    console.error('Failed to cleanup admin session:', error);
    return { success: false, error: error.message };
  }
};

// ====================================================
// SAFE NAVIGATION FUNCTIONS
// ====================================================

export const navigateToAdminLogin = (options = {}) => {
  try {
    const routes = routeEncoder.getStoredAdminRoutes();
    const loginRoute = routes.adminlogin || '/adminlogin';
    
    if (options.replace) {
      window.location.replace(loginRoute);
    } else {
      window.location.href = loginRoute;
    }
    
    return { success: true, route: loginRoute };
  } catch (error) {
    console.error('Failed to navigate to admin login:', error);
    
    const fallbackRoute = '/adminlogin';
    if (options.replace) {
      window.location.replace(fallbackRoute);
    } else {
      window.location.href = fallbackRoute;
    }
    
    return { success: false, error: error.message, fallbackUsed: true };
  }
};

export const navigateToAdminDashboard = (options = {}) => {
  try {
    const routes = routeEncoder.getStoredAdminRoutes();
    const dashboardRoute = routes.admindashboard || '/admindashboard';
    
    if (options.replace) {
      window.location.replace(dashboardRoute);
    } else {
      window.location.href = dashboardRoute;
    }
    
    return { success: true, route: dashboardRoute };
  } catch (error) {
    console.error('Failed to navigate to admin dashboard:', error);
    
    const fallbackRoute = '/admindashboard';
    if (options.replace) {
      window.location.replace(fallbackRoute);
    } else {
      window.location.href = fallbackRoute;
    }
    
    return { success: false, error: error.message, fallbackUsed: true };
  }
};

export const navigateToAdminSignOut = (options = {}) => {
  try {
    const routes = routeEncoder.getStoredAdminRoutes();
    const signoutRoute = routes.adminsignout || '/adminsignout';
    
    if (options.replace) {
      window.location.replace(signoutRoute);
    } else {
      window.location.href = signoutRoute;
    }
    
    return { success: true, route: signoutRoute };
  } catch (error) {
    console.error('Failed to navigate to admin signout:', error);
    
    const fallbackRoute = '/adminsignout';
    if (options.replace) {
      window.location.replace(fallbackRoute);
    } else {
      window.location.href = fallbackRoute;
    }
    
    return { success: false, error: error.message, fallbackUsed: true };
  }
};

export const getCurrentAdminRoutes = () => {
  try {
    const routes = routeEncoder.getStoredAdminRoutes();
    return {
      success: true,
      routes: routes,
      sessionId: routeEncoder.getCurrentSessionId()
    };
  } catch (error) {
    console.error('Failed to get current admin routes:', error);
    return {
      success: false,
      error: error.message,
      routes: {
        adminlogin: '/adminlogin',
        admindashboard: '/admindashboard',
        adminsignout: '/adminsignout'
      }
    };
  }
};

// ====================================================
// REACT ROUTER NAVIGATION HELPERS
// ====================================================

export const safeAdminNavigate = (navigate, adminRoute, options = {}) => {
  try {
    const routes = routeEncoder.getStoredAdminRoutes();
    let targetRoute;
    
    switch (adminRoute) {
      case '/adminlogin':
        targetRoute = routes.adminlogin || '/adminlogin';
        break;
      case '/admindashboard':
        targetRoute = routes.admindashboard || '/admindashboard';
        break;
      case '/adminsignout':
        targetRoute = routes.adminsignout || '/adminsignout';
        break;
      default:
        throw new Error(`Unknown admin route: ${adminRoute}`);
    }
    
    navigate(targetRoute, options);
    
    return { success: true, route: targetRoute };
  } catch (error) {
    console.error('Failed to navigate with React Router:', error);
    
    navigate(adminRoute, options);
    
    return { success: false, error: error.message, fallbackUsed: true };
  }
};

// ====================================================
// NAVIGATION HISTORY MANAGEMENT
// ====================================================

export const storeNavigationHistory = (route, section = null) => {
  try {
    const history = getNavigationHistory();
    const timestamp = new Date().toISOString();
    
    const entry = {
      route,
      section,
      timestamp,
      sessionId: routeEncoder.getCurrentSessionId()
    };
    
    const updatedHistory = [entry, ...history.slice(0, 19)];
    
    sessionStorage.setItem('admin_navigation_history', JSON.stringify(updatedHistory));
    
    if (section) {
      sessionStorage.setItem('admin_current_section', section);
    }
    
    return { success: true, entry };
  } catch (error) {
    console.error('Failed to store navigation history:', error);
    return { success: false, error: error.message };
  }
};

export const getNavigationHistory = () => {
  try {
    const historyJson = sessionStorage.getItem('admin_navigation_history');
    return historyJson ? JSON.parse(historyJson) : [];
  } catch (error) {
    console.error('Failed to get navigation history:', error);
    return [];
  }
};

export const getCurrentAdminSection = () => {
  try {
    return sessionStorage.getItem('admin_current_section');
  } catch (error) {
    console.error('Failed to get current admin section:', error);
    return null;
  }
};

export const clearNavigationHistory = () => {
  try {
    sessionStorage.removeItem('admin_navigation_history');
    sessionStorage.removeItem('admin_current_section');
    return { success: true };
  } catch (error) {
    console.error('Failed to clear navigation history:', error);
    return { success: false, error: error.message };
  }
};

// ====================================================
// ROUTE VALIDATION HELPERS
// ====================================================

export const validateCurrentRoute = (pathname) => {
  try {
    const isLegacyAdmin = ['/adminlogin', '/admindashboard', '/adminsignout'].includes(pathname);
    const isEncryptedAdmin = routeEncoder.isValidAdminRoute(pathname);
    
    let decryptedRoute = null;
    if (isEncryptedAdmin) {
      decryptedRoute = routeEncoder.decryptRoute(pathname);
    }
    
    return {
      success: true,
      isLegacyAdmin,
      isEncryptedAdmin,
      isValidAdmin: isLegacyAdmin || isEncryptedAdmin,
      decryptedRoute,
      needsRedirect: isLegacyAdmin,
      currentRoute: pathname
    };
  } catch (error) {
    console.error('Failed to validate current route:', error);
    return {
      success: false,
      error: error.message,
      isValidAdmin: false,
      needsRedirect: false
    };
  }
};

export const getRedirectTarget = (legacyRoute) => {
  try {
    const routes = routeEncoder.getStoredAdminRoutes();
    
    let targetRoute;
    switch (legacyRoute) {
      case '/adminlogin':
        targetRoute = routes.adminlogin;
        break;
      case '/admindashboard':
        targetRoute = routes.admindashboard;
        break;
      case '/adminsignout':
        targetRoute = routes.adminsignout;
        break;
      default:
        throw new Error(`Unknown legacy route: ${legacyRoute}`);
    }
    
    return {
      success: true,
      targetRoute,
      redirectNeeded: targetRoute !== legacyRoute
    };
  } catch (error) {
    console.error('Failed to get redirect target:', error);
    return {
      success: false,
      error: error.message,
      targetRoute: legacyRoute,
      redirectNeeded: false
    };
  }
};

// ====================================================
// EMERGENCY ACCESS HELPERS
// ====================================================

export const getEmergencyRoutes = () => {
  if (process.env.NODE_ENV === 'development') {
    return routeEncoder.getEmergencyRoutes();
  }
  return null;
};

export const regenerateAdminRoutes = () => {
  try {
    routeEncoder.clearAdminRoutes();
    const newSessionId = routeEncoder.generateSessionId();
    const newRoutes = routeEncoder.initializeAdminRoutes();
    
    return {
      success: true,
      newRoutes,
      newSessionId
    };
  } catch (error) {
    console.error('Failed to regenerate admin routes:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// ====================================================
// PRODUCTION: MINIMAL BROWSER EXPORTS
// ====================================================

// Only export essential functions in production
if (typeof window !== 'undefined') {
  // Core navigation functions
  window.getCurrentAdminRoutes = getCurrentAdminRoutes;
  window.navigateToAdminLogin = navigateToAdminLogin;
  window.navigateToAdminDashboard = navigateToAdminDashboard;
  window.navigateToAdminSignOut = navigateToAdminSignOut;
  
  // Session management
  window.initializeAdminSession = initializeAdminSession;
  window.cleanupAdminSession = cleanupAdminSession;
  
  // Emergency access (dev only)
  if (process.env.NODE_ENV === 'development') {
    window.regenerateAdminRoutes = regenerateAdminRoutes;
  }
}

// ====================================================
// DEFAULT EXPORT
// ====================================================

const routeNavigation = {
  // Session management
  initializeAdminSession,
  cleanupAdminSession,
  
  // Navigation functions
  navigateToAdminLogin,
  navigateToAdminDashboard,
  navigateToAdminSignOut,
  getCurrentAdminRoutes,
  safeAdminNavigate,
  
  // History management
  storeNavigationHistory,
  getNavigationHistory,
  getCurrentAdminSection,
  clearNavigationHistory,
  
  // Route validation
  validateCurrentRoute,
  getRedirectTarget,
  
  // Emergency helpers
  getEmergencyRoutes,
  regenerateAdminRoutes
};

export default routeNavigation;