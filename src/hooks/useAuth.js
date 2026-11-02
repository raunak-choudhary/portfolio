// src/hooks/useAuth.js - Supabase Auth based admin state

import { useCallback, useEffect, useState } from 'react';
import {
  requestAdminLoginOtp,
  signOutAdmin,
  verifyAdminSession
} from '../services/authService';
import { supabase } from '../services/supabaseClient';

const initialAuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  sessionChecked: false
};

export const useAuth = () => {
  const [authState, setAuthState] = useState(initialAuthState);
  const [loadingStates, setLoadingStates] = useState({
    signIn: false,
    signOut: false,
    sessionVerification: false
  });

  const setOperationLoading = useCallback((operation, isLoading) => {
    setLoadingStates(prev => ({
      ...prev,
      [operation]: isLoading
    }));
  }, []);

  const setSignedOut = useCallback((error = null) => {
    setAuthState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error,
      sessionChecked: true
    });
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      setOperationLoading('sessionVerification', true);
      const admin = await verifyAdminSession();

      if (!admin.success) {
        setSignedOut(admin.error);
        return;
      }

      setAuthState({
        user: admin.data.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        sessionChecked: true
      });
    } catch (error) {
      setSignedOut({
        code: 'SESSION_CHECK_ERROR',
        message: 'Failed to verify admin session',
        details: error.message
      });
    } finally {
      setOperationLoading('sessionVerification', false);
    }
  }, [setOperationLoading, setSignedOut]);

  const signIn = useCallback(async (email) => {
    try {
      setOperationLoading('signIn', true);
      setAuthState(prev => ({ ...prev, error: null }));

      const result = await requestAdminLoginOtp(email);

      if (!result.success) {
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          error: result.error
        }));
      }

      return result;
    } finally {
      setOperationLoading('signIn', false);
    }
  }, [setOperationLoading]);

  const signOut = useCallback(async () => {
    try {
      setOperationLoading('signOut', true);
      const result = await signOutAdmin();
      setSignedOut(result.success ? null : result.error);
      return result;
    } finally {
      setOperationLoading('signOut', false);
    }
  }, [setOperationLoading, setSignedOut]);

  const clearError = useCallback(() => {
    setAuthState(prev => ({ ...prev, error: null }));
  }, []);

  const requireAuth = useCallback(async () => {
    return verifyAdminSession();
  }, []);

  useEffect(() => {
    refreshSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(() => {
      refreshSession();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshSession]);

  const hasAdminRole = authState.isAuthenticated;

  return {
    user: authState.user,
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading,
    error: authState.error,
    sessionChecked: authState.sessionChecked,
    isSigningIn: loadingStates.signIn,
    isSigningOut: loadingStates.signOut,
    isVerifyingSession: loadingStates.sessionVerification,
    signIn,
    signOut,
    refreshSession,
    clearError,
    hasAdminRole: () => hasAdminRole,
    requireAuth,
    isAdmin: () => hasAdminRole,
    isFullyLoaded: authState.sessionChecked && !authState.isLoading,
    canAccessAdmin: authState.isAuthenticated && hasAdminRole
  };
};

export const useRequireAuth = (redirectOnFail = true) => {
  const auth = useAuth();

  useEffect(() => {
    if (
      redirectOnFail &&
      auth.sessionChecked &&
      !auth.isLoading &&
      !auth.isAuthenticated &&
      typeof window !== 'undefined'
    ) {
      window.location.href = '/adminlogin';
    }
  }, [auth.sessionChecked, auth.isLoading, auth.isAuthenticated, redirectOnFail]);

  return {
    ...auth,
    authRequired: auth.sessionChecked && !auth.isAuthenticated,
    isReady: auth.sessionChecked && !auth.isLoading && auth.isAuthenticated
  };
};

export const useProtectedOperations = () => {
  const auth = useAuth();

  const executeProtected = useCallback(async (operation) => {
    const authCheck = await auth.requireAuth();

    if (!authCheck.success) {
      return authCheck;
    }

    return operation();
  }, [auth]);

  return {
    executeProtected,
    isAuthenticated: auth.isAuthenticated,
    user: auth.user
  };
};

export default useAuth;
