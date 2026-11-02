// src/hooks/useAuth.js

import { useState, useEffect, useCallback } from 'react';
import {
  signInAdmin,
  signOutAdmin,
  getCurrentAdmin,
  verifyAdminSession,
  isAdmin,
  requireAdminAuth
} from '../services/authService';

/**
 * Custom hook for admin authentication management
 * Provides authentication state and methods for React components
 */
export const useAuth = () => {
  // Authentication state
  const [authState, setAuthState] = useState({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
    sessionChecked: false
  });

  // Loading states for different operations
  const [loadingStates, setLoadingStates] = useState({
    signIn: false,
    signOut: false,
    sessionVerification: false
  });

  /**
   * Set loading state for specific operation
   */
  const setOperationLoading = useCallback((operation, isLoading) => {
    setLoadingStates(prev => ({
      ...prev,
      [operation]: isLoading
    }));
  }, []);

  /**
   * Update authentication state
   */
  const updateAuthState = useCallback((newState) => {
    setAuthState(prev => ({
      ...prev,
      ...newState,
      isLoading: false
    }));
  }, []);

  /**
   * Check and restore existing session on component mount
   */
  const checkExistingSession = useCallback(async () => {
    try {
      setOperationLoading('sessionVerification', true);
      
      const currentAdmin = getCurrentAdmin();
      
      if (currentAdmin) {
        // Verify session is still valid
        const verification = await verifyAdminSession();
        
        if (verification.success) {
          updateAuthState({
            user: currentAdmin.user,
            isAuthenticated: true,
            error: null,
            sessionChecked: true
          });
        } else {
          updateAuthState({
            user: null,
            isAuthenticated: false,
            error: verification.error,
            sessionChecked: true
          });
        }
      } else {
        updateAuthState({
          user: null,
          isAuthenticated: false,
          error: null,
          sessionChecked: true
        });
      }
    } catch (error) {
      console.error('Session check error:', error);
      updateAuthState({
        user: null,
        isAuthenticated: false,
        error: {
          code: 'SESSION_CHECK_ERROR',
          message: 'Failed to verify session',
          details: error.message
        },
        sessionChecked: true
      });
    } finally {
      setOperationLoading('sessionVerification', false);
    }
  }, [updateAuthState, setOperationLoading]);

  /**
   * Sign in admin user
   */
  const signIn = useCallback(async (username, password) => {
    try {
      setOperationLoading('signIn', true);
      updateAuthState({ error: null });

      const result = await signInAdmin(username, password);

      if (result.success) {
        updateAuthState({
          user: result.data.user,
          isAuthenticated: true,
          error: null
        });

        return {
          success: true,
          data: result.data
        };
      } else {
        updateAuthState({
          user: null,
          isAuthenticated: false,
          error: result.error
        });

        return {
          success: false,
          error: result.error
        };
      }
    } catch (error) {
      const errorObj = {
        code: 'SIGN_IN_ERROR',
        message: 'Sign in failed',
        details: error.message
      };

      updateAuthState({
        user: null,
        isAuthenticated: false,
        error: errorObj
      });

      return {
        success: false,
        error: errorObj
      };
    } finally {
      setOperationLoading('signIn', false);
    }
  }, [updateAuthState, setOperationLoading]);

  /**
   * Sign out admin user
   */
  const signOut = useCallback(async () => {
    try {
      setOperationLoading('signOut', true);

      const result = await signOutAdmin();

      updateAuthState({
        user: null,
        isAuthenticated: false,
        error: null
      });

      return {
        success: true,
        data: result.data
      };
    } catch (error) {
      console.error('Sign out error:', error);
      
      // Force update state even on error
      updateAuthState({
        user: null,
        isAuthenticated: false,
        error: null
      });

      return {
        success: true,
        data: { message: 'Logged out successfully' }
      };
    } finally {
      setOperationLoading('signOut', false);
    }
  }, [updateAuthState, setOperationLoading]);

  /**
   * Refresh current session
   */
  const refreshSession = useCallback(async () => {
    await checkExistingSession();
  }, [checkExistingSession]);

  /**
   * Clear authentication error
   */
  const clearError = useCallback(() => {
    updateAuthState({ error: null });
  }, [updateAuthState]);

  /**
   * Check if user has admin privileges
   */
  const hasAdminRole = useCallback(() => {
    return authState.isAuthenticated && isAdmin();
  }, [authState.isAuthenticated]);

  /**
   * Require admin authentication for protected operations
   */
  const requireAuth = useCallback(async () => {
    return await requireAdminAuth();
  }, []);

  // Initialize authentication state on mount
  useEffect(() => {
    checkExistingSession();
  }, [checkExistingSession]);

  // Auto-refresh session periodically (every 5 minutes)
  useEffect(() => {
    if (authState.isAuthenticated) {
      const interval = setInterval(() => {
        refreshSession();
      }, 5 * 60 * 1000); // 5 minutes

      return () => clearInterval(interval);
    }
  }, [authState.isAuthenticated, refreshSession]);

  // Return authentication state and methods
  return {
    // Authentication state
    user: authState.user,
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading,
    error: authState.error,
    sessionChecked: authState.sessionChecked,

    // Loading states for different operations
    isSigningIn: loadingStates.signIn,
    isSigningOut: loadingStates.signOut,
    isVerifyingSession: loadingStates.sessionVerification,

    // Authentication methods
    signIn,
    signOut,
    refreshSession,
    clearError,

    // Utility methods
    hasAdminRole,
    requireAuth,
    isAdmin: hasAdminRole,

    // Authentication status helpers
    isFullyLoaded: authState.sessionChecked && !authState.isLoading,
    canAccessAdmin: authState.isAuthenticated && hasAdminRole()
  };
};

/**
 * Hook for components that require admin authentication
 * Automatically redirects or shows error if not authenticated
 */
export const useRequireAuth = (redirectOnFail = true) => {
  const auth = useAuth();
  const [authRequired, setAuthRequired] = useState(false);

  useEffect(() => {
    if (auth.sessionChecked && !auth.isLoading) {
      if (!auth.isAuthenticated) {
        setAuthRequired(true);
        if (redirectOnFail && typeof window !== 'undefined') {
          // Redirect to admin login
          window.location.href = '/adminlogin';
        }
      } else {
        setAuthRequired(false);
      }
    }
  }, [auth.sessionChecked, auth.isLoading, auth.isAuthenticated, redirectOnFail]);

  return {
    ...auth,
    authRequired,
    isReady: auth.sessionChecked && !auth.isLoading && auth.isAuthenticated
  };
};

/**
 * Hook for protected admin operations
 * Provides methods that automatically check authentication
 */
export const useProtectedOperations = () => {
  const auth = useAuth();

  /**
   * Execute operation with automatic auth check
   */
  const executeProtected = useCallback(async (operation) => {
    try {
      // Check authentication first
      const authCheck = await auth.requireAuth();
      
      if (!authCheck.success) {
        return {
          success: false,
          error: authCheck.error
        };
      }

      // Execute the protected operation
      return await operation();
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'PROTECTED_OPERATION_ERROR',
          message: 'Protected operation failed',
          details: error.message
        }
      };
    }
  }, [auth]);

  return {
    executeProtected,
    isAuthenticated: auth.isAuthenticated,
    user: auth.user
  };
};

export default useAuth;