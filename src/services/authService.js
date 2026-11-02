// src/services/authService.js - Supabase Auth based admin security

import { supabase } from './supabaseClient';

const ADMIN_DASHBOARD_PATH = '/admindashboard';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const getRedirectUrl = () => {
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://www.raunakchoudhary.com';

  return `${origin}${ADMIN_DASHBOARD_PATH}`;
};

const authError = (code, message, details = null) => ({
  code,
  message,
  details
});

export const requestAdminLoginOtp = async (email) => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return {
      success: false,
      error: authError('INVALID_EMAIL', 'Enter a valid admin email address')
    };
  }

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: getRedirectUrl()
      }
    });

    if (error) {
      return {
        success: false,
        error: authError('OTP_REQUEST_FAILED', error.message, error)
      };
    }

    return {
      success: true,
      data: {
        email: normalizedEmail,
        message: 'Admin login link sent. Check your email to continue.'
      }
    };
  } catch (error) {
    return {
      success: false,
      error: authError('OTP_REQUEST_ERROR', 'Failed to request admin login link', error.message)
    };
  }
};

export const signInAdmin = async (email) => {
  return requestAdminLoginOtp(email);
};

export const signOutAdmin = async () => {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return {
        success: false,
        error: authError('SIGN_OUT_FAILED', error.message, error)
      };
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem('admin_analytics_session');
    }

    return {
      success: true,
      data: {
        message: 'Logged out successfully'
      }
    };
  } catch (error) {
    return {
      success: false,
      error: authError('SIGN_OUT_ERROR', 'Sign out failed', error.message)
    };
  }
};

export const getCurrentAdmin = async () => {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error || !data?.session?.user) {
      return null;
    }

    const { user, access_token: token, expires_at: expiresAt } = data.session;

    return {
      user: {
        id: user.id,
        email: user.email,
        role: 'admin'
      },
      token,
      expiresAt,
      isAuthenticated: true,
      twoFactorVerified: data.session.user?.aal === 'aal2'
    };
  } catch (error) {
    return null;
  }
};

export const getCurrentSession = async () => {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    return null;
  }

  return data?.session || null;
};

export const verifyAdminSession = async () => {
  try {
    const session = await getCurrentSession();

    if (!session?.user) {
      return {
        success: false,
        error: authError('NO_SESSION', 'No active admin session found')
      };
    }

    const email = normalizeEmail(session.user.email);

    if (!email) {
      return {
        success: false,
        error: authError('NO_ADMIN_EMAIL', 'Admin session is missing an email address')
      };
    }

    const { data: adminUser, error: adminError } = await supabase
      .from('admin_users')
      .select('id,email,is_active')
      .eq('email', email)
      .eq('is_active', true)
      .maybeSingle();

    if (adminError || !adminUser) {
      return {
        success: false,
        error: authError('NOT_ADMIN', 'This account is not authorized for admin access', adminError)
      };
    }

    return {
      success: true,
      data: {
        user: {
          id: session.user.id,
          email,
          role: 'admin'
        },
        adminUser,
        session,
        isValid: true
      }
    };
  } catch (error) {
    return {
      success: false,
      error: authError('SESSION_CHECK_FAILED', 'Failed to verify admin session', error.message)
    };
  }
};

export const requireAdminAuth = async () => {
  return verifyAdminSession();
};

export const isAuthenticated = async () => {
  const session = await getCurrentSession();
  return !!session?.user;
};

export const isAdmin = async () => {
  const result = await verifyAdminSession();
  return result.success;
};

export const initializeAuth = () => {};

const authService = {
  requestAdminLoginOtp,
  signInAdmin,
  signOutAdmin,
  getCurrentAdmin,
  getCurrentSession,
  verifyAdminSession,
  requireAdminAuth,
  isAuthenticated,
  isAdmin,
  initializeAuth
};

export default authService;
