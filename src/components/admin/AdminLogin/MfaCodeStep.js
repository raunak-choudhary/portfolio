// src/components/admin/AdminLogin/MfaCodeStep.js
//
// Step 02 of the admin pre-flight: the second key. Rendered by the protected
// dashboard route whenever a session exists, a verified authenticator is
// enrolled, and the session has not yet passed it (the route gates on the
// assurance level). Nothing from the dashboard is rendered behind this
// screen.
//
// One action is open at a time:
// - When this browser supports WebAuthn and the owner has a passkey for this
//   site (passkeyService.getPasskeyStatus), the step shows one quiet unlock
//   row named for the device (passkeyWording: Touch ID, Face ID, fingerprint
//   or passkey) and a "Use a code instead" link. The prompt opens by itself
//   once when the step appears (AUTO_PROMPT_PASSKEY) and never again on its
//   own; after that a tap opens it. While it is open, an arc sweeps around
//   the fingerprint ring and the link stays live: choosing it closes the
//   prompt (AbortController) and shows the code. A closed prompt leaves a
//   calm line; any other failure leaves an error line; both keep the row. A
//   browser that refuses an automatic prompt outright (Safari wants a tap)
//   leaves the row waiting quietly, with no line at all.
// - Code mode shows six masked cells over one real input. The code is sent
//   as soon as the sixth digit is in (typed, pasted or filled by the
//   platform); Enter also sends it. A wrong code clears the cells, shakes
//   them once and says so under them.
// - Without a passkey the step opens in code mode and offers no row.
//
// Sign out sits in the card's footer beside the readout and leaves with the
// launch. When a key is accepted, step 03 lights for a moment while the page
// goes to black, then the assurance level is re-read and the route moves on
// to the Matrix entry. The route is held on this screen from the attempt to
// the hand-off (onHoldChange), because an accepted key raises the session to
// level 2 through an auth event before the launch has played.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthContext } from '../../../contexts/AuthContext';
import {
  ONE_TIME_CODE_LENGTH,
  clearGoogleReturn,
  isValidOneTimeCode,
  listTotpFactors,
  maskEmail,
  partitionTotpFactors,
  verifyTotpChallenge
} from '../../../services/authService';
import PreflightShell from './PreflightShell';
import { prefersReducedMotion } from './PreflightSky';
import { CalmLine, CodeCells, ErrorLine, FingerprintMark, KeypadMark } from './PreflightControls';
import { passkeyWording } from './passkeyWording';
import {
  PASSKEY_ABORTED,
  PASSKEY_PROMPT_BLOCKED,
  getPasskeyStatus,
  signInWithPasskey
} from '../../../services/passkeyService';

/** How long step 03 shows before the route hands over; matches the CSS fade to black. */
export const LAUNCH_HOLD_MS = 700;

/** Under reduced motion the page cuts to black instead of fading; a short hold keeps the status readable. */
export const LAUNCH_HOLD_REDUCED_MS = 250;

/** The availability check never holds the screen longer than this; a slow answer reads as "no passkey". */
export const PASSKEY_CHECK_TIMEOUT_MS = 4000;

/**
 * Whether step 02 opens the passkey prompt by itself when it appears (zero
 * taps; the owner's choice). On: the prompt opens once on arrival when this
 * device has a passkey for the site, and never re-opens by itself after a
 * cancel or a refusal. Where the browser will not open a prompt without a
 * tap (Safari), the refusal is silent and the row waits for the tap. Off:
 * the owner always taps the row. Flip this one value to change it.
 */
export const AUTO_PROMPT_PASSKEY = true;

const CODE_ACCEPTED = 'Authenticator code accepted';

const UNKNOWN_STATUS = { known: false, available: false, bridgeFactorId: undefined, passkeyCount: 0 };

/** The function's status, or unknown when it fails or is slow. */
const checkPasskeyStatus = () => Promise.race([
  getPasskeyStatus().catch(() => UNKNOWN_STATUS),
  new Promise((resolve) => setTimeout(() => resolve(UNKNOWN_STATUS), PASSKEY_CHECK_TIMEOUT_MS))
]);

const MfaCodeStep = ({ now, onHoldChange = () => {}, autoPromptPasskey = AUTO_PROMPT_PASSKEY }) => {
  const { refreshAssurance, signOut, user } = useAuthContext();
  const words = useMemo(() => passkeyWording(), []);
  const [factors, setFactors] = useState([]);
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [isLoadingFactors, setIsLoadingFactors] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [acceptedBy, setAcceptedBy] = useState(CODE_ACCEPTED);
  const [passkeyChecked, setPasskeyChecked] = useState(false);
  const [passkeyOffered, setPasskeyOffered] = useState(false);
  const [mode, setMode] = useState('passkey');
  const [isUsingPasskey, setIsUsingPasskey] = useState(false);
  const [passkeyNote, setPasskeyNote] = useState(null);
  const inputRef = useRef(null);
  const unlockRef = useRef(null);
  const autoPrompted = useRef(false);
  const passkeyAttempt = useRef(null);
  const verifyingRef = useRef(false);

  useEffect(() => {
    // Reaching this step means any Google round trip ended in a session.
    clearGoogleReturn();
    let cancelled = false;
    const status = checkPasskeyStatus();
    status.then(({ available }) => {
      if (cancelled) return;
      setPasskeyOffered(Boolean(available));
      setPasskeyChecked(true);
    });
    (async () => {
      const [listed, { bridgeFactorId }] = await Promise.all([listTotpFactors(), status]);
      if (cancelled) return;
      if (!listed.success) {
        setLoadError(listed.error.message);
      } else {
        // Hide the bridge by the id the function reported; the list's own
        // split (by the reserved prefix) stands when the id is unknown.
        const typed = bridgeFactorId === undefined || !Array.isArray(listed.data.all)
          ? listed.data.verified
          : partitionTotpFactors(listed.data.all, bridgeFactorId).verified;
        setFactors(typed);
        setFactorId(typed[0]?.id || '');
      }
      setIsLoadingFactors(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Leaving the step closes any prompt still open.
  useEffect(() => () => passkeyAttempt.current?.abort(), []);

  const ready = !isLoadingFactors && passkeyChecked;
  const codeMode = ready && (!passkeyOffered || mode === 'code');

  /** Step 03: light it, go to black, then let the route re-read the level-2 session. */
  const launch = useCallback(async (summary) => {
    setAcceptedBy(summary);
    setLaunching(true);
    await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion() ? LAUNCH_HOLD_REDUCED_MS : LAUNCH_HOLD_MS));
    await refreshAssurance();
    onHoldChange(false);
  }, [onHoldChange, refreshAssurance]);

  /**
   * One passkey attempt. `auto` marks the attempt made on arrival, so a
   * browser refusing to open a prompt without a tap stays silent. Each
   * attempt has its own AbortController; a result from an attempt that was
   * aborted or replaced changes nothing.
   */
  const handlePasskey = useCallback(async ({ auto = false } = {}) => {
    const controller = new AbortController();
    passkeyAttempt.current = controller;
    setPasskeyNote(null);
    setIsUsingPasskey(true);
    // setSession raises the session through an auth event; hold the route as for a code.
    onHoldChange(true);
    let result;
    try {
      result = await signInWithPasskey({ signal: controller.signal });
    } catch (thrown) {
      result = { success: false, error: { code: 'unknown', message: 'Something went wrong with the passkey. Try again, or enter a code.' } };
    }
    const current = passkeyAttempt.current === controller;
    if (current) passkeyAttempt.current = null;
    if (!result.success) {
      onHoldChange(false);
      const code = result.error?.code;
      if (!current || controller.signal.aborted || code === PASSKEY_ABORTED) return;
      setIsUsingPasskey(false);
      if (!(auto && code === PASSKEY_PROMPT_BLOCKED)) {
        const calm = code === 'cancelled' || code === PASSKEY_PROMPT_BLOCKED;
        setPasskeyNote({ calm, text: result.error.message });
      }
      // keep the keyboard on the row so a second try is one key away
      setTimeout(() => unlockRef.current?.focus(), 0);
      return;
    }
    setIsUsingPasskey(false);
    await launch(words.accepted);
  }, [launch, onHoldChange, words.accepted]);

  // Focus once everything has loaded: the unlock row when it leads (so a
  // phone keyboard does not cover it), otherwise the code. With the auto
  // prompt on, the prompt opens here, once.
  useEffect(() => {
    if (!ready) return;
    if (passkeyOffered && mode === 'passkey') {
      unlockRef.current?.focus();
      if (autoPromptPasskey && !autoPrompted.current) {
        autoPrompted.current = true;
        handlePasskey({ auto: true });
      }
    } else {
      inputRef.current?.focus();
    }
  }, [ready, passkeyOffered, mode, autoPromptPasskey, handlePasskey]);

  const verify = async (value) => {
    if (verifyingRef.current) return;
    setCodeError('');
    if (!isValidOneTimeCode(value)) {
      setCodeError(`Enter the ${ONE_TIME_CODE_LENGTH}-digit code from your authenticator app.`);
      setAttempt((count) => count + 1);
      return;
    }
    verifyingRef.current = true;
    setIsVerifying(true);
    onHoldChange(true);
    let accepted = false;
    try {
      const result = await verifyTotpChallenge(factorId, value);
      if (!result.success) {
        onHoldChange(false);
        setCodeError(result.error.message);
        setCode('');
        setAttempt((count) => count + 1);
        setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }
      accepted = true;
    } catch (thrown) {
      onHoldChange(false);
      throw thrown;
    } finally {
      verifyingRef.current = false;
      setIsVerifying(false);
    }
    // The session is now at level 2; the route re-reads the state and
    // continues to the entry and the dashboard.
    if (accepted) await launch(CODE_ACCEPTED);
  };

  const handleCodeChange = (next) => {
    setCode(next);
    if (codeError) setCodeError('');
    if (next.length === ONE_TIME_CODE_LENGTH && factorId) verify(next);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    verify(code);
  };

  const showCode = () => {
    // An open prompt is closed; its attempt then ends without a word.
    passkeyAttempt.current?.abort();
    passkeyAttempt.current = null;
    setIsUsingPasskey(false);
    setPasskeyNote(null);
    setMode('code');
  };

  const showPasskey = () => {
    setCode('');
    setCodeError('');
    setMode('passkey');
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

  const signOutButton = (
    <button type="button" onClick={() => signOut()} className="preflight-signout" disabled={isVerifying || isUsingPasskey}>
      Sign out
    </button>
  );

  let codeNote = passkeyOffered
    ? 'Checked as soon as the sixth digit is in. Paste works too.'
    : 'Open your authenticator app for RC Portfolio Admin. The code is checked as soon as the sixth digit is in.';
  if (isVerifying) codeNote = 'Checking the code';

  return (
    <PreflightShell current="second" now={now} summaries={{ identity }} footerAction={signOutButton}>
      {loadError && <ErrorLine>{loadError}</ErrorLine>}

      {!ready && <p className="preflight-hint" role="status">Checking for a passkey on this device</p>}

      {ready && !codeMode && (
        <div className="preflight-actions">
          <button
            ref={unlockRef}
            type="button"
            className={`preflight-unlock${isUsingPasskey ? ' preflight-unlock--waiting' : ''}`}
            onClick={isUsingPasskey ? undefined : () => handlePasskey()}
            aria-busy={isUsingPasskey || undefined}
            aria-describedby="admin-passkey-hint"
            disabled={launching}
          >
            <span className="preflight-unlock__ring" aria-hidden="true">
              <FingerprintMark />
              <svg className="preflight-unlock__sweep" viewBox="0 0 44 44" focusable="false"><circle cx="22" cy="22" r="21.5" /></svg>
            </span>
            <span className="preflight-unlock__text">
              <span className="preflight-unlock__label">{isUsingPasskey ? words.waiting : words.label}</span>
              <span className="preflight-unlock__hint" id="admin-passkey-hint">{isUsingPasskey ? words.waitingHint : words.hint}</span>
            </span>
          </button>
          {passkeyNote && (passkeyNote.calm ? <CalmLine>{passkeyNote.text}</CalmLine> : <ErrorLine>{passkeyNote.text}</ErrorLine>)}
          <button type="button" className="preflight-switch" onClick={showCode}>
            <KeypadMark />
            <span>Use a code instead</span>
          </button>
        </div>
      )}

      {codeMode && (
        <form onSubmit={handleSubmit} className="preflight-form" noValidate>
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

          <div className="preflight-code">
            <CodeCells
              ref={inputRef}
              id="admin-totp-code"
              label="Authenticator code"
              value={code}
              onChange={handleCodeChange}
              disabled={isLoadingFactors || launching || isUsingPasskey || !factorId}
              checking={isVerifying}
              invalid={Boolean(codeError)}
              describedBy="admin-totp-note"
              attempt={attempt}
            />
            {isVerifying && <span className="preflight-progress" aria-hidden="true" />}
            {codeError
              ? <div id="admin-totp-note"><ErrorLine>{codeError}</ErrorLine></div>
              : <p className="preflight-code__note" id="admin-totp-note" role="status">{codeNote}</p>}
          </div>

          {passkeyOffered && !isVerifying && (
            <button type="button" className="preflight-switch" onClick={showPasskey}>
              <FingerprintMark size={16} className="preflight-switch__mark" />
              <span>{words.back}</span>
            </button>
          )}
        </form>
      )}
    </PreflightShell>
  );
};

export default MfaCodeStep;
