// src/components/admin/Security/MfaEnrollment.js
//
// Security screen of the dashboard: enrol an authenticator app (QR code or
// setup key, confirmed with the first code), list enrolled devices, add a
// backup device, remove a device with confirmation, and show the recovery
// note. While no authenticator is enrolled this is the only screen the
// dashboard shows, so the owner cannot skip it.
//
// Security notes: the setup secret is shown once, during enrolment, and never
// stored by this code; an unfinished enrolment is removed before a new one
// starts; removing the last device is allowed only after an explicit warning,
// because it drops the account back to a single factor.

import React, { useCallback, useEffect, useState } from 'react';
import { useAuthContext } from '../../../contexts/AuthContext';
import {
  ONE_TIME_CODE_LENGTH,
  PRIMARY_FACTOR_NAME,
  enrollTotp,
  isValidOneTimeCode,
  listTotpFactors,
  removeUnverifiedFactors,
  sanitizeCodeInput,
  unenrollFactor,
  verifyTotpEnrollment
} from '../../../services/authService';
import LoadingSpinner from '../../common/LoadingSpinner';
import './MfaEnrollment.css';

const MfaEnrollment = ({ enrollmentRequired = false }) => {
  const { refreshAssurance, user } = useAuthContext();
  const [factors, setFactors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pending, setPending] = useState(null); // { factorId, friendlyName, qrCode, secret, uri }
  const [deviceName, setDeviceName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);

  const loadFactors = useCallback(async () => {
    const listed = await listTotpFactors();
    if (listed.success) {
      setFactors(listed.data.verified);
      setError('');
    } else {
      setError(listed.error.message);
    }
    setIsLoading(false);
    return listed;
  }, []);

  useEffect(() => {
    (async () => {
      await removeUnverifiedFactors();
      await loadFactors();
    })();
  }, [loadFactors]);

  const startEnrollment = async () => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await removeUnverifiedFactors();
      const name = deviceName.trim() || (factors.length === 0 ? PRIMARY_FACTOR_NAME : `Backup authenticator ${factors.length}`);
      const result = await enrollTotp(name);
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setPending(result.data);
      setCode('');
      setCopied(false);
    } finally {
      setBusy(false);
    }
  };

  const cancelEnrollment = async () => {
    setBusy(true);
    try {
      await removeUnverifiedFactors();
      setPending(null);
      setCode('');
      setError('');
    } finally {
      setBusy(false);
    }
  };

  const confirmEnrollment = async (event) => {
    event.preventDefault();
    setError('');
    if (!isValidOneTimeCode(code)) {
      setError(`Enter the ${ONE_TIME_CODE_LENGTH}-digit code your authenticator app shows.`);
      return;
    }
    setBusy(true);
    try {
      const result = await verifyTotpEnrollment(pending.factorId, code);
      if (!result.success) {
        setError(result.error.message);
        setCode('');
        return;
      }
      setPending(null);
      setDeviceName('');
      setCode('');
      setNotice('Authenticator activated. Keep the setup key in your password manager.');
      await loadFactors();
      await refreshAssurance();
    } finally {
      setBusy(false);
    }
  };

  const removeFactor = async (factor) => {
    const last = factors.length === 1;
    const question = last
      ? `Remove "${factor.friendly_name}"? It is your only authenticator. Until you enrol another, the account is protected by the email code alone, and content changes will be refused once the second factor is enforced.`
      : `Remove "${factor.friendly_name}"? You will no longer be able to sign in with that device.`;
    if (!window.confirm(question)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await unenrollFactor(factor.id);
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setNotice(`Removed "${factor.friendly_name}".`);
      await loadFactors();
      await refreshAssurance();
    } finally {
      setBusy(false);
    }
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(pending.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (copyError) {
      setError('Copy failed. Select the key and copy it by hand.');
    }
  };

  const groupedSecret = pending?.secret ? pending.secret.replace(/(.{4})/g, '$1 ').trim() : '';

  return (
    <div className="admin-section-content mfa-section">
      <div className="admin-section-header">
        <h2 className="admin-section-title">
          <span className="admin-section-icon" aria-hidden="true">🛡️</span>
          Security
        </h2>
        <p className="mfa-intro">
          Signing in takes two steps: a code emailed to {user?.email || 'the admin address'}, then a code from an
          authenticator app on your phone. Manage the apps here.
        </p>
      </div>

      {enrollmentRequired && (
        <div className="mfa-banner mfa-banner-required" role="status">
          <strong>Set up your authenticator app to continue.</strong> The rest of the dashboard opens once the first
          device is confirmed.
        </div>
      )}

      {error && <div className="mfa-banner mfa-banner-error" role="alert">{error}</div>}
      {notice && !error && <div className="mfa-banner mfa-banner-ok" role="status">{notice}</div>}

      {isLoading ? (
        <div className="mfa-loading"><LoadingSpinner /><p>Reading your authenticators...</p></div>
      ) : (
        <>
          <section className="mfa-card" aria-labelledby="mfa-devices-title">
            <h3 id="mfa-devices-title" className="mfa-card-title">Enrolled devices</h3>
            {factors.length === 0 ? (
              <p className="mfa-muted">No authenticator app is enrolled yet.</p>
            ) : (
              <ul className="mfa-device-list">
                {factors.map((factor) => (
                  <li key={factor.id} className="mfa-device">
                    <div>
                      <div className="mfa-device-name">{factor.friendly_name || 'Authenticator'}</div>
                      <div className="mfa-muted">Added {new Date(factor.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}</div>
                    </div>
                    <button type="button" className="mfa-button mfa-button-danger" onClick={() => removeFactor(factor)} disabled={busy}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!pending ? (
            <section className="mfa-card" aria-labelledby="mfa-add-title">
              <h3 id="mfa-add-title" className="mfa-card-title">{factors.length === 0 ? 'Add your authenticator app' : 'Add a backup device'}</h3>
              <ol className="mfa-steps">
                <li>Install Google Authenticator, Authy, 1Password or any TOTP app on your phone.</li>
                <li>Press the button, then scan the QR code or type the setup key into the app.</li>
                <li>Enter the six-digit code the app shows to activate it.</li>
              </ol>
              <label className="mfa-label" htmlFor="mfa-device-name">Device name (optional)</label>
              <input
                id="mfa-device-name"
                className="mfa-input"
                type="text"
                maxLength={60}
                placeholder={factors.length === 0 ? PRIMARY_FACTOR_NAME : 'Backup phone'}
                value={deviceName}
                onChange={(event) => setDeviceName(event.target.value)}
                disabled={busy}
              />
              <button type="button" className="mfa-button mfa-button-primary" onClick={startEnrollment} disabled={busy}>
                {busy ? 'Preparing...' : factors.length === 0 ? 'Start setup' : 'Add device'}
              </button>
            </section>
          ) : (
            <section className="mfa-card" aria-labelledby="mfa-pending-title">
              <h3 id="mfa-pending-title" className="mfa-card-title">Scan or type, then confirm</h3>
              <div className="mfa-enrol-grid">
                {pending.qrCode ? (
                  <img className="mfa-qr" src={pending.qrCode} alt="QR code for the authenticator app" />
                ) : (
                  <div className="mfa-qr mfa-qr-missing">
                    <p>The QR code could not be generated. Type the setup key instead.</p>
                    <button type="button" className="mfa-button" onClick={startEnrollment} disabled={busy}>Retry</button>
                  </div>
                )}
                <div className="mfa-secret-block">
                  <label className="mfa-label" htmlFor="mfa-secret">Setup key</label>
                  <input id="mfa-secret" className="mfa-input mfa-secret" type="text" readOnly value={groupedSecret} onFocus={(event) => event.target.select()} />
                  <button type="button" className="mfa-button" onClick={copySecret} disabled={busy}>
                    {copied ? 'Copied' : 'Copy key'}
                  </button>
                  <p className="mfa-muted">
                    Save this key in your password manager. It is the only way to re-add the app if you lose the phone.
                  </p>
                </div>
              </div>
              <form onSubmit={confirmEnrollment} className="mfa-confirm">
                <label className="mfa-label" htmlFor="mfa-first-code">Code from the app</label>
                <input
                  id="mfa-first-code"
                  className="mfa-input mfa-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  maxLength={ONE_TIME_CODE_LENGTH}
                  placeholder={`${ONE_TIME_CODE_LENGTH} digits`}
                  value={code}
                  onChange={(event) => { setCode(sanitizeCodeInput(event.target.value)); setError(''); }}
                  disabled={busy}
                />
                <div className="mfa-actions">
                  <button type="submit" className="mfa-button mfa-button-primary" disabled={busy || !isValidOneTimeCode(code)}>
                    {busy ? 'Checking...' : 'Activate authenticator'}
                  </button>
                  <button type="button" className="mfa-button" onClick={cancelEnrollment} disabled={busy}>Cancel</button>
                </div>
              </form>
            </section>
          )}

          <section className="mfa-card mfa-card-note">
            <h3 className="mfa-card-title">If you lose your phone</h3>
            <p className="mfa-muted">
              Re-add the app with the setup key from your password manager. Without the key, the backup device signs
              you in. Without either, the account owner removes the factors with the Supabase admin command described
              in the project notes, then enrols again.
            </p>
          </section>
        </>
      )}
    </div>
  );
};

export default MfaEnrollment;
