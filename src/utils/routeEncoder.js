// src/utils/routeEncoder.js

import CryptoJS from 'crypto-js';

/**
 * Dynamic Route Encoder for Admin Security
 * Generates time-based + session-based encrypted routes
 * Routes change every login session and time frame
 */

// Get environment variables
const ADMIN_SECRET = process.env.REACT_APP_ADMIN_SECRET;
const SALT_KEY = process.env.REACT_APP_SALT_KEY;
const ENCRYPTION_ENABLED = process.env.REACT_APP_ROUTE_ENCRYPTION === 'enabled';

// Validate environment variables
if (!ADMIN_SECRET || !SALT_KEY) {
  console.error('⚠️ Missing encryption environment variables');
}

/**
 * Generate session ID for current admin session
 */
export const generateSessionId = () => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  const sessionId = `${timestamp}-${random}`;
  
  // Store in sessionStorage (cleared on browser close)
  sessionStorage.setItem('admin_session_id', sessionId);
  localStorage.setItem('admin_session_start', timestamp.toString());
  
  return sessionId;
};

/**
 * Get current session ID
 */
export const getCurrentSessionId = () => {
  return sessionStorage.getItem('admin_session_id') || 
         localStorage.getItem('admin_session_id') ||
         generateSessionId();
};

/**
 * Get time frame (changes every hour for rotating security)
 */
const getTimeFrame = () => {
  return Math.floor(Date.now() / 3600000); // Changes every hour
};

/**
 * Generate encrypted route
 * @param {string} baseRoute - Original route like '/adminlogin'
 * @returns {string} - Encrypted route
 */
export const encryptRoute = (baseRoute) => {
  if (!ENCRYPTION_ENABLED) {
    return baseRoute; // Return original if encryption disabled
  }

  try {
    const sessionId = getCurrentSessionId();
    const timeFrame = getTimeFrame();
    
    // Create unique combination
    const combination = `${baseRoute}-${ADMIN_SECRET}-${sessionId}-${timeFrame}-${SALT_KEY}`;
    
    // Generate hash
    const hash = CryptoJS.SHA256(combination).toString();
    
    // Create clean URL-safe route (32 characters)
    const encryptedRoute = hash
      .substring(0, 32)
      .replace(/[^a-zA-Z0-9]/g, '') // Remove special characters
      .toLowerCase();
    
    // Format with dashes for readability
    const formattedRoute = encryptedRoute.match(/.{1,4}/g).join('-');
    
    console.log(`🔐 Route encrypted: ${baseRoute} → /${formattedRoute}`);
    
    return `/${formattedRoute}`;
    
  } catch (error) {
    console.error('❌ Route encryption failed:', error);
    return baseRoute; // Fallback to original route
  }
};

/**
 * Decrypt route back to original
 * @param {string} encryptedRoute - Encrypted route
 * @returns {string} - Original route or null if invalid
 */
export const decryptRoute = (encryptedRoute) => {
  if (!ENCRYPTION_ENABLED) {
    return encryptedRoute;
  }

  try {
    const sessionId = getCurrentSessionId();
    const timeFrame = getTimeFrame();
    
    // Clean the encrypted route
    const cleanRoute = encryptedRoute.replace(/^\/+/, '').replace(/-/g, '');
    
    // Test against all possible admin routes
    const adminRoutes = ['/adminlogin', '/admindashboard', '/adminsignout'];
    
    for (const testRoute of adminRoutes) {
      const combination = `${testRoute}-${ADMIN_SECRET}-${sessionId}-${timeFrame}-${SALT_KEY}`;
      const expectedHash = CryptoJS.SHA256(combination).toString();
      const expectedClean = expectedHash.substring(0, 32).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      
      if (cleanRoute === expectedClean) {
        console.log(`🔓 Route decrypted: /${encryptedRoute} → ${testRoute}`);
        return testRoute;
      }
    }
    
    // Try previous time frame (in case of timing edge case)
    const previousTimeFrame = timeFrame - 1;
    for (const testRoute of adminRoutes) {
      const combination = `${testRoute}-${ADMIN_SECRET}-${sessionId}-${previousTimeFrame}-${SALT_KEY}`;
      const expectedHash = CryptoJS.SHA256(combination).toString();
      const expectedClean = expectedHash.substring(0, 32).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      
      if (cleanRoute === expectedClean) {
        console.log(`🔓 Route decrypted (prev time): /${encryptedRoute} → ${testRoute}`);
        return testRoute;
      }
    }
    
    console.warn(`⚠️ Could not decrypt route: /${encryptedRoute}`);
    return null;
    
  } catch (error) {
    console.error('❌ Route decryption failed:', error);
    return null;
  }
};

/**
 * Get all current encrypted admin routes
 */
export const getEncryptedAdminRoutes = () => {
  return {
    adminlogin: encryptRoute('/adminlogin'),
    admindashboard: encryptRoute('/admindashboard'),
    adminsignout: encryptRoute('/adminsignout')
  };
};

/**
 * Check if route is valid encrypted admin route
 */
export const isValidAdminRoute = (route) => {
  const decrypted = decryptRoute(route);
  return ['/adminlogin', '/admindashboard', '/adminsignout'].includes(decrypted);
};

/**
 * Initialize admin routes for session
 * Call this on successful login
 */
export const initializeAdminRoutes = () => {
  if (!ENCRYPTION_ENABLED) return null;
  
  const routes = getEncryptedAdminRoutes();
  
  // Store routes in sessionStorage for this session
  sessionStorage.setItem('admin_encrypted_routes', JSON.stringify(routes));
  
  console.log('🔐 Admin routes initialized for session:', routes);
  
  return routes;
};

/**
 * Get stored encrypted routes for current session
 */
export const getStoredAdminRoutes = () => {
  try {
    const stored = sessionStorage.getItem('admin_encrypted_routes');
    return stored ? JSON.parse(stored) : getEncryptedAdminRoutes();
  } catch (error) {
    console.error('Error getting stored routes:', error);
    return getEncryptedAdminRoutes();
  }
};

/**
 * Clear admin routes (call on logout)
 */
export const clearAdminRoutes = () => {
  sessionStorage.removeItem('admin_session_id');
  sessionStorage.removeItem('admin_encrypted_routes');
  localStorage.removeItem('admin_session_start');
  console.log('🔓 Admin routes cleared');
};

/**
 * Emergency fallback routes (for development/debugging)
 */
export const getEmergencyRoutes = () => {
  if (process.env.NODE_ENV === 'development') {
    return {
      emergency_login: '/emergency-admin-login-dev-only',
      emergency_dashboard: '/emergency-admin-dashboard-dev-only'
    };
  }
  return null;
};

// Export route mapping for Router component
export const ADMIN_ROUTE_MAPPING = {
  // Dynamic routes will be generated at runtime
  getMapping: () => {
    if (!ENCRYPTION_ENABLED) {
      return {
        '/adminlogin': '/adminlogin',
        '/admindashboard': '/admindashboard', 
        '/adminsignout': '/adminsignout'
      };
    }
    
    const routes = getStoredAdminRoutes();
    return {
      [routes.adminlogin]: '/adminlogin',
      [routes.admindashboard]: '/admindashboard',
      [routes.adminsignout]: '/adminsignout'
    };
  }
};

const routeEncoder = {
  encryptRoute,
  decryptRoute,
  getEncryptedAdminRoutes,
  isValidAdminRoute,
  initializeAdminRoutes,
  getStoredAdminRoutes,
  clearAdminRoutes,
  getCurrentSessionId,
  ADMIN_ROUTE_MAPPING
};

export default routeEncoder;