// src/contexts/AuthContext.js - PRODUCTION VERSION WITH ENCRYPTED NAVIGATION

import React, { createContext, useContext } from 'react';
import { useAuth } from '../hooks/useAuth';
import routeNavigation from '../utils/routeNavigation'; // 🔐 NEW IMPORT

// Create AuthContext
const AuthContext = createContext();

// AuthContext hook
export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};

/**
 * AuthProvider component that wraps the app and provides authentication state
 * Enhanced with encrypted navigation capabilities
 */
export const AuthProvider = ({ children }) => {
  const auth = useAuth();

  // 🔐 NEW: Enhanced authentication methods with encrypted navigation
  const enhancedAuth = {
    ...auth,

    /**
     * Enhanced sign in with encrypted navigation setup
     */
    signIn: async (username, password) => {
      try {
        // Call original sign in
        const result = await auth.signIn(username, password);
        
        if (result.success) {
          // Initialize encrypted admin session
          const sessionResult = routeNavigation.initializeAdminSession();
          
          if (sessionResult.success) {
            console.log('🔐 Encrypted admin session initialized');
            
            // Store successful login navigation
            routeNavigation.storeNavigationHistory('/adminlogin', 'successful_login');
            
            return {
              ...result,
              encryptedSession: sessionResult,
              navigationReady: true
            };
          } else {
            console.warn('⚠️ Failed to initialize encrypted session, using fallback');
            return {
              ...result,
              encryptedSession: null,
              navigationReady: false
            };
          }
        }
        
        return result;
      } catch (error) {
        console.error('❌ Enhanced sign in failed:', error);
        return {
          success: false,
          error: {
            code: 'ENHANCED_AUTH_ERROR',
            message: 'Authentication failed',
            details: error.message
          }
        };
      }
    },

    /**
     * Enhanced sign out with encrypted navigation cleanup
     */
    signOut: async () => {
      try {
        // Clean up encrypted navigation first
        const cleanupResult = routeNavigation.cleanupAdminSession();
        
        if (cleanupResult.success) {
          console.log('🔐 Encrypted session cleaned up');
        }
        
        // Call original sign out
        const result = await auth.signOut();
        
        // Clear navigation history
        routeNavigation.clearNavigationHistory();
        
        return {
          ...result,
          encryptedSessionCleanup: cleanupResult.success,
          navigationCleared: true
        };
      } catch (error) {
        console.error('❌ Enhanced sign out failed:', error);
        
        // Force cleanup even on error
        routeNavigation.cleanupAdminSession();
        routeNavigation.clearNavigationHistory();
        
        // Still call original sign out
        return await auth.signOut();
      }
    },

    /**
     * Get current encrypted admin routes
     */
    getCurrentRoutes: () => {
      const routeResult = routeNavigation.getCurrentAdminRoutes();
      return routeResult.success ? routeResult.routes : null;
    },

    /**
     * Navigate to admin login using encrypted route
     */
    navigateToLogin: (options = {}) => {
      return routeNavigation.navigateToAdminLogin(options);
    },

    /**
     * Navigate to admin dashboard using encrypted route
     */
    navigateToDashboard: (options = {}) => {
      return routeNavigation.navigateToAdminDashboard(options);
    },

    /**
     * Navigate to admin signout using encrypted route
     */
    navigateToSignOut: (options = {}) => {
      return routeNavigation.navigateToAdminSignOut(options);
    },

    /**
     * Check if current route is valid encrypted admin route
     */
    validateCurrentRoute: () => {
      return routeNavigation.validateCurrentRoute(window.location.pathname);
    },

    /**
     * Get admin navigation history
     */
    getNavigationHistory: () => {
      return routeNavigation.getNavigationHistory();
    },

    /**
     * Enhanced session check with route validation
     */
    isValidSession: () => {
      if (!auth.isAuthenticated) {
        return false;
      }
      
      // Additional route validation for admin sessions
      const routeValidation = routeNavigation.validateCurrentRoute(window.location.pathname);
      
      // If on admin route, validate it's properly encrypted/authorized
      if (routeValidation.isValidAdmin) {
        return routeValidation.isValidAdmin;
      }
      
      // For non-admin routes, rely on basic auth
      return auth.isAuthenticated;
    },

    /**
     * Enhanced access control
     */
    canAccessAdmin: () => {
      return auth.isAuthenticated && auth.hasAdminRole && auth.isAdmin;
    }
  };

  const value = {
    // Original authentication state
    user: enhancedAuth.user,
    isAuthenticated: enhancedAuth.isAuthenticated,
    isLoading: enhancedAuth.isLoading,
    error: enhancedAuth.error,
    sessionChecked: enhancedAuth.sessionChecked,

    // Loading states
    isSigningIn: enhancedAuth.isSigningIn,
    isSigningOut: enhancedAuth.isSigningOut,
    isVerifyingSession: enhancedAuth.isVerifyingSession,

    // 🔐 ENHANCED: Authentication methods with encrypted navigation
    signIn: enhancedAuth.signIn,
    signOut: enhancedAuth.signOut,
    refreshSession: enhancedAuth.refreshSession,
    clearError: enhancedAuth.clearError,

    // Original utility methods
    hasAdminRole: enhancedAuth.hasAdminRole,
    requireAuth: enhancedAuth.requireAuth,
    isAdmin: enhancedAuth.isAdmin,

    // 🔐 NEW: Enhanced status helpers
    isFullyLoaded: enhancedAuth.isFullyLoaded,
    canAccessAdmin: enhancedAuth.canAccessAdmin,
    isValidSession: enhancedAuth.isValidSession,

    // User information
    username: enhancedAuth.user?.username || null,
    email: enhancedAuth.user?.email || null,
    userId: enhancedAuth.user?.id || null,

    // 🔐 ENHANCED: Session information with encryption status
    isSessionValid: enhancedAuth.isValidSession() && !enhancedAuth.error,
    hasActiveSession: enhancedAuth.sessionChecked && enhancedAuth.isAuthenticated,
    
    // 🔐 NEW: Encrypted navigation methods
    getCurrentRoutes: enhancedAuth.getCurrentRoutes,
    navigateToLogin: enhancedAuth.navigateToLogin,
    navigateToDashboard: enhancedAuth.navigateToDashboard,
    navigateToSignOut: enhancedAuth.navigateToSignOut,
    validateCurrentRoute: enhancedAuth.validateCurrentRoute,
    getNavigationHistory: enhancedAuth.getNavigationHistory
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Higher-order component for protecting routes that require authentication
 * Enhanced with encrypted route validation
 */
export const withAuth = (WrappedComponent) => {
  return function AuthenticatedComponent(props) {
    const { 
      isAuthenticated, 
      isLoading, 
      sessionChecked, 
      navigateToLogin,
      validateCurrentRoute 
    } = useAuthContext();

    // Show loading while checking session
    if (!sessionChecked || isLoading) {
      return (
        <div className="auth-loading">
          <div className="loading-spinner-container">
            <div className="loading-spinner">
              <div className="spinner-ring">
                <div className="spinner-ring-inner"></div>
              </div>
            </div>
            <p className="loading-message">Verifying authentication...</p>
          </div>
        </div>
      );
    }

    // Redirect to login if not authenticated
    if (!isAuthenticated) {
      // 🔐 ENHANCED: Use encrypted navigation for redirect
      const navResult = navigateToLogin({ replace: true });
      
      if (!navResult.success) {
        // Fallback to standard navigation
        window.location.href = '/adminlogin';
      }
      
      return null;
    }

    // 🔐 NEW: Additional route validation for admin components
    const routeValidation = validateCurrentRoute();
    
    if (routeValidation.needsRedirect && routeValidation.success) {
      console.log('🔀 Legacy admin route detected, redirecting to encrypted route');
      
      // This will be handled by the Router component
      return (
        <div className="auth-redirecting">
          <div className="loading-spinner-container">
            <div className="loading-spinner">
              <div className="spinner-ring">
                <div className="spinner-ring-inner"></div>
              </div>
            </div>
            <p className="loading-message">Redirecting to secure route...</p>
          </div>
        </div>
      );
    }

    return <WrappedComponent {...props} />;
  };
};

/**
 * Component for protecting admin-only content
 * Enhanced with encrypted route awareness
 */
export const AdminOnly = ({ children, fallback = null }) => {
  const { canAccessAdmin, isFullyLoaded, validateCurrentRoute } = useAuthContext();

  if (!isFullyLoaded) {
    return (
      <div className="auth-checking">
        <p>Checking permissions...</p>
      </div>
    );
  }

  if (!canAccessAdmin()) {
    return fallback || (
      <div className="access-denied">
        <h3>Access Denied</h3>
        <p>You don't have permission to view this content.</p>
      </div>
    );
  }

  // 🔐 NEW: Additional route validation for admin content
  const routeValidation = validateCurrentRoute();
  
  if (routeValidation.isValidAdmin === false && routeValidation.success) {
    return (
      <div className="route-access-denied">
        <h3>Invalid Admin Route</h3>
        <p>This admin route is not valid or has expired.</p>
        <button 
          onClick={() => window.location.href = '/adminlogin'}
          className="neon-button primary"
        >
          Return to Login
        </button>
      </div>
    );
  }

  return children;
};

/**
 * Component for showing content only to authenticated users
 * Enhanced with session validation
 */
export const AuthenticatedOnly = ({ children, fallback = null }) => {
  const { isValidSession, isFullyLoaded } = useAuthContext();

  if (!isFullyLoaded) {
    return null;
  }

  if (!isValidSession()) {
    return fallback;
  }

  return children;
};

/**
 * Component for showing content only to non-authenticated users
 */
export const UnauthenticatedOnly = ({ children }) => {
  const { isAuthenticated, isFullyLoaded } = useAuthContext();

  if (!isFullyLoaded) {
    return null;
  }

  if (isAuthenticated) {
    return null;
  }

  return children;
};

/**
 * 🔐 NEW: Component for handling encrypted route transitions
 */
export const EncryptedRouteHandler = ({ children, targetRoute }) => {
  const { validateCurrentRoute, navigateToLogin } = useAuthContext();
  const [routeStatus, setRouteStatus] = React.useState('validating');

  React.useEffect(() => {
    const checkRoute = async () => {
      const validation = validateCurrentRoute();
      
      if (validation.success && validation.isValidAdmin) {
        setRouteStatus('valid');
      } else if (validation.needsRedirect) {
        setRouteStatus('redirecting');
        // Redirect will be handled by Router component
      } else {
        setRouteStatus('invalid');
        // Redirect to login for invalid routes
        navigateToLogin({ replace: true });
      }
    };

    checkRoute();
  }, [validateCurrentRoute, navigateToLogin]);

  if (routeStatus === 'validating') {
    return (
      <div className="route-validating">
        <div className="loading-spinner-container">
          <div className="loading-spinner">
            <div className="spinner-ring">
              <div className="spinner-ring-inner"></div>
            </div>
          </div>
          <p className="loading-message">Validating secure route...</p>
        </div>
      </div>
    );
  }

  if (routeStatus === 'redirecting') {
    return (
      <div className="route-redirecting">
        <div className="loading-spinner-container">
          <div className="loading-spinner">
            <div className="spinner-ring">
              <div className="spinner-ring-inner"></div>
            </div>
          </div>
          <p className="loading-message">Redirecting to secure route...</p>
        </div>
      </div>
    );
  }

  if (routeStatus === 'invalid') {
    return (
      <div className="route-invalid">
        <div className="error-container">
          <h3>🔒 Invalid Admin Route</h3>
          <p>This admin route is not valid or has expired.</p>
          <p>You will be redirected to login.</p>
        </div>
      </div>
    );
  }

  // routeStatus === 'valid'
  return children;
};

/**
 * 🔐 NEW: Hook for encrypted navigation within components
 */
export const useEncryptedNavigation = () => {
  const { 
    getCurrentRoutes, 
    navigateToLogin, 
    navigateToDashboard, 
    navigateToSignOut,
    validateCurrentRoute,
    getNavigationHistory 
  } = useAuthContext();

  return {
    // Get current encrypted routes
    routes: getCurrentRoutes(),
    
    // Navigation methods
    goToLogin: navigateToLogin,
    goToDashboard: navigateToDashboard,
    goToSignOut: navigateToSignOut,
    
    // Route validation
    validateRoute: validateCurrentRoute,
    
    // Navigation history
    history: getNavigationHistory(),
    
    // Utility methods
    isCurrentRouteValid: () => {
      const validation = validateCurrentRoute();
      return validation.success && validation.isValidAdmin;
    },
    
    isOnEncryptedRoute: () => {
      const validation = validateCurrentRoute();
      return validation.success && validation.isEncryptedAdmin;
    },
    
    needsRedirect: () => {
      const validation = validateCurrentRoute();
      return validation.success && validation.needsRedirect;
    }
  };
};

/**
 * 🔐 NEW: Component for displaying current route security status (production version - no details)
 */
export const RouteSecurityIndicator = () => {
  const { validateCurrentRoute } = useAuthContext();
  const [isSecure, setIsSecure] = React.useState(false);

  React.useEffect(() => {
    const validation = validateCurrentRoute();
    setIsSecure(validation.success && (validation.isEncryptedAdmin || !validation.isValidAdmin));
  }, [validateCurrentRoute]);

  if (!isSecure) {
    return null; // Don't show anything for non-admin routes
  }

  return (
    <div className="route-security-indicator">
      <span className="security-icon">🔐</span>
      <span className="security-text">Secure Connection</span>
    </div>
  );
};

/**
 * 🔐 NEW: Error boundary for encrypted route errors
 */
export class EncryptedRouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('🔐 Encrypted route error:', error, errorInfo);
    
    // Clean up potentially corrupted navigation state
    try {
      routeNavigation.clearNavigationHistory();
    } catch (cleanupError) {
      console.error('Failed to cleanup navigation:', cleanupError);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="encrypted-route-error">
          <div className="error-container">
            <h3>🔐 Secure Route Error</h3>
            <p>An error occurred while processing the secure route.</p>
            <button 
              onClick={() => window.location.href = '/adminlogin'}
              className="neon-button primary"
            >
              Return to Login
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AuthContext;