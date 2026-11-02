// src/components/admin/AdminLogin/AdminLogin.js - secure Supabase OTP login

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../../contexts/AuthContext';
import LoadingSpinner from '../../common/LoadingSpinner';
import './AdminLogin.css';

const AdminLogin = () => {
  const navigate = useNavigate();
  const {
    clearError,
    error,
    isAuthenticated,
    isSigningIn,
    sessionChecked,
    signIn
  } = useAuthContext();

  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (sessionChecked && isAuthenticated) {
      navigate('/admindashboard', { replace: true });
    }
  }, [isAuthenticated, sessionChecked, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    setSuccessMessage('');
    clearError();

    const trimmedEmail = email.trim();

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setFormError('Enter your admin email address.');
      return;
    }

    const result = await signIn(trimmedEmail);

    if (result.success) {
      setSuccessMessage('Secure admin login link sent. Check your email, then return here.');
      setEmail('');
    } else {
      setFormError(result.error?.message || 'Admin login failed.');
    }
  };

  return (
    <div className="admin-login-page">
      <div className="login-background-effects">
        <div className="floating-orb orb-1" />
        <div className="floating-orb orb-2" />
        <div className="floating-orb orb-3" />
        <div className="login-grid-overlay" />
      </div>

      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="login-logo">
              <img src="/logo.png" alt="RC Portfolio" className="header-logo" />
              <div>
                <h1>Admin Login</h1>
                <p>Secure email OTP access for portfolio management</p>
              </div>
            </div>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="admin-email">Admin email</label>
              <input
                id="admin-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setFormError('');
                  setSuccessMessage('');
                }}
                placeholder="you@example.com"
                disabled={isSigningIn}
              />
            </div>

            {(formError || error?.message) && (
              <div className="error-message" role="alert">
                {formError || error.message}
              </div>
            )}

            {successMessage && (
              <div className="success-message" role="status">
                {successMessage}
              </div>
            )}

            <button type="submit" className="login-button" disabled={isSigningIn}>
              {isSigningIn ? (
                <>
                  <LoadingSpinner size="small" />
                  Sending login link...
                </>
              ) : (
                'Send Secure Login Link'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
