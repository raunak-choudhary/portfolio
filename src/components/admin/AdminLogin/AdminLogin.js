// src/components/admin/AdminLogin/AdminLogin.js
//
// Step 01 of the admin pre-flight: proving who is signing in.
//   google  "Continue with Google" (the default): a redirect through Supabase
//           to Google and back to the dashboard route
//   email   the quiet fallback: the admin address, then a six-digit code
//   code    the code from that email, exchanged for a session
// Either way the session is at assurance level 1; step 02, the authenticator
// code, is shown by the protected dashboard route (MfaCodeStep), so this page
// never has to know whether an authenticator is enrolled.
//
// Security notes: every message is a fixed sentence (nothing from the URL or
// the server is echoed); a Google account that is not the admin's gets one
// sentence and fires the owner's best-effort alert; the error parameters are
// removed from the address bar once read; codes are digits only and single
// use; the resend button honours a cooldown.

import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../../contexts/AuthContext';
import {
  GOOGLE_ATTEMPT_LABEL,
  LOGIN_LINK_SENT_MESSAGE,
  ONE_TIME_CODE_LENGTH,
  RESEND_COOLDOWN_SECONDS,
  clearGoogleReturn,
  isGoogleReturnPending,
  isValidOneTimeCode,
  maskEmail,
  readLoginReturn,
  reportUnknownLoginAttempt,
  signInWithGoogle,
  verifyEmailCode
} from '../../../services/authService';
import ButtonSpinner from '../../common/ButtonSpinner';
import PreflightShell from './PreflightShell';
import { CodeField, ErrorLine, GoogleMark, NoticeLine } from './PreflightControls';

export const MODE = Object.freeze({ GOOGLE: 'google', EMAIL: 'email', CODE: 'code' });

/** Shown when the code was accepted but the admin check could not reach the server. */
export const ENTRY_UNREACHABLE_MESSAGE = 'The code was accepted, but the admin check could not reach the server. Check the connection; it tries again by itself.';
/** Shown when the code was accepted but the admin area did not open. */
export const ENTRY_REFUSED_MESSAGE = 'The code was accepted, but the admin area could not be opened. Try again.';

/**
 * Where to look for a returning redirect's result: the dashboard route hands
 * over the address it was reached with, or the visitor landed here directly.
 */
const returnSource = (location) => location.state?.returnUrl || { search: location.search, hash: location.hash };

const AdminLogin = ({ now }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearError, error: authError, isAuthenticated, isSigningIn, sessionChecked, signIn } = useAuthContext();

  // Read once, on the first render; the effect below acts on it exactly once.
  const [loginReturn] = useState(() => readLoginReturn(returnSource(location), isGoogleReturnPending()));
  const [mode, setMode] = useState(MODE.GOOGLE);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [formError, setFormError] = useState(loginReturn?.message || '');
  const [notice, setNotice] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLeavingForGoogle, setIsLeavingForGoogle] = useState(false);
  const [awaitingEntry, setAwaitingEntry] = useState(false);   // a code was accepted; the admin check is running
  const [resendCooldown, setResendCooldown] = useState(0);
  const emailInputRef = useRef(null);
  const codeInputRef = useRef(null);
  const handledReturn = useRef(false);

  // Act on a returning redirect once: alert the owner about a refused Google
  // account, forget the pending round trip, and clean the address bar so the
  // error neither lingers in the URL nor comes back on reload.
  useEffect(() => {
    if (handledReturn.current) return;
    handledReturn.current = true;
    if (loginReturn?.kind === 'google-not-admin') reportUnknownLoginAttempt(GOOGLE_ATTEMPT_LABEL);
    clearGoogleReturn();
    if (location.state || location.search || location.hash) {
      navigate('/adminlogin', { replace: true, state: null });
    }
  }, [loginReturn, location, navigate]);

  // A visitor who already holds a session goes straight on; the protected
  // route decides whether the authenticator step is still due.
  useEffect(() => {
    if (sessionChecked && isAuthenticated) {
      navigate('/admindashboard', { replace: true });
    }
  }, [isAuthenticated, sessionChecked, navigate]);

  // The code was accepted but the admin check that follows did not pass:
  // say so, instead of "Opening the admin area..." for ever. Fixed
  // sentences only; the check's own text never reaches the page.
  useEffect(() => {
    if (!awaitingEntry || isAuthenticated || !sessionChecked || !authError) return;
    setAwaitingEntry(false);
    setNotice('');
    setFormError(authError.code === 'SESSION_CHECK_UNAVAILABLE' ? ENTRY_UNREACHABLE_MESSAGE : ENTRY_REFUSED_MESSAGE);
  }, [awaitingEntry, authError, isAuthenticated, sessionChecked]);

  // Coming Back from Google's page, the browser may restore this page from
  // its back-forward cache exactly as it was left: "Opening Google..." with
  // every control disabled. A restored page gets its controls back.
  useEffect(() => {
    const onPageShow = (event) => { if (event.persisted) setIsLeavingForGoogle(false); };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setTimeout(() => setResendCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (mode === MODE.EMAIL) emailInputRef.current?.focus();
    if (mode === MODE.CODE) codeInputRef.current?.focus();
  }, [mode]);

  const resetMessages = () => {
    setFormError('');
    setNotice('');
    clearError();
  };

  const switchMode = (next) => {
    resetMessages();
    setCode('');
    setMode(next);
  };

  const handleGoogle = async () => {
    resetMessages();
    setIsLeavingForGoogle(true);
    const result = await signInWithGoogle();
    // On success the browser is already on its way to Google; the button
    // stays busy so a second press cannot start a second round trip.
    if (!result.success) {
      setFormError(result.error.message);
      setIsLeavingForGoogle(false);
    }
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
      setMode(MODE.CODE);
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
      setAwaitingEntry(true);
    } finally {
      setIsVerifying(false);
    }
  };

  const busy = isSigningIn || isVerifying || isLeavingForGoogle;

  return (
    <PreflightShell current="identity" now={now}>
      {formError && <ErrorLine>{formError}</ErrorLine>}
      {notice && !formError && <NoticeLine>{notice}</NoticeLine>}

      {mode === MODE.GOOGLE && (
        <div className="preflight-actions">
          <button type="button" className="preflight-google" onClick={handleGoogle} disabled={busy}>
            {isLeavingForGoogle ? <ButtonSpinner /> : <GoogleMark />}
            <span>{isLeavingForGoogle ? 'Opening Google...' : 'Continue with Google'}</span>
          </button>
          <button type="button" className="preflight-quiet" onClick={() => switchMode(MODE.EMAIL)} disabled={busy}>
            Use an email code instead
          </button>
        </div>
      )}

      {mode === MODE.EMAIL && (
        <form onSubmit={handleEmailSubmit} className="preflight-form" noValidate>
          <div className="preflight-field">
            <label htmlFor="admin-email" className="preflight-field__label">Admin email</label>
            <div className="preflight-field__box">
              <input
                ref={emailInputRef}
                id="admin-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                className="preflight-field__input"
                value={email}
                onChange={(event) => { setEmail(event.target.value); setFormError(''); }}
                disabled={busy}
                required
              />
            </div>
          </div>
          <button type="submit" disabled={busy} className="preflight-primary">
            {isSigningIn ? <><ButtonSpinner /><span>Sending code...</span></> : <span>Send code</span>}
          </button>
          <button type="button" className="preflight-quiet" onClick={() => switchMode(MODE.GOOGLE)} disabled={busy}>
            Back to Google sign-in
          </button>
        </form>
      )}

      {mode === MODE.CODE && (
        <form onSubmit={handleCodeSubmit} className="preflight-form" noValidate>
          <p className="preflight-hint" id="admin-email-code-hint">
            Sent to <strong>{maskEmail(email)}</strong>. The code expires in 10 minutes.
          </p>
          <CodeField
            ref={codeInputRef}
            id="admin-email-code"
            label="Email code"
            value={code}
            onChange={(next) => { setCode(next); setFormError(''); }}
            disabled={busy}
            describedBy="admin-email-code-hint"
          />
          <button type="submit" disabled={busy || !isValidOneTimeCode(code)} className="preflight-primary">
            {isVerifying ? <><ButtonSpinner /><span>Verifying...</span></> : <span>Verify code</span>}
          </button>
          <div className="preflight-row">
            <button type="button" onClick={handleResend} disabled={resendCooldown > 0 || busy} className="preflight-quiet">
              {isSigningIn ? 'Sending...' : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
            </button>
            <button type="button" onClick={() => switchMode(MODE.EMAIL)} className="preflight-quiet" disabled={busy}>
              Use a different email
            </button>
          </div>
        </form>
      )}
    </PreflightShell>
  );
};

export default AdminLogin;
