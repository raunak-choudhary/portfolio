// src/hooks/useAuth.js - Supabase Auth based admin state

import { useCallback, useEffect, useState } from 'react';
import {
  getAssuranceState,
  requestAdminLoginOtp,
  signOutAdmin,
  verifyAdminSession
} from '../services/authService';
import { supabase } from '../services/supabaseClient';

/**
 * Where the session stands in the two-step login. `checked` is false until
 * the first read completes, so protected routes can wait instead of guessing.
 */
const initialAssurance = {
  currentLevel: 'aal1',
  nextLevel: 'aal1',
  hasVerifiedFactor: false,
  needsSecondFactor: false,
  needsEnrollment: false,
  checked: false
};

const initialAuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  sessionChecked: false,
  assurance: initialAssurance
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
      sessionChecked: true,
      assurance: initialAssurance
    });
  }, []);

  /** Re-reads the factor and level state, for example after an enrolment or a code step. */
  const refreshAssurance = useCallback(async () => {
    const assurance = await getAssuranceState();
    setAuthState(prev => ({ ...prev, assurance }));
    return assurance;
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      setOperationLoading('sessionVerification', true);
      const admin = await verifyAdminSession();

      if (!admin.success) {
        // No session is the normal signed-out state, not an error to display.
        setSignedOut(admin.error?.code === 'NO_SESSION' ? null : admin.error);
        return;
      }

      const assurance = await getAssuranceState();
      setAuthState({
        user: admin.data.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        sessionChecked: true,
        assurance
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
    assurance: authState.assurance,
    signIn,
    signOut,
    refreshSession,
    refreshAssurance,
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
