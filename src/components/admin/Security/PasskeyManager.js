// src/components/admin/Security/PasskeyManager.js
//
// The "Passkeys" card of the Security screen: the passkeys registered for the
// admin (device name, when it was added, when it was last used), "Add this
// device" with a name, and removal with a confirmation. A passkey replaces
// typing the authenticator code at sign-in on the device that holds it; the
// authenticator apps above stay as the typed fallback.
//
// Rendered once an authenticator is enrolled, and whenever passkeys or the
// bridge exist, so they can always be removed. The list (row level security)
// and registration need a level-2 session. A passkey made on the dev server
// is marked "localhost"; it is removed before the final deploy. Registering
// the first passkey creates the bridge factor in Auth and returns a fresh
// level-2 session, which passkeyService adopts; the assurance state is
// re-read afterwards so the route sees it.

import React, { useCallback, useEffect, useState } from 'react';
import { useAuthContext } from '../../../contexts/AuthContext';
import {
  DEVICE_NAME_MAX,
  isSupported,
  listPasskeys,
  registerPasskey,
  removePasskey,
  suggestDeviceName
} from '../../../services/passkeyService';
import { isLocalhostPasskey } from './securityModel';

const formatDay = (value) => (value ? new Date(value).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '');

/** onChange runs after a passkey is added or removed, so the Security screen can re-read its rules. */
const PasskeyManager = ({ onChange = () => {} }) => {
  const { refreshAssurance } = useAuthContext();
  const [passkeys, setPasskeys] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deviceName, setDeviceName] = useState(() => suggestDeviceName());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const supported = isSupported();

  const load = useCallback(async () => {
    const listed = await listPasskeys();
    if (listed.success) setPasskeys(listed.data);
    else setError(listed.error.message);
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addDevice = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await registerPasskey(deviceName);
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setNotice(`Passkey added for "${deviceName.trim().replace(/\s+/g, ' ')}". Next time, choose "Use passkey" at the second step on this device.`);
      await load();
      await refreshAssurance();
      await onChange();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (passkey) => {
    const last = passkeys.length === 1;
    const question = last
      ? `Remove "${passkey.device_name}"? It is your only passkey, so passkey sign-in is switched off until you add another. If you signed in with it, you will be asked for an authenticator code again.`
      : `Remove "${passkey.device_name}"? That device will need an authenticator code at sign-in.`;
    if (!window.confirm(question)) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await removePasskey(passkey.id, passkey.device_name);
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setNotice(`Removed "${passkey.device_name}".`);
      await load();
      // Removing the last passkey retires the bridge, which can lower this session to level 1.
      if (result.data.bridgeRemoved) await refreshAssurance();
      await onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mfa-card" aria-labelledby="passkey-title">
      <h3 id="passkey-title" className="mfa-card-title">Passkeys</h3>
      <p className="mfa-muted passkey-explainer">
        A passkey replaces typing the authenticator code at sign-in on the device that holds it: you confirm with
        your fingerprint, face or device PIN instead.
      </p>

      {error && <div className="mfa-banner mfa-banner-error" role="alert">{error}</div>}
      {notice && !error && <div className="mfa-banner mfa-banner-ok" role="status">{notice}</div>}

      {isLoading ? (
        <p className="mfa-muted">Reading your passkeys...</p>
      ) : passkeys.length === 0 ? (
        <p className="mfa-muted">No passkey is registered yet.</p>
      ) : (
        <ul className="mfa-device-list passkey-list">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="mfa-device">
              <div className="passkey-device-text">
                <div className="mfa-device-name">
                  {passkey.device_name}
                  {isLocalhostPasskey(passkey) && <span className="passkey-site-tag">localhost</span>}
                </div>
                <div className="mfa-muted">
                  Added {formatDay(passkey.created_at)}
                  <span aria-hidden="true"> · </span>
                  {passkey.last_used_at ? `Last used ${formatDay(passkey.last_used_at)}` : 'Not used yet'}
                </div>
              </div>
              <button type="button" className="mfa-button mfa-button-danger" onClick={() => remove(passkey)} disabled={busy}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {supported ? (
        <form className="passkey-add" onSubmit={addDevice}>
          <label className="mfa-label" htmlFor="passkey-device-name">Name for this device</label>
          <input
            id="passkey-device-name"
            className="mfa-input"
            type="text"
            maxLength={DEVICE_NAME_MAX}
            autoComplete="off"
            value={deviceName}
            onChange={(event) => { setDeviceName(event.target.value); setError(''); }}
            disabled={busy}
          />
          <button type="submit" className="mfa-button mfa-button-primary" disabled={busy || !deviceName.trim()}>
            {busy ? 'Waiting for your passkey...' : 'Add this device'}
          </button>
        </form>
      ) : (
        <p className="mfa-muted">This browser cannot create passkeys. Open the Security screen on the device you want to add.</p>
      )}
    </section>
  );
};

export default PasskeyManager;
