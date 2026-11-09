// src/components/admin/AdminLogin/AdminLogin.js
//
// Admin login, steps 1 and 2 of the two-step flow, in the 2025 design:
//   email  -> the owner types the admin address and a six-digit code is emailed
//   code   -> the code is exchanged for a session (assurance level 1)
// Step 3, the authenticator code, is shown by the protected dashboard route
// once a session exists (MfaCodeStep), so this page never has to know
// whether an authenticator is enrolled.
//
// Security notes: the page never reveals whether an address is the admin's
// (the same message follows every request), codes are digits only and
// single use, the resend button honours a cooldown, and every message shown
// is a fixed sentence (nothing from the URL or the server is echoed).

import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../../contexts/AuthContext';
import {
  LOGIN_LINK_SENT_MESSAGE,
  ONE_TIME_CODE_LENGTH,
  RESEND_COOLDOWN_SECONDS,
  isValidOneTimeCode,
  maskEmail,
  sanitizeCodeInput,
  verifyEmailCode
} from '../../../services/authService';
import LoadingSpinner from '../../common/LoadingSpinner';
import './AdminLogin.css';

const STEP = Object.freeze({ EMAIL: 'email', CODE: 'code' });

const AdminLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearError, isAuthenticated, isSigningIn, sessionChecked, signIn } = useAuthContext();

  const [step, setStep] = useState(STEP.EMAIL);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [formError, setFormError] = useState(location.state?.authError || '');
  const [notice, setNotice] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeInputRef = useRef(null);

  // A visitor who already holds a session goes straight on; the protected
  // route decides whether the authenticator step is still due.
  useEffect(() => {
    if (sessionChecked && isAuthenticated) {
      navigate('/admindashboard', { replace: true });
    }
  }, [isAuthenticated, sessionChecked, navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setTimeout(() => setResendCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (step === STEP.CODE) codeInputRef.current?.focus();
  }, [step]);

  const resetMessages = () => {
    setFormError('');
    setNotice('');
    clearError();
  };

  const requestCode = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setFormError('Enter your admin email address.');
      return false;
    }
    const result = await signIn(trimmedEmail);
    if (!result.success) {
      setFormError(result.error?.message || 'The code could not be sent. Try again.');
      return false;
    }
    setNotice(result.data?.message || LOGIN_LINK_SENT_MESSAGE);
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    return true;
  };

  const handleEmailSubmit = async (event) => {
    event.preventDefault();
    resetMessages();
    if (await requestCode()) {
      setCode('');
      setStep(STEP.CODE);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || isSigningIn) return;
    resetMessages();
    setCode('');
    await requestCode();
  };

  const handleCodeSubmit = async (event) => {
    event.preventDefault();
    resetMessages();
    if (!isValidOneTimeCode(code)) {
      setFormError(`Enter the ${ONE_TIME_CODE_LENGTH}-digit code from the email.`);
      return;
    }
    setIsVerifying(true);
    try {
      const result = await verifyEmailCode(email, code);
      if (!result.success) {
        setFormError(result.error?.message || 'That code could not be verified.');
        setCode('');
        codeInputRef.current?.focus();
        return;
      }
      // The session is now stored; the auth state listener picks it up and
      // the effect above moves on to the dashboard route.
      setNotice('Code accepted. Opening the admin area...');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleBackToEmail = () => {
    resetMessages();
    setCode('');
    setStep(STEP.EMAIL);
  };

  const busy = isSigningIn || isVerifying;
  const onCodeStep = step === STEP.CODE;

  return (
    <div className="admin-login-page">
      <div className="login-background-effects">
        <div className="floating-orb orb-1" />
        <div className="floating-orb orb-2" />
        <div className="floating-orb orb-3" />
        <div className="login-grid-overlay" />
      </div>

      <div className="login-container">
        <div className="login-card glass-card">
          <div className="login-header">
            <div className="login-logo">
              <img src="/logo.png" alt="RC Portfolio" className="header-logo" />
              <h1 className="login-title">
                <span className="title-text">RC Portfolio</span>
                <span className="title-admin">Admin</span>
              </h1>
            </div>
            <p className="login-subtitle">
              {onCodeStep ? 'Step 1 of 2 · Email Verification' : 'Secure Content Management System'}
            </p>
            <div className="security-indicator">
              <span className="security-icon" aria-hidden="true">{onCodeStep ? '📧' : '🔐'}</span>
              <span className="security-text">
                {onCodeStep ? 'Code Sent To Your Inbox' : 'Encrypted Access Enabled'}
              </span>
            </div>
          </div>

          {formError && (
            <div className="login-error animate-fade-in" role="alert">
              <div className="error-icon" aria-hidden="true">⚠️</div>
              <div className="error-content">
                <strong>Authentication Failed</strong>
                <p>{formError}</p>
              </div>
            </div>
          )}

          {notice && !formError && (
            <div className="login-success animate-fade-in" role="status">
              <div className="success-icon" aria-hidden="true">✅</div>
              <div className="success-content">
                <p>{notice}</p>
              </div>
            </div>
          )}

          {!onCodeStep && (
            <form onSubmit={handleEmailSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="admin-email" className="form-label">Admin Email</label>
                <div className="input-wrapper">
                  <input
                    id="admin-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    className="form-input"
                    placeholder="Enter your admin email"
                    value={email}
                    onChange={(event) => { setEmail(event.target.value); setFormError(''); }}
                    disabled={busy}
                    required
                  />
                  <div className="input-icon" aria-hidden="true"><span>📧</span></div>
                </div>
              </div>

              <button type="submit" disabled={busy} className={`login-button neon-button ${busy ? 'signing-in' : ''}`}>
                {busy ? (
                  <>
                    <LoadingSpinner size="small" />
                    <span>Sending code...</span>
                  </>
                ) : (
                  <>
                    <span className="button-icon" aria-hidden="true">🚀</span>
                    <span>Send Verification Code</span>
                  </>
                )}
              </button>
            </form>
          )}

          {onCodeStep && (
            <form onSubmit={handleCodeSubmit} className="otp-form">
              <div className="otp-info">
                <p className="otp-message">
                  📧 A {ONE_TIME_CODE_LENGTH}-digit code has been sent to <strong>{maskEmail(email)}</strong>
                </p>
                <p className="otp-expiry">⏰ Code expires in 10 minutes</p>
              </div>

              <div className="form-group">
                <label htmlFor="admin-email-code" className="form-label">Verification Code</label>
                <div className="input-wrapper">
                  <input
                    ref={codeInputRef}
                    id="admin-email-code"
                    name="code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    maxLength={ONE_TIME_CODE_LENGTH}
                    className="form-input otp-input"
                    placeholder={`Enter ${ONE_TIME_CODE_LENGTH}-digit code`}
                    value={code}
                    onChange={(event) => { setCode(sanitizeCodeInput(event.target.value)); setFormError(''); }}
                    disabled={busy}
                  />
                  <div className="input-icon" aria-hidden="true"><span>🔐</span></div>
                </div>
              </div>

              <div className="otp-actions">
                <button type="button" onClick={handleResend} disabled={resendCooldown > 0 || busy} className="resend-button">
                  {isSigningIn ? (
                    <>
                      <LoadingSpinner size="small" />
                      <span>Sending...</span>
                    </>
                  ) : resendCooldown > 0 ? (
                    <span>📧 Resend in {resendCooldown}s</span>
                  ) : (
                    <span>📧 Resend Code</span>
                  )}
                </button>
                <button type="button" onClick={handleBackToEmail} className="back-button" disabled={busy}>
                  ← Use a different email
                </button>
              </div>

              <button
                type="submit"
                disabled={busy || !isValidOneTimeCode(code)}
                className={`login-button neon-button ${busy ? 'signing-in' : ''}`}
              >
                {isVerifying ? (
                  <>
                    <LoadingSpinner size="small" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span className="button-icon" aria-hidden="true">🔐</span>
                    <span>Verify Email Code</span>
                  </>
                )}
              </button>
            </form>
          )}

          <div className="login-footer">
            <p className="security-note">
              🔒 {onCodeStep ? 'Two-factor authentication active' : 'Secure admin access with 2FA'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
