// src/components/admin/AdminLogin/MfaCodeStep.js
//
// Step 02 of the admin pre-flight: the authenticator-app code. Rendered by
// the protected dashboard route whenever a session exists, a verified
// authenticator is enrolled, and the session has not yet passed it (the
// route gates on the assurance level). Nothing from the dashboard is
// rendered behind this screen.
//
// When the code is accepted, step 03 lights for a moment while the page goes
// to black, then the assurance level is re-read and the route moves on to the
// Matrix entry, which starts from black too. The route is held on this screen
// from submit to hand-off (onHoldChange), because a verified code raises the
// session to level 2 through an auth event before the launch has played.

import React, { useEffect, useRef, useState } from 'react';
import { useAuthContext } from '../../../contexts/AuthContext';
import {
  ONE_TIME_CODE_LENGTH,
  clearGoogleReturn,
  isValidOneTimeCode,
  listTotpFactors,
  maskEmail,
  verifyTotpChallenge
} from '../../../services/authService';
import ButtonSpinner from '../../common/ButtonSpinner';
import PreflightShell from './PreflightShell';
import { prefersReducedMotion } from './PreflightSky';
import { CodeField, ErrorLine } from './PreflightControls';

/** How long step 03 shows before the route hands over; matches the CSS fade to black. */
export const LAUNCH_HOLD_MS = 700;

/** Under reduced motion the page cuts to black instead of fading; a short hold keeps the status readable. */
export const LAUNCH_HOLD_REDUCED_MS = 250;

const MfaCodeStep = ({ now, onHoldChange = () => {} }) => {
  const { refreshAssurance, signOut, user } = useAuthContext();
  const [factors, setFactors] = useState([]);
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoadingFactors, setIsLoadingFactors] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [launching, setLaunching] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    // Reaching this step means any Google round trip ended in a session.
    clearGoogleReturn();
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
    })();
    return () => { cancelled = true; };
  }, []);

  // Focus once the field is enabled; a disabled input cannot take focus.
  useEffect(() => {
    if (!isLoadingFactors) inputRef.current?.focus();
  }, [isLoadingFactors]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!isValidOneTimeCode(code)) {
      setError(`Enter the ${ONE_TIME_CODE_LENGTH}-digit code from your authenticator app.`);
      return;
    }
    setIsVerifying(true);
    onHoldChange(true);
    let accepted = false;
    try {
      const result = await verifyTotpChallenge(factorId, code);
      if (!result.success) {
        onHoldChange(false);
        setError(result.error.message);
        setCode('');
        inputRef.current?.focus();
        return;
      }
      accepted = true;
    } catch (thrown) {
      onHoldChange(false);
      throw thrown;
    } finally {
      setIsVerifying(false);
    }
    if (accepted) {
      setLaunching(true);
      await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion() ? LAUNCH_HOLD_REDUCED_MS : LAUNCH_HOLD_MS));
      // The session is now at level 2; the route re-reads the state and
      // continues to the entry and the dashboard.
      await refreshAssurance();
      onHoldChange(false);
    }
  };

  const busy = isVerifying || isLoadingFactors || launching;
  const identity = user?.email ? `Signed in as ${maskEmail(user.email)}` : 'Signed in';

  if (launching) {
    return (
      <PreflightShell current="launch" now={now} launching summaries={{ identity, second: 'Authenticator code accepted' }}>
        <p className="preflight-launch" role="status">
          <span className="preflight-launch__bar" aria-hidden="true" />
          <span>Entry starting</span>
        </p>
      </PreflightShell>
    );
  }

  return (
    <PreflightShell current="second" now={now} summaries={{ identity }}>
      {error && <ErrorLine>{error}</ErrorLine>}

      <form onSubmit={handleSubmit} className="preflight-form" noValidate>
        <p className="preflight-hint" id="admin-totp-hint">
          Open your authenticator app and enter the code for RC Portfolio Admin. It changes every 30 seconds.
        </p>

        {factors.length > 1 && (
          <div className="preflight-field">
            <label htmlFor="admin-factor" className="preflight-field__label">Device</label>
            <div className="preflight-field__box">
              <select
                id="admin-factor"
                className="preflight-field__input"
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

        <CodeField
          ref={inputRef}
          id="admin-totp-code"
          label="Authenticator code"
          value={code}
          onChange={(next) => { setCode(next); setError(''); }}
          disabled={busy}
          describedBy="admin-totp-hint"
        />

        <button type="submit" disabled={busy || !factorId || !isValidOneTimeCode(code)} className="preflight-primary">
          {isVerifying ? <><ButtonSpinner /><span>Verifying...</span></> : <span>Verify and continue</span>}
        </button>
        <button type="button" onClick={() => signOut()} className="preflight-quiet" disabled={isVerifying || launching}>
          Sign out
        </button>
      </form>
    </PreflightShell>
  );
};

export default MfaCodeStep;
