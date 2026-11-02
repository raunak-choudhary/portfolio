// src/services/authService.js - COMPLETE VERSION WITH 2FA SUPPORT

import { supabase } from './supabaseClient';
import bcrypt from 'bcryptjs';

// Authentication constants - ENHANCED FOR 2FA
const AUTH_CONFIG = {
  saltRounds: 12,
  sessionKey: 'portfolio_admin_session',
  tokenExpiry: 12 * 60 * 60 * 1000, // 12 hours (changed from 24)
  refreshThreshold: 2 * 60 * 60 * 1000, // 2 hours before expiry
  
  // 🔐 NEW: 2FA Configuration
  otpExpiry: 10 * 60 * 1000, // 10 minutes
  maxOtpAttempts: 5,
  maxLoginAttempts: 5,
  accountLockoutDuration: 30 * 60 * 1000, // 30 minutes
  otpResendCooldown: 2 * 60 * 1000, // 2 minutes between OTP sends
  
  // Edge Function URL for OTP email (update with your project reference)
  otpEmailFunctionUrl: 'https://emaaaeooafqawdvdreaz.supabase.co/functions/v1/send-otp-email'
};

// =============================================
// BCRYPT COMPATIBILITY HELPER (EXISTING)
// =============================================

/**
 * Enhanced password verification with better $2a/$2b compatibility
 * @param {string} password - Plain text password
 * @param {string} hash - Stored password hash
 * @returns {boolean} Password match result
 */
const verifyPasswordCompatible = async (password, hash) => {
  try {
    console.log('🔐 Verifying password...');
    console.log('- Password:', password);
    console.log('- Hash format:', hash.substring(0, 10) + '...');
    
    // Method 1: Direct comparison with bcryptjs (should work for $2a$)
    console.log('🔄 Trying direct bcrypt.compare...');
    const directMatch = await bcrypt.compare(password, hash);
    if (directMatch) {
      console.log('✅ Password verified using direct comparison');
      return true;
    }

    // Method 2: If direct doesn't work and it's $2a$, try $2b$ conversion
    if (hash.startsWith('$2a$')) {
      console.log('🔄 Trying $2a$ to $2b$ conversion...');
      const convertedHash = hash.replace('$2a$', '$2b$');
      const convertedMatch = await bcrypt.compare(password, convertedHash);
      if (convertedMatch) {
        console.log('✅ Password verified using $2a$ to $2b$ conversion');
        return true;
      }
    }

    // Method 3: If it's $2b$, try $2a$ conversion
    if (hash.startsWith('$2b$')) {
      console.log('🔄 Trying $2b$ to $2a$ conversion...');
      const convertedHash = hash.replace('$2b$', '$2a$');
      const convertedMatch = await bcrypt.compare(password, convertedHash);
      if (convertedMatch) {
        console.log('✅ Password verified using $2b$ to $2a$ conversion');
        return true;
      }
    }

    // Method 4: Manual debugging (temporary)
    console.log('🔍 Debug info:');
    console.log('- bcrypt module loaded:', typeof bcrypt !== 'undefined');
    console.log('- Hash length:', hash.length);
    console.log('- Password length:', password.length);
    
    console.warn('❌ All password verification methods failed');
    return false;

  } catch (error) {
    console.error('❌ Password verification error:', error);
    console.error('Error details:', error.message);
    return false;
  }
};

// 🔧 DEBUG FUNCTION (EXISTING)
export const debugPasswordTest = async () => {
  const testPassword = 'password';
  const testHash = '$2a$12$fKAP565IGiXpl860vJJCUeqB/jGHAsHSa87j5low0eJGpLESORKXy';
  
  console.log('🧪 Testing password verification...');
  console.log('Password:', testPassword);
  console.log('Hash:', testHash);
  
  try {
    // Test with bcryptjs directly
    console.log('Testing bcrypt.compare directly...');
    const directResult = await bcrypt.compare(testPassword, testHash);
    console.log('Direct bcrypt result:', directResult);
    
    // Test with our compatibility function
    console.log('Testing verifyPasswordCompatible...');
    const compatResult = await verifyPasswordCompatible(testPassword, testHash);
    console.log('Compatibility function result:', compatResult);
    
    return { direct: directResult, compatible: compatResult };
  } catch (error) {
    console.error('Debug test error:', error);
    return { error: error.message };
  }
};

// Make it available in window for browser console testing
if (typeof window !== 'undefined') {
  window.debugPasswordTest = debugPasswordTest;
}

// =============================================
// 🔐 NEW: OTP GENERATION AND VALIDATION
// =============================================

/**
 * Generate 6-digit alphanumeric OTP
 * @returns {string} 6-digit alphanumeric OTP
 */
const generateOTP = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let otp = '';
  for (let i = 0; i < 6; i++) {
    otp += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return otp;
};

/**
 * Send OTP to admin email
 * @param {string} username - Admin username
 * @param {string} otpCode - Generated OTP code
 * @returns {Object} Email sending result
 */
const sendOTPEmail = async (username, otpCode) => {
  try {
    console.log('📧 Sending OTP email for username:', username);
    
    const response = await fetch(AUTH_CONFIG.otpEmailFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        username,
        otpCode
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to send OTP email');
    }

    console.log('✅ OTP email sent successfully');
    return {
      success: true,
      data: result.data
    };

  } catch (error) {
    console.error('❌ Failed to send OTP email:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Check if admin account is locked
 * @param {Object} adminUser - Admin user object
 * @returns {boolean} Whether account is locked
 */
const isAccountLocked = (adminUser) => {
  if (!adminUser.locked_until) return false;
  
  const lockExpiry = new Date(adminUser.locked_until);
  const now = new Date();
  
  return lockExpiry > now;
};

/**
 * Check if OTP resend is allowed (rate limiting)
 * @param {Object} adminUser - Admin user object
 * @returns {boolean} Whether OTP resend is allowed
 */
const canResendOTP = (adminUser) => {
  if (!adminUser.otp_last_sent) return true;
  
  const lastSent = new Date(adminUser.otp_last_sent);
  const now = new Date();
  const timeDiff = now.getTime() - lastSent.getTime();
  
  return timeDiff >= AUTH_CONFIG.otpResendCooldown;
};

// =============================================
// 🔐 NEW: TWO-STEP AUTHENTICATION FLOW
// =============================================

/**
 * Step 1: Verify credentials and send OTP
 * @param {string} username - Admin username
 * @param {string} password - Admin password
 * @returns {Object} Authentication step 1 result
 */
export const verifyCredentialsAndSendOTP = async (username, password) => {
  try {
    // Input validation
    if (!username || !password) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Username and password are required'
        }
      };
    }

    const sanitizedUsername = username.trim().toLowerCase();
    console.log('🔐 Step 1: Verifying credentials for:', sanitizedUsername);

    // Get admin user from database with 2FA fields
    const { data: adminUser, error: fetchError } = await supabase
      .from('admin_users')
      .select(`
        id, username, password_hash, email, is_active, 
        login_attempts, locked_until, two_fa_enabled,
        otp_last_sent, otp_attempts
      `)
      .eq('username', sanitizedUsername)
      .eq('is_active', true)
      .single();

    if (fetchError || !adminUser) {
      console.warn(`❌ User not found: ${sanitizedUsername}`);
      return {
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password'
        }
      };
    }

    // Check if account is locked
    if (isAccountLocked(adminUser)) {
      const lockExpiry = new Date(adminUser.locked_until);
      console.warn(`🔒 Account locked until: ${lockExpiry}`);
      
      return {
        success: false,
        error: {
          code: 'ACCOUNT_LOCKED',
          message: `Account is temporarily locked. Try again after ${lockExpiry.toLocaleTimeString()}`
        }
      };
    }

    // Verify password using existing compatibility function
    const isPasswordValid = await verifyPasswordCompatible(password, adminUser.password_hash);
    
    if (!isPasswordValid) {
      // Increment login attempts
      const newAttempts = (adminUser.login_attempts || 0) + 1;
      const updateData = { login_attempts: newAttempts };
      
      // Lock account if max attempts reached
      if (newAttempts >= AUTH_CONFIG.maxLoginAttempts) {
        updateData.locked_until = new Date(Date.now() + AUTH_CONFIG.accountLockoutDuration).toISOString();
        console.warn(`🔒 Account locked after ${newAttempts} failed attempts`);
      }
      
      await supabase
        .from('admin_users')
        .update(updateData)
        .eq('id', adminUser.id);
      
      return {
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password',
          remainingAttempts: Math.max(0, AUTH_CONFIG.maxLoginAttempts - newAttempts)
        }
      };
    }

    console.log('✅ Credentials verified successfully');

    // Check if 2FA is enabled (default to true for security)
    const twoFAEnabled = adminUser.two_fa_enabled !== false; // Default to true if null
    
    if (!twoFAEnabled) {
      console.log('⚠️ 2FA disabled for user, but requiring for security');
      // For security, we'll still require 2FA even if disabled in DB
    }

    // Check OTP resend rate limiting
    if (!canResendOTP(adminUser)) {
      const cooldownRemaining = AUTH_CONFIG.otpResendCooldown - (Date.now() - new Date(adminUser.otp_last_sent).getTime());
      const secondsRemaining = Math.ceil(cooldownRemaining / 1000);
      
      return {
        success: false,
        error: {
          code: 'OTP_RATE_LIMITED',
          message: `Please wait ${secondsRemaining} seconds before requesting another OTP`
        }
      };
    }

    // Generate and store OTP
    const otpCode = generateOTP();
    const otpExpiry = new Date(Date.now() + AUTH_CONFIG.otpExpiry);

    console.log('🔐 Generated OTP for user:', sanitizedUsername);

    // Update user with OTP data
    const { error: updateError } = await supabase
      .from('admin_users')
      .update({
        otp_code: otpCode,
        otp_expires_at: otpExpiry.toISOString(),
        otp_attempts: 0,
        otp_last_sent: new Date().toISOString(),
        login_attempts: 0 // Reset login attempts on successful credential verification
      })
      .eq('id', adminUser.id);

    if (updateError) {
      console.error('❌ Failed to store OTP:', updateError);
      return {
        success: false,
        error: {
          code: 'OTP_STORAGE_ERROR',
          message: 'Failed to generate verification code'
        }
      };
    }

    // Send OTP email
    const emailResult = await sendOTPEmail(sanitizedUsername, otpCode);
    
    if (!emailResult.success) {
      console.error('❌ Failed to send OTP email:', emailResult.error);
      return {
        success: false,
        error: {
          code: 'OTP_EMAIL_ERROR',
          message: 'Failed to send verification code. Please try again.'
        }
      };
    }

    console.log('🎉 Step 1 completed: OTP sent to admin email');

    return {
      success: true,
      data: {
        message: 'Verification code sent to admin email',
        requiresOTP: true,
        otpExpiresAt: otpExpiry.toISOString(),
        emailSent: true,
        userId: adminUser.id,
        username: adminUser.username
      }
    };

  } catch (error) {
    console.error('❌ Step 1 authentication error:', error);
    return {
      success: false,
      error: {
        code: 'AUTHENTICATION_ERROR',
        message: 'Authentication failed. Please try again.'
      }
    };
  }
};

/**
 * Step 2: Verify OTP and complete login
 * @param {string} username - Admin username
 * @param {string} otpCode - OTP code entered by user
 * @returns {Object} Authentication step 2 result
 */
export const verifyOTPAndLogin = async (username, otpCode) => {
  try {
    if (!username || !otpCode) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Username and verification code are required'
        }
      };
    }

    const sanitizedUsername = username.trim().toLowerCase();
    const sanitizedOTP = otpCode.trim().toUpperCase();

    console.log('🔐 Step 2: Verifying OTP for:', sanitizedUsername);

    // Get admin user with OTP data
    const { data: adminUser, error: fetchError } = await supabase
      .from('admin_users')
      .select(`
        id, username, email, otp_code, otp_expires_at, 
        otp_attempts, two_fa_enabled, is_active
      `)
      .eq('username', sanitizedUsername)
      .eq('is_active', true)
      .single();

    if (fetchError || !adminUser) {
      return {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid verification request'
        }
      };
    }

    // Check if OTP exists
    if (!adminUser.otp_code || !adminUser.otp_expires_at) {
      return {
        success: false,
        error: {
          code: 'NO_OTP',
          message: 'No verification code found. Please request a new one.'
        }
      };
    }

    // Check if OTP has expired
    const otpExpiry = new Date(adminUser.otp_expires_at);
    const now = new Date();
    
    if (now > otpExpiry) {
      // Clear expired OTP
      await supabase
        .from('admin_users')
        .update({
          otp_code: null,
          otp_expires_at: null,
          otp_attempts: 0
        })
        .eq('id', adminUser.id);

      return {
        success: false,
        error: {
          code: 'OTP_EXPIRED',
          message: 'Verification code has expired. Please request a new one.'
        }
      };
    }

    // Check max OTP attempts
    if (adminUser.otp_attempts >= AUTH_CONFIG.maxOtpAttempts) {
      // Clear OTP to force re-generation
      await supabase
        .from('admin_users')
        .update({
          otp_code: null,
          otp_expires_at: null,
          otp_attempts: 0
        })
        .eq('id', adminUser.id);

      return {
        success: false,
        error: {
          code: 'MAX_OTP_ATTEMPTS',
          message: 'Too many verification attempts. Please request a new code.'
        }
      };
    }

    // Verify OTP code
    if (sanitizedOTP !== adminUser.otp_code) {
      // Increment OTP attempts
      const newAttempts = adminUser.otp_attempts + 1;
      
      await supabase
        .from('admin_users')
        .update({ otp_attempts: newAttempts })
        .eq('id', adminUser.id);

      return {
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: 'Invalid verification code',
          remainingAttempts: Math.max(0, AUTH_CONFIG.maxOtpAttempts - newAttempts)
        }
      };
    }

    console.log('✅ OTP verified successfully');

    // Clear OTP data and update last login
    await supabase
      .from('admin_users')
      .update({
        otp_code: null,
        otp_expires_at: null,
        otp_attempts: 0,
        last_login: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', adminUser.id);

    // Generate session token using existing function
    const sessionToken = generateSessionToken(adminUser);
    
    // Store session in localStorage
    const sessionData = {
      token: sessionToken,
      user: {
        id: adminUser.id,
        username: adminUser.username,
        email: adminUser.email,
        role: 'admin'
      },
      expiresAt: new Date(Date.now() + AUTH_CONFIG.tokenExpiry).toISOString(),
      createdAt: new Date().toISOString(),
      twoFactorVerified: true
    };

    localStorage.setItem(AUTH_CONFIG.sessionKey, JSON.stringify(sessionData));
    setAuthHeader(sessionToken);

    console.log('🎉 Step 2 completed: Admin login successful with 2FA');

    return {
      success: true,
      data: {
        user: sessionData.user,
        token: sessionToken,
        expiresAt: sessionData.expiresAt,
        message: 'Login successful with 2FA verification',
        twoFactorVerified: true
      }
    };

  } catch (error) {
    console.error('❌ Step 2 OTP verification error:', error);
    return {
      success: false,
      error: {
        code: 'OTP_VERIFICATION_ERROR',
        message: 'OTP verification failed. Please try again.'
      }
    };
  }
};

/**
 * Resend OTP to admin email
 * @param {string} username - Admin username
 * @returns {Object} OTP resend result
 */
export const resendOTP = async (username) => {
  try {
    const sanitizedUsername = username.trim().toLowerCase();
    console.log('🔄 Resending OTP for:', sanitizedUsername);

    const { data: adminUser, error: fetchError } = await supabase
      .from('admin_users')
      .select('id, username, otp_last_sent, is_active')
      .eq('username', sanitizedUsername)
      .eq('is_active', true)
      .single();

    if (fetchError || !adminUser) {
      return {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Invalid request'
        }
      };
    }

    // Check rate limiting
    if (!canResendOTP(adminUser)) {
      const cooldownRemaining = AUTH_CONFIG.otpResendCooldown - (Date.now() - new Date(adminUser.otp_last_sent).getTime());
      const secondsRemaining = Math.ceil(cooldownRemaining / 1000);
      
      return {
        success: false,
        error: {
          code: 'OTP_RATE_LIMITED',
          message: `Please wait ${secondsRemaining} seconds before requesting another code`
        }
      };
    }

    // Generate new OTP
    const otpCode = generateOTP();
    const otpExpiry = new Date(Date.now() + AUTH_CONFIG.otpExpiry);

    // Update user with new OTP
    const { error: updateError } = await supabase
      .from('admin_users')
      .update({
        otp_code: otpCode,
        otp_expires_at: otpExpiry.toISOString(),
        otp_attempts: 0,
        otp_last_sent: new Date().toISOString()
      })
      .eq('id', adminUser.id);

    if (updateError) {
      console.error('❌ Failed to update OTP:', updateError);
      return {
        success: false,
        error: {
          code: 'OTP_UPDATE_ERROR',
          message: 'Failed to generate new verification code'
        }
      };
    }

    // Send new OTP email
    const emailResult = await sendOTPEmail(sanitizedUsername, otpCode);
    
    if (!emailResult.success) {
      return {
        success: false,
        error: {
          code: 'OTP_EMAIL_ERROR',
          message: 'Failed to send verification code'
        }
      };
    }

    console.log('✅ OTP resent successfully');

    return {
      success: true,
      data: {
        message: 'New verification code sent to admin email',
        otpExpiresAt: otpExpiry.toISOString()
      }
    };

  } catch (error) {
    console.error('❌ Resend OTP error:', error);
    return {
      success: false,
      error: {
        code: 'RESEND_ERROR',
        message: 'Failed to resend verification code'
      }
    };
  }
};

// =============================================
// 🔐 LEGACY SINGLE-STEP LOGIN (FOR COMPATIBILITY)
// =============================================

/**
 * Legacy single-step login (now redirects to 2FA flow)
 * @param {string} username - Admin username
 * @param {string} password - Admin password
 * @returns {Object} Authentication result indicating 2FA required
 */
export const signInAdmin = async (username, password) => {
  console.log('🔄 Legacy signInAdmin called, redirecting to 2FA flow...');
  
  // For backward compatibility, start 2FA flow
  const step1Result = await verifyCredentialsAndSendOTP(username, password);
  
  if (step1Result.success) {
    // Return result indicating OTP is required
    return {
      success: false, // Set to false to indicate additional step needed
      requiresOTP: true,
      data: step1Result.data,
      error: {
        code: 'OTP_REQUIRED',
        message: 'Please enter the verification code sent to your email'
      }
    };
  }
  
  return step1Result;
};

// =============================================
// EXISTING FUNCTIONS (UNCHANGED)
// =============================================

/**
 * Sign out admin user and clear session
 * @returns {Object} Sign out result
 */
export const signOutAdmin = async () => {
  try {
    // Get current session
    const session = getCurrentSession();
    
    if (session && session.user) {
      console.log(`👋 Admin logout: ${session.user.username}`);
    }

    // ANALYTICS TRACKING - Track Session End (Backup)
    try {
      const analyticsSession = JSON.parse(localStorage.getItem('admin_analytics_session') || '{}');
      if (analyticsSession.sessionId && analyticsSession.startTime) {
        const endTime = new Date();
        const startTime = new Date(analyticsSession.startTime);
        const sectionsVisited = analyticsSession.sectionsVisited || ['dashboard'];
        const actionsPerformed = analyticsSession.actionsPerformed || 1;

        // Import analyticsService at the top of this file if not already imported
        const { trackAdminSession } = await import('./analyticsService');
        
        await trackAdminSession(
          startTime,
          endTime,
          sectionsVisited,
          actionsPerformed
        );

        console.log('📊 Analytics session tracked during signOut');
      }
    } catch (analyticsError) {
      console.warn('⚠️ Analytics tracking during signOut failed:', analyticsError);
    }

    // Clear localStorage (including analytics session)
    localStorage.removeItem(AUTH_CONFIG.sessionKey);
    localStorage.removeItem('admin_analytics_session');
    
    // Clear auth header
    clearAuthHeader();

    // Clear any cached data
    clearAuthCache();

    console.log('✅ Logout successful');

    return {
      success: true,
      data: {
        message: 'Logged out successfully'
      }
    };

  } catch (error) {
    console.error('❌ Admin sign out error:', error);
    
    // Force clear session even if error occurs
    localStorage.removeItem(AUTH_CONFIG.sessionKey);
    clearAuthHeader();
    
    return {
      success: true, // Return success even on error to ensure logout
      data: {
        message: 'Logged out successfully'
      }
    };
  }
};

/**
 * Get current admin user session
 * @returns {Object|null} Current admin session or null
 */
export const getCurrentAdmin = () => {
  try {
    const session = getCurrentSession();
    
    if (!session) {
      return null;
    }

    // Check if session is expired
    if (isSessionExpired(session)) {
      console.warn('⚠️ Session expired, clearing local storage');
      signOutAdmin();
      return null;
    }

    // Check if session needs refresh
    if (shouldRefreshSession(session)) {
      console.log('🔄 Session needs refresh');
      // Auto-refresh could be implemented here
    }

    return {
      user: session.user,
      token: session.token,
      expiresAt: session.expiresAt,
      isAuthenticated: true,
      twoFactorVerified: session.twoFactorVerified || false
    };

  } catch (error) {
    console.error('❌ Get current admin error:', error);
    return null;
  }
};

/**
 * Verify admin session validity
 * @returns {Object} Session verification result
 */
export const verifyAdminSession = async () => {
  try {
    const session = getCurrentSession();
    
    if (!session) {
      return {
        success: false,
        error: {
          code: 'NO_SESSION',
          message: 'No active session found',
          details: 'User is not logged in'
        }
      };
    }

    // Check if session is expired
    if (isSessionExpired(session)) {
      signOutAdmin();
      return {
        success: false,
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Session has expired',
          details: 'Please log in again'
        }
      };
    }

    // Verify token integrity
    if (!verifySessionToken(session.token, session.user)) {
      signOutAdmin();
      return {
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid session token',
          details: 'Session has been tampered with'
        }
      };
    }

    // Verify user still exists and is active
    const { data: adminUser, error: fetchError } = await supabase
      .from('admin_users')
      .select('id, username, is_active')
      .eq('id', session.user.id)
      .eq('is_active', true)
      .single();

    if (fetchError || !adminUser) {
      signOutAdmin();
      return {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Admin user no longer exists or is inactive',
          details: 'Account may have been deactivated'
        }
      };
    }

    // Set auth header if not already set
    setAuthHeader(session.token);

    return {
      success: true,
      data: {
        user: session.user,
        isValid: true,
        expiresAt: session.expiresAt,
        twoFactorVerified: session.twoFactorVerified || false,
        message: 'Session is valid'
      }
    };

  } catch (error) {
    console.error('❌ Verify admin session error:', error);
    return {
      success: false,
      error: {
        code: 'VERIFICATION_ERROR',
        message: 'Session verification failed',
        details: error.message
      }
    };
  }
};

// =============================================
// PASSWORD HASHING UTILITIES
// =============================================

/**
 * Hash password with bcrypt (always uses $2b$ format for consistency)
 * @param {string} password - Plain text password
 * @returns {string} Hashed password
 */
export const hashPassword = async (password) => {
  try {
    const salt = await bcrypt.genSalt(AUTH_CONFIG.saltRounds);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Ensure we always use $2b$ format for new hashes
    if (hashedPassword.startsWith('$2a$')) {
      return hashedPassword.replace('$2a$', '$2b$');
    }
    
    return hashedPassword;
  } catch (error) {
    console.error('❌ Password hashing error:', error);
    throw new Error('Failed to hash password');
  }
};

/**
 * Verify password against hash (with compatibility for $2a$ and $2b$)
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {boolean} Password match result
 */
export const verifyPassword = async (password, hash) => {
  return await verifyPasswordCompatible(password, hash);
};

// =============================================
// SESSION MANAGEMENT UTILITIES
// =============================================

/**
 * Generate session token
 * @param {Object} user - Admin user object
 * @returns {string} Generated session token
 */
const generateSessionToken = (user) => {
  const payload = {
    userId: user.id,
    username: user.username,
    role: 'admin',
    timestamp: Date.now()
  };
  
  // Simple token generation (in production, use proper JWT)
  const tokenData = btoa(JSON.stringify(payload));
  const signature = btoa(`${tokenData}.${process.env.REACT_APP_JWT_SECRET || 'default-secret'}`);
  
  return `${tokenData}.${signature}`;
};

/**
 * Verify session token integrity
 * @param {string} token - Session token
 * @param {Object} user - User object
 * @returns {boolean} Token validity
 */
const verifySessionToken = (token, user) => {
  try {
    const [tokenData, signature] = token.split('.');
    const expectedSignature = btoa(`${tokenData}.${process.env.REACT_APP_JWT_SECRET || 'default-secret'}`);
    
    if (signature !== expectedSignature) {
      return false;
    }
    
    const payload = JSON.parse(atob(tokenData));
    return payload.userId === user.id && payload.username === user.username;
  } catch (error) {
    return false;
  }
};

/**
 * Get current session from localStorage
 * @returns {Object|null} Session data or null
 */
const getCurrentSession = () => {
  try {
    const sessionData = localStorage.getItem(AUTH_CONFIG.sessionKey);
    return sessionData ? JSON.parse(sessionData) : null;
  } catch (error) {
    console.error('❌ Failed to parse session data:', error);
    localStorage.removeItem(AUTH_CONFIG.sessionKey);
    return null;
  }
};

/**
 * Check if session is expired
 * @param {Object} session - Session object
 * @returns {boolean} Expiry status
 */
const isSessionExpired = (session) => {
  if (!session || !session.expiresAt) {
    return true;
  }
  
  return new Date(session.expiresAt) <= new Date();
};

/**
 * Check if session should be refreshed
 * @param {Object} session - Session object
 * @returns {boolean} Refresh needed status
 */
const shouldRefreshSession = (session) => {
  if (!session || !session.expiresAt) {
    return false;
  }
  
  const expiryTime = new Date(session.expiresAt).getTime();
  const currentTime = Date.now();
  const timeUntilExpiry = expiryTime - currentTime;
  
  return timeUntilExpiry <= AUTH_CONFIG.refreshThreshold;
};

/**
 * Set authorization header for API requests
 * @param {string} token - Session token
 */
const setAuthHeader = (token) => {
  // This would be used with your HTTP client
  // For Supabase, we'll handle this differently
  if (typeof window !== 'undefined') {
    window.supabaseAuthToken = token;
  }
};

/**
 * Clear authorization header
 */
const clearAuthHeader = () => {
  if (typeof window !== 'undefined' && window.supabaseAuthToken) {
    delete window.supabaseAuthToken;
  }
};

/**
 * Clear authentication cache
 */
const clearAuthCache = () => {
  // Clear any cached admin data
  if (typeof window !== 'undefined' && window.adminCache) {
    window.adminCache = {};
  }
};

// =============================================
// ROLE-BASED ACCESS CONTROL
// =============================================

/**
 * Check if current user has admin role
 * @returns {boolean} Admin role status
 */
export const isAdmin = () => {
  const currentAdmin = getCurrentAdmin();
  return currentAdmin && currentAdmin.user && currentAdmin.user.role === 'admin';
};

/**
 * Check if current user is authenticated
 * @returns {boolean} Authentication status
 */
export const isAuthenticated = () => {
  const currentAdmin = getCurrentAdmin();
  return currentAdmin && currentAdmin.isAuthenticated;
};

/**
 * Require admin authentication (for protected operations)
 * @returns {Object} Access verification result
 */
export const requireAdminAuth = async () => {
  const sessionVerification = await verifyAdminSession();
  
  if (!sessionVerification.success) {
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Admin authentication required',
        details: 'This operation requires admin privileges'
      }
    };
  }

  return {
    success: true,
    data: sessionVerification.data
  };
};

// =============================================
// INITIALIZATION AND UTILITIES
// =============================================

/**
 * Initialize authentication system
 */
export const initializeAuth = () => {
  // Check for existing session on app load
  const session = getCurrentSession();
  
  if (session && !isSessionExpired(session)) {
    setAuthHeader(session.token);
    console.log('🔄 Existing admin session restored');
  } else if (session && isSessionExpired(session)) {
    console.log('🗑️ Expired session cleared');
    signOutAdmin();
  }
};

/**
 * Get authentication configuration
 */
export const getAuthConfig = () => {
  return {
    sessionDuration: AUTH_CONFIG.tokenExpiry,
    refreshThreshold: AUTH_CONFIG.refreshThreshold,
    isSecure: process.env.NODE_ENV === 'production'
  };
};

// Auto-initialize when module loads
if (typeof window !== 'undefined') {
    initializeAuth();
  }