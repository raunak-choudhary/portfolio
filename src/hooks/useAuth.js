// src/hooks/useAuth.js - Supabase Auth based admin state

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getAssuranceState,
  requestAdminLoginOtp,
  signOutAdmin,
  verifyAdminSession
} from '../services/authService';
import { supabase } from '../services/supabaseClient';
import { noteSecondFactorSignIn } from '../services/activityService';

/**
 * Logs the sign-in once per session when a check finds level 2 (the
 * activity service keeps the per-session flag). Fire and forget: the call
 * never rejects, and a logging failure never touches the auth state.
 */
const noteSignInAt = (assurance) => {
  if (assurance?.currentLevel === 'aal2') void noteSecondFactorSignIn();
};

/** authService's code for a session check that got no answer (offline, server error). */
const CHECK_UNAVAILABLE = 'SESSION_CHECK_UNAVAILABLE';

/** Waits between re-checks after an unanswered one; the last value repeats. An `online` event re-checks at once. */
export const RECHECK_DELAYS_MS = [2000, 5000, 15000, 30000];
/** After this many unanswered re-checks in a row the hook stops asking until the next auth event or `online`. */
export const RECHECK_LIMIT = 8;

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
  const checkGeneration = useRef(0);
  // The latest state for the async checks, and the pending re-check after an unanswered one.
  const stateRef = useRef(initialAuthState);
  stateRef.current = authState;
  const recheck = useRef({ timer: null, attempts: 0 });
  const refreshSessionRef = useRef(null);

  const disposed = useRef(false);
  const cancelRecheck = useCallback(() => {
    if (recheck.current.timer) clearTimeout(recheck.current.timer);
    recheck.current = { timer: null, attempts: 0 };
  }, []);

  /** Asks again later, with a growing wait, up to RECHECK_LIMIT times in a row. */
  const scheduleRecheck = useCallback(() => {
    const pending = recheck.current;
    // A check still in flight when the hook unmounts resolves afterwards; it
    // must not start a timer nothing is left to clear.
    if (disposed.current) return;
    if (pending.timer || pending.attempts >= RECHECK_LIMIT) return;
    const wait = RECHECK_DELAYS_MS[Math.min(pending.attempts, RECHECK_DELAYS_MS.length - 1)];
    pending.attempts += 1;
    pending.timer = setTimeout(() => { recheck.current.timer = null; refreshSessionRef.current?.(); }, wait);
  }, []);
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
    const read = await getAssuranceState();
    // An unreadable level says nothing new: keep the answer already held.
    const held = stateRef.current.assurance;
    const assurance = read.levelUnknown && held.checked && !held.levelUnknown ? held : read;
    setAuthState(prev => ({ ...prev, assurance }));
    noteSignInAt(assurance);
    return assurance;
  }, []);

  const refreshSession = useCallback(async () => {
    // Several checks can be in flight at once (mount, every auth event). Only
    // the newest may write state: an older check that started while signed in
    // and resolves after a sign-out would otherwise put the session back.
    const generation = ++checkGeneration.current;
    const isStale = () => generation !== checkGeneration.current;
    try {
      setOperationLoading('sessionVerification', true);
      const admin = await verifyAdminSession();
      if (isStale()) return;

      if (!admin.success) {
        if (admin.error?.code === CHECK_UNAVAILABLE) {
          // No answer is not a refusal. auth-js re-announces the session every
          // time the tab becomes visible, so a laptop waking up offline ran
          // this check, failed it, and threw a signed-in admin (and any
          // unsaved edit) out to the login. Keep what was known and ask again.
          scheduleRecheck();
          if (stateRef.current.isAuthenticated) return;
          setSignedOut(admin.error);
          return;
        }
        cancelRecheck();
        // No session is the normal signed-out state, not an error to display.
        setSignedOut(admin.error?.code === 'NO_SESSION' ? null : admin.error);
        return;
      }

      const read = await getAssuranceState();
      if (isStale()) return;
      const held = stateRef.current;
      // Same rule for the factor state: an unreadable level keeps the held answer.
      const assurance = read.levelUnknown && held.isAuthenticated && held.assurance.checked && !held.assurance.levelUnknown ? held.assurance : read;
      if (read.unknown) scheduleRecheck(); else cancelRecheck();
      noteSignInAt(assurance);
      setAuthState({
        user: admin.data.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        sessionChecked: true,
        assurance
      });
    } catch (error) {
      if (isStale()) return;
      setSignedOut({
        code: 'SESSION_CHECK_ERROR',
        message: 'Failed to verify admin session',
        details: error.message
      });
    } finally {
      setOperationLoading('sessionVerification', false);
    }
  }, [setOperationLoading, setSignedOut, scheduleRecheck, cancelRecheck]);
  refreshSessionRef.current = refreshSession;

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
      if (!result.success) {
        // The session is still stored on this device (it could not even be
        // forgotten locally): saying "signed out" here would be untrue, and
        // the next reload would walk straight back in.
        setAuthState(prev => ({ ...prev, error: result.error }));
        return result;
      }
      checkGeneration.current += 1;
      cancelRecheck();
      setSignedOut(null);
      return result;
    } finally {
      setOperationLoading('signOut', false);
    }
  }, [setOperationLoading, setSignedOut, cancelRecheck]);

  const clearError = useCallback(() => {
    setAuthState(prev => ({ ...prev, error: null }));
  }, []);

  const requireAuth = useCallback(async () => {
    return verifyAdminSession();
  }, []);

  useEffect(() => {
    disposed.current = false;
    refreshSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        // Settle at once and retire any check still in flight.
        checkGeneration.current += 1;
        cancelRecheck();
        setSignedOut(null);
        return;
      }
      refreshSession();
    });

    // The connection coming back is the best moment to finish an unanswered check.
    const onOnline = () => {
      if (!recheck.current.timer && recheck.current.attempts === 0) return;
      cancelRecheck();
      refreshSession();
    };
    window.addEventListener('online', onOnline);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('online', onOnline);
      disposed.current = true;
      cancelRecheck();
    };
  }, [refreshSession, setSignedOut, cancelRecheck]);

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
