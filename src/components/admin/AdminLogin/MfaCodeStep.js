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
//
// Passkey: when this browser supports WebAuthn and the owner has a passkey
// for this site (passkeyService.hasPasskey), "Use passkey" leads and the code
// field stays below it as the fallback. A passkey sign-in ends in the same
// hold and launch as a typed code. A closed prompt or any failure leaves the
// code field ready.

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
import { CodeField, ErrorLine, PasskeyMark } from './PreflightControls';
import { hasPasskey, isSupported as passkeysSupported, signInWithPasskey } from '../../../services/passkeyService';

/** How long step 03 shows before the route hands over; matches the CSS fade to black. */
export const LAUNCH_HOLD_MS = 700;

/** Under reduced motion the page cuts to black instead of fading; a short hold keeps the status readable. */
export const LAUNCH_HOLD_REDUCED_MS = 250;

/** The availability check never holds the screen longer than this; a slow answer reads as "no passkey". */
export const PASSKEY_CHECK_TIMEOUT_MS = 4000;

const checkPasskey = () => (passkeysSupported()
  ? Promise.race([
    hasPasskey().catch(() => false),
    new Promise((resolve) => setTimeout(() => resolve(false), PASSKEY_CHECK_TIMEOUT_MS))
  ])
  : Promise.resolve(false));

const MfaCodeStep = ({ now, onHoldChange = () => {} }) => {
  const { refreshAssurance, signOut, user } = useAuthContext();
  const [factors, setFactors] = useState([]);
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoadingFactors, setIsLoadingFactors] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [acceptedBy, setAcceptedBy] = useState('Authenticator code accepted');
  const [passkeyChecked, setPasskeyChecked] = useState(false);
  const [passkeyOffered, setPasskeyOffered] = useState(false);
  const [isUsingPasskey, setIsUsingPasskey] = useState(false);
  const inputRef = useRef(null);
  const passkeyRef = useRef(null);

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
    checkPasskey().then((available) => {
      if (cancelled) return;
      setPasskeyOffered(Boolean(available));
      setPasskeyChecked(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Focus once everything has loaded: the passkey button when it leads (so a
  // phone keyboard does not cover it), otherwise the code field.
  useEffect(() => {
    if (isLoadingFactors || !passkeyChecked) return;
    if (passkeyOffered) passkeyRef.current?.focus();
    else inputRef.current?.focus();
  }, [isLoadingFactors, passkeyChecked, passkeyOffered]);

  /** Step 03: light it, go to black, then let the route re-read the level-2 session. */
  const launch = async (summary) => {
    setAcceptedBy(summary);
    setLaunching(true);
    await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion() ? LAUNCH_HOLD_REDUCED_MS : LAUNCH_HOLD_MS));
    await refreshAssurance();
    onHoldChange(false);
  };

  const handlePasskey = async () => {
    setError('');
    setIsUsingPasskey(true);
    // setSession raises the session through an auth event; hold the route as for a code.
    onHoldChange(true);
    let result;
    try {
      result = await signInWithPasskey();
    } catch (thrown) {
      result = { success: false, error: { message: 'Something went wrong with the passkey. Try again, or enter a code.' } };
    }
    setIsUsingPasskey(false);
    if (!result.success) {
      onHoldChange(false);
      setError(result.error.message);
      return;
    }
    await launch('Passkey accepted');
  };

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
    // The session is now at level 2; the route re-reads the state and
    // continues to the entry and the dashboard.
    if (accepted) await launch('Authenticator code accepted');
  };

  const busy = isVerifying || isLoadingFactors || launching || isUsingPasskey;
  const identity = user?.email ? `Signed in as ${maskEmail(user.email)}` : 'Signed in';

  if (launching) {
    return (
      <PreflightShell current="launch" now={now} launching summaries={{ identity, second: acceptedBy }}>
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

      {passkeyOffered && (
        <div className="preflight-actions">
          <button ref={passkeyRef} type="button" className="preflight-primary" onClick={handlePasskey} disabled={busy}>
            {isUsingPasskey ? <ButtonSpinner /> : <PasskeyMark />}
            <span>{isUsingPasskey ? 'Waiting for your passkey...' : 'Use passkey'}</span>
          </button>
          <p className="preflight-divider" aria-hidden="true"><span>Or enter a code</span></p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="preflight-form" noValidate>
        <p className="preflight-hint" id="admin-totp-hint">
          Open your authenticator app and enter the code for RC Portfolio Admin.
          {!passkeyOffered && ' It changes every 30 seconds.'}
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

        <button
          type="submit"
          disabled={busy || !factorId || !isValidOneTimeCode(code)}
          className={passkeyOffered ? 'preflight-primary preflight-primary--quiet' : 'preflight-primary'}
        >
          {isVerifying ? <><ButtonSpinner /><span>Verifying...</span></> : <span>Verify and continue</span>}
        </button>
        <button type="button" onClick={() => signOut()} className="preflight-quiet" disabled={isVerifying || launching || isUsingPasskey}>
          Sign out
        </button>
      </form>
    </PreflightShell>
  );
};

export default MfaCodeStep;
