// src/components/admin/AdminLogin/MfaCodeStep.js
//
// Step 3 of the login: the authenticator-app code. Rendered by the protected
// dashboard route whenever a session exists, a verified authenticator is
// enrolled, and the session has not yet passed it. Nothing from the
// dashboard is rendered behind this screen. Uses the 2025 login design.

import React, { useEffect, useRef, useState } from 'react';
import { useAuthContext } from '../../../contexts/AuthContext';
import {
  ONE_TIME_CODE_LENGTH,
  isValidOneTimeCode,
  listTotpFactors,
  sanitizeCodeInput,
  verifyTotpChallenge
} from '../../../services/authService';
import LoadingSpinner from '../../common/LoadingSpinner';
import './AdminLogin.css';

const MfaCodeStep = () => {
  const { refreshAssurance, signOut } = useAuthContext();
  const [factors, setFactors] = useState([]);
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoadingFactors, setIsLoadingFactors] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const listed = await listTotpFactors();
      if (cancelled) return;
      if (!listed.success) {
        setError(listed.error.message);
      } else {
        setFactors(listed.data.verified);
        setFactorId(listed.data.verified[0]?.id || '');
      }
      setIsLoadingFactors(false);
      inputRef.current?.focus();
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!isValidOneTimeCode(code)) {
      setError(`Enter the ${ONE_TIME_CODE_LENGTH}-digit code from your authenticator app.`);
      return;
    }
    setIsVerifying(true);
    try {
      const result = await verifyTotpChallenge(factorId, code);
      if (!result.success) {
        setError(result.error.message);
        setCode('');
        inputRef.current?.focus();
        return;
      }
      // The session is now at level 2; the route re-reads the state and
      // continues to the dashboard.
      await refreshAssurance();
    } finally {
      setIsVerifying(false);
    }
  };

  const busy = isVerifying || isLoadingFactors;

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
            <p className="login-subtitle">Step 2 of 2 · Authenticator App</p>
            <div className="security-indicator">
              <span className="security-icon" aria-hidden="true">📱</span>
              <span className="security-text">2FA Verification Required</span>
            </div>
          </div>

          {error && (
            <div className="login-error animate-fade-in" role="alert">
              <div className="error-icon" aria-hidden="true">⚠️</div>
              <div className="error-content">
                <strong>Authentication Failed</strong>
                <p>{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="otp-form">
            <div className="otp-info">
              <p className="otp-message">
                📱 Open your authenticator app and enter the code for <strong>RC Portfolio Admin</strong>
              </p>
              <p className="otp-expiry">🔄 The code changes every 30 seconds</p>
            </div>

            {factors.length > 1 && (
              <div className="form-group">
                <label htmlFor="admin-factor" className="form-label">Device</label>
                <div className="input-wrapper">
                  <select
                    id="admin-factor"
                    className="form-input"
                    value={factorId}
                    onChange={(event) => setFactorId(event.target.value)}
                    disabled={busy}
                  >
                    {factors.map((factor) => (
                      <option key={factor.id} value={factor.id}>{factor.friendly_name || 'Authenticator'}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="admin-totp-code" className="form-label">Authenticator Code</label>
              <div className="input-wrapper">
                <input
                  ref={inputRef}
                  id="admin-totp-code"
                  name="totp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  maxLength={ONE_TIME_CODE_LENGTH}
                  className="form-input otp-input"
                  placeholder={`Enter ${ONE_TIME_CODE_LENGTH}-digit code`}
                  value={code}
                  onChange={(event) => { setCode(sanitizeCodeInput(event.target.value)); setError(''); }}
                  disabled={busy}
                />
                <div className="input-icon" aria-hidden="true"><span>📱</span></div>
              </div>
            </div>

            <div className="otp-actions">
              <button type="button" onClick={() => signOut()} className="back-button" disabled={isVerifying}>
                ← Sign out
              </button>
            </div>

            <button
              type="submit"
              disabled={busy || !factorId || !isValidOneTimeCode(code)}
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
                  <span>Verify &amp; Access Dashboard</span>
                </>
              )}
            </button>
          </form>

          <div className="login-footer">
            <p className="security-note">🔒 Two-factor authentication active</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MfaCodeStep;
