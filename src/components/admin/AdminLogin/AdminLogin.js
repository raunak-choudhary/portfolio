// src/components/admin/AdminLogin/AdminLogin.js - 2FA SUPPORT (NO FORGOT PASSWORD)

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../../contexts/AuthContext';
import LoadingSpinner from '../../common/LoadingSpinner';
import routeNavigation from '../../../utils/routeNavigation';
import './AdminLogin.css';
import analyticsService from '../../../services/analyticsService';
// 🔐 NEW: Import 2FA functions
import { 
  verifyCredentialsAndSendOTP, 
  verifyOTPAndLogin, 
  resendOTP 
} from '../../../services/authService';

const AdminLogin = () => {
  const navigate = useNavigate();
  const { 
    error, 
    clearError, 
    isAuthenticated, 
    sessionChecked 
  } = useAuthContext();

  // 🔐 NEW: Authentication step state
  const [authStep, setAuthStep] = useState('credentials'); // 'credentials' or 'otp'
  const [tempUsername, setTempUsername] = useState(''); // Store username for OTP step

  // Form state for credentials
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    rememberMe: false
  });

  // 🔐 NEW: OTP form state
  const [otpData, setOtpData] = useState({
    code: '',
    otpExpiry: null,
    canResend: true,
    resendCooldown: 0
  });

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [attemptCount, setAttemptCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // 🔐 NEW: OTP UI state
  const [isResendingOTP, setIsResendingOTP] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpSuccess, setOtpSuccess] = useState('');

  // Navigation state for encrypted routes
  const [navigationReady, setNavigationReady] = useState(false);

  // Initialize encrypted routes on component mount
  useEffect(() => {
    const setupEncryptedRoutes = async () => {
      try {
        setNavigationReady(true);
      } catch (error) {
        console.error('Failed to setup encrypted routes:', error);
        setNavigationReady(true);
      }
    };

    setupEncryptedRoutes();
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (sessionChecked && isAuthenticated && navigationReady) {
      const navResult = routeNavigation.safeAdminNavigate(navigate, '/admindashboard', { replace: true });
      
      if (!navResult.success) {
        navigate('/admindashboard', { replace: true });
      }
    }
  }, [isAuthenticated, sessionChecked, navigationReady, navigate]);

  // Clear errors when user starts typing
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        clearError();
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  // 🔐 NEW: OTP resend cooldown timer
  useEffect(() => {
    let timer;
    if (otpData.resendCooldown > 0) {
      timer = setInterval(() => {
        setOtpData(prev => ({
          ...prev,
          resendCooldown: Math.max(0, prev.resendCooldown - 1),
          canResend: prev.resendCooldown <= 1
        }));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [otpData.resendCooldown]);

  // Handle input changes for credentials form
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    // Clear field-specific errors
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }

    // Clear general error when user starts typing
    if (error) {
      clearError();
    }
  };

  // 🔐 NEW: Handle OTP input changes
  const handleOtpChange = (e) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 6);
    setOtpData(prev => ({
      ...prev,
      code: value
    }));

    // Clear OTP errors when user types
    if (otpError) {
      setOtpError('');
    }
  };

  // Validate credentials form
  const validateCredentialsForm = () => {
    const errors = {};

    if (!formData.username.trim()) {
      errors.username = 'Username is required';
    } else if (formData.username.trim().length < 2) {
      errors.username = 'Username must be at least 2 characters';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 3) {
      errors.password = 'Password must be at least 3 characters';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // 🔐 NEW: Step 1 - Handle credentials submission
  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();

    if (!validateCredentialsForm()) {
      return;
    }

    setIsProcessing(true);
    setAttemptCount(prev => prev + 1);

    try {
      console.log('🔐 Step 1: Submitting credentials...');
      
      const result = await verifyCredentialsAndSendOTP(
        formData.username.trim(), 
        formData.password
      );

      if (result.success) {
        console.log('✅ Credentials verified, OTP sent');
        
        // Move to OTP step
        setAuthStep('otp');
        setTempUsername(formData.username.trim());
        setOtpData(prev => ({
          ...prev,
          otpExpiry: result.data.otpExpiresAt,
          canResend: false,
          resendCooldown: 120 // 2 minutes cooldown
        }));
        setOtpSuccess('Verification code sent to admin email!');
        
        // Clear credentials form for security
        setFormData(prev => ({ ...prev, password: '' }));
        
      } else {
        console.error('❌ Step 1 failed:', result.error);
        // Error will be handled by AuthContext
      }
    } catch (err) {
      console.error('❌ Credentials submission error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // 🔐 NEW: Step 2 - Handle OTP submission
  const handleOtpSubmit = async (e) => {
    e.preventDefault();

    if (!otpData.code || otpData.code.length !== 6) {
      setOtpError('Please enter the 6-digit verification code');
      return;
    }

    setIsProcessing(true);
    setOtpError('');

    try {
      console.log('🔐 Step 2: Submitting OTP...');
      
      const result = await verifyOTPAndLogin(tempUsername, otpData.code);

      if (result.success) {
        console.log('✅ OTP verified, login successful');
        
        // Initialize encrypted admin session
        const sessionResult = routeNavigation.initializeAdminSession();
        
        if (sessionResult.success) {
          routeNavigation.storeNavigationHistory('/adminlogin', 'successful_2fa_login');
          
          // Start analytics session
          try {
            const analyticsSession = analyticsService.startAdminSession();
            localStorage.setItem('admin_analytics_session', JSON.stringify({
              sessionId: analyticsSession.sessionId,
              startTime: analyticsSession.startTime.toISOString(),
              sectionsVisited: ['dashboard'],
              actionsPerformed: 1,
              twoFactorUsed: true
            }));
          } catch (analyticsError) {
            console.warn('Analytics tracking failed:', analyticsError);
          }
          
          // Navigate to dashboard
          const navResult = routeNavigation.safeAdminNavigate(navigate, '/admindashboard', { replace: true });
          
          if (!navResult.success) {
            navigate('/admindashboard', { replace: true });
          }
        } else {
          navigate('/admindashboard', { replace: true });
        }
      } else {
        console.error('❌ OTP verification failed:', result.error);
        setOtpError(result.error.message || 'Invalid verification code');
        
        if (result.error.code === 'OTP_EXPIRED' || result.error.code === 'MAX_OTP_ATTEMPTS') {
          // Go back to credentials step
          setAuthStep('credentials');
          setTempUsername('');
          setOtpData({
            code: '',
            otpExpiry: null,
            canResend: true,
            resendCooldown: 0
          });
        }
      }
    } catch (err) {
      console.error('❌ OTP submission error:', err);
      setOtpError('Verification failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 🔐 NEW: Handle OTP resend
  const handleResendOTP = async () => {
    if (!otpData.canResend || isResendingOTP) {
      return;
    }

    setIsResendingOTP(true);
    setOtpError('');
    setOtpSuccess('');

    try {
      console.log('🔄 Resending OTP...');
      
      const result = await resendOTP(tempUsername);

      if (result.success) {
        console.log('✅ OTP resent successfully');
        setOtpSuccess('New verification code sent to admin email!');
        setOtpData(prev => ({
          ...prev,
          code: '',
          otpExpiry: result.data.otpExpiresAt,
          canResend: false,
          resendCooldown: 120 // 2 minutes cooldown
        }));
      } else {
        console.error('❌ OTP resend failed:', result.error);
        setOtpError(result.error.message || 'Failed to resend verification code');
      }
    } catch (err) {
      console.error('❌ OTP resend error:', err);
      setOtpError('Failed to resend verification code. Please try again.');
    } finally {
      setIsResendingOTP(false);
    }
  };

  // 🔐 NEW: Go back to credentials step
  const handleBackToCredentials = () => {
    setAuthStep('credentials');
    setTempUsername('');
    setOtpData({
      code: '',
      otpExpiry: null,
      canResend: true,
      resendCooldown: 0
    });
    setOtpError('');
    setOtpSuccess('');
    clearError();
  };

  // Handle password visibility toggle
  const togglePasswordVisibility = () => {
    setShowPassword(prev => !prev);
  };

  // Don't render if already authenticated
  if (sessionChecked && isAuthenticated) {
    return null;
  }

  // Show loading if navigation not ready
  if (!navigationReady) {
    return (
      <div className="admin-login-page">
        <div className="login-container">
          <div className="login-card glass-card">
            <div className="login-header">
              <h1 className="login-title">
                <span className="title-text">RC Portfolio</span>
                <span className="title-admin">Admin</span>
              </h1>
              <p className="login-subtitle">Setting up secure access...</p>
            </div>
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <LoadingSpinner />
              <p>Initializing...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-login-page">
      {/* Animated Background Effects */}
      <div className="login-background-effects">
        <div className="floating-orb orb-1"></div>
        <div className="floating-orb orb-2"></div>
        <div className="floating-orb orb-3"></div>
        <div className="login-grid-overlay"></div>
      </div>

      <div className="login-container">
        <div className="login-card glass-card">
          {/* Header */}
          <div className="login-header">
            <div className="login-logo">
              <img src="/logo.png" alt="RC Portfolio" className="header-logo" />
              <h1 className="login-title">
                <span className="title-text">RC Portfolio</span>
                <span className="title-admin">Admin</span>
              </h1>
            </div>
            <p className="login-subtitle">
              {authStep === 'credentials' ? 'Secure Content Management System' : 'Two-Factor Authentication'}
            </p>
            
            {/* Security indicator */}
            <div className="security-indicator">
              <span className="security-icon">🔐</span>
              <span className="security-text">
                {authStep === 'credentials' ? 'Encrypted Access Enabled' : '2FA Verification Required'}
              </span>
            </div>
          </div>

          {/* Error Display */}
          {(error || otpError) && (
            <div className="login-error animate-fade-in">
              <div className="error-icon">⚠️</div>
              <div className="error-content">
                <strong>Authentication Failed</strong>
                <p>{error?.message || otpError || 'Please try again.'}</p>
                {authStep === 'credentials' && attemptCount >= 3 && (
                  <p className="error-hint">
                    💡 Hint: Check if Caps Lock is on
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Success Display for OTP */}
          {otpSuccess && (
            <div className="login-success animate-fade-in">
              <div className="success-icon">✅</div>
              <div className="success-content">
                <p>{otpSuccess}</p>
              </div>
            </div>
          )}

          {/* Step 1: Credentials Form */}
          {authStep === 'credentials' && (
            <form onSubmit={handleCredentialsSubmit} className="login-form">
              {/* Username Field */}
              <div className="form-group">
                <label htmlFor="username" className="form-label">
                  Username
                </label>
                <div className="input-wrapper">
                  <input
                    type="text"
                    id="username"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    className={`form-input ${formErrors.username ? 'error' : ''}`}
                    placeholder="Enter your admin username"
                    autoComplete="username"
                    disabled={isProcessing}
                  />
                  <div className="input-icon">
                    <span>👤</span>
                  </div>
                </div>
                {formErrors.username && (
                  <span className="field-error">{formErrors.username}</span>
                )}
              </div>

              {/* Password Field */}
              <div className="form-group">
                <label htmlFor="password" className="form-label">
                  Password
                </label>
                <div className="input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className={`form-input ${formErrors.password ? 'error' : ''}`}
                    placeholder="Enter your admin password"
                    autoComplete="current-password"
                    disabled={isProcessing}
                  />
                  <button
                    type="button"
                    className="input-icon password-toggle"
                    onClick={togglePasswordVisibility}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <span>{showPassword ? '🙈' : '👁️'}</span>
                  </button>
                </div>
                {formErrors.password && (
                  <span className="field-error">{formErrors.password}</span>
                )}
              </div>

              {/* Remember Me (No Forgot Password) */}
              <div className="form-options">
                <label className="checkbox-wrapper">
                  <input
                    type="checkbox"
                    name="rememberMe"
                    checked={formData.rememberMe}
                    onChange={handleInputChange}
                    className="checkbox-input"
                    disabled={isProcessing}
                  />
                  <span className="checkbox-custom"></span>
                  <span className="checkbox-label">Keep me signed in</span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isProcessing}
                className={`login-button neon-button ${isProcessing ? 'signing-in' : ''}`}
              >
                {isProcessing ? (
                  <>
                    <LoadingSpinner size="small" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span className="button-icon">🚀</span>
                    <span>Continue with 2FA</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* 🔐 NEW: Step 2: OTP Verification Form */}
          {authStep === 'otp' && (
            <form onSubmit={handleOtpSubmit} className="otp-form">
              <div className="otp-info">
                <p className="otp-message">
                  📧 A 6-digit verification code has been sent to <strong>raunakchoudhary17@gmail.com</strong>
                </p>
                <p className="otp-expiry">
                  ⏰ Code expires in 10 minutes
                </p>
              </div>

              {/* OTP Input Field */}
              <div className="form-group">
                <label htmlFor="otpCode" className="form-label">
                  Verification Code
                </label>
                <div className="input-wrapper">
                  <input
                    type="text"
                    id="otpCode"
                    value={otpData.code}
                    onChange={handleOtpChange}
                    className="form-input otp-input"
                    placeholder="Enter 6-digit code"
                    maxLength="6"
                    disabled={isProcessing}
                    autoComplete="one-time-code"
                  />
                  <div className="input-icon">
                    <span>🔐</span>
                  </div>
                </div>
              </div>

              {/* OTP Actions */}
              <div className="otp-actions">
                <button
                  type="button"
                  onClick={handleResendOTP}
                  disabled={!otpData.canResend || isResendingOTP}
                  className="resend-button"
                >
                  {isResendingOTP ? (
                    <>
                      <LoadingSpinner size="small" />
                      <span>Sending...</span>
                    </>
                  ) : otpData.canResend ? (
                    <span>📧 Resend Code</span>
                  ) : (
                    <span>📧 Resend in {otpData.resendCooldown}s</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleBackToCredentials}
                  className="back-button"
                >
                  ← Back to Login
                </button>
              </div>

              {/* OTP Submit Button */}
              <button
                type="submit"
                disabled={isProcessing || otpData.code.length !== 6}
                className={`login-button neon-button ${isProcessing ? 'signing-in' : ''}`}
              >
                {isProcessing ? (
                  <>
                    <LoadingSpinner size="small" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span className="button-icon">🔐</span>
                    <span>Verify & Access Dashboard</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer */}
          <div className="login-footer">
            <p className="security-note">
              🔒 {authStep === 'credentials' ? 'Secure admin access with 2FA' : 'Two-factor authentication active'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;