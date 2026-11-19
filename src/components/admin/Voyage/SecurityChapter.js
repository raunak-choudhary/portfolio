// src/components/admin/Voyage/SecurityChapter.js
//
// Cassiopeia: the Security chapter of the voyage. Plain and serious: ruled
// lists, consequence-first sentences, no decoration. Five panes:
//   Authenticator apps   the typed six-digit code, with add and remove; the
//                        last app is held while passkeys exist (the bridge
//                        rule, also enforced by a database trigger)
//   Passkeys             this device's passkey, with the localhost tag
//   This session         true facts only: the level, how it was reached, when
//                        it began, what this device is; Sign out everywhere
//   Wrong-address alerts what the alert email does and why nothing is listed
//   If you lose your phone  the three recovery steps
// With no authenticator at all the chapter is first-time enrolment: a banner
// says the rest of the admin waits for it (VoyagePage locks the other
// chapters), and only the apps, recovery, a short session pane and the
// passkey note show.
//
// Every rule and sentence comes from Security/securityModel.js; every call
// goes through authService and passkeyService, which the classic Security
// screen uses too. Failures are fixed sentences; nothing from a server is
// shown.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Fingerprint, Lock, LogOut, Plus, RefreshCw, ShieldCheck, Smartphone, Trash2, TriangleAlert } from 'lucide-react';
import { useAuthContext } from '../../../contexts/AuthContext';
import { getSessionFacts, listTotpFactors, removeUnverifiedFactors, signOutEverywhere, unenrollFactor } from '../../../services/authService';
import { DEVICE_NAME_MAX, getPasskeyStatus, isSupported, listPasskeys, registerPasskey, removePasskey, suggestDeviceName } from '../../../services/passkeyService';
import { beginFilmHandoff, cancelFilmHandoff } from '../../../services/signOutHandoff';
import { detectPasskeyDevice, passkeyWording } from '../AdminLogin/passkeyWording';
import {
  HELD_REASON, appsNote, chapterState, describeSession, deviceText, formatDay, holdLastApp, isLocalhostPasskey, levelOneNote,
  passkeyAddedText, passkeysInUse, removeAppConfirm, removePasskeyConfirm, tidyDeviceName,
} from '../Security/securityModel';
import ConfirmDialog from './ConfirmDialog';
import SecurityAddAppDialog from './SecurityAddAppDialog';
import './Security.css';

/** The sentence when the first read fails (the approved mockup's words). */
export const READ_FAILED = 'Your authenticators could not be read. Nothing was changed. Check the connection and try again.';
const LOCALHOST_TITLE = 'Works only on the local dev server; remove it before the final deploy';

const EMPTY = { apps: [], hasBridge: false, passkeyCount: 0, passkeys: [], session: null };

function Pane({ id, title, children }) {
  return (
    <section className="voyage-pane sec-pane" aria-labelledby={id}>
      <div className="sec-pane__head"><h3 id={id}>{title}</h3></div>
      {children}
    </section>
  );
}

const Skel = ({ h }) => <div className="sec-skel" style={{ height: h }} />;

/** Whether this browser has a built-in passkey authenticator: true, false, or null when it cannot say. */
async function readPlatformAuthenticator() {
  try {
    const check = window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable;
    if (typeof check !== 'function') return null;
    return Boolean(await check.call(window.PublicKeyCredential));
  } catch { return null; }
}

/**
 * @param {object} props
 * @param {(text: string, tone?: string) => void} props.notify the voyage's toast.
 * @param {() => void} props.onLeave plays the sign-out film (VoyagePage's signOut), after every session has ended.
 */
export default function SecurityChapter({ notify, onLeave }) {
  const { refreshAssurance } = useAuthContext();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [facts, setFacts] = useState(EMPTY);
  const [platform, setPlatform] = useState(null);
  const [adding, setAdding] = useState(false);              // the add-authenticator dialog
  const [appDone, setAppDone] = useState('');               // name of the app just activated
  const [confirm, setConfirm] = useState(null);             // { what: 'app'|'passkey', target, title, body, more?, confirm }
  const [removing, setRemoving] = useState(false);
  const [deviceName, setDeviceName] = useState(() => suggestDeviceName());
  const [passkey, setPasskey] = useState({ phase: 'idle', name: '', error: '' });  // idle | wait | added
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const alive = useRef(true);
  const addAppRef = useRef(null), addDeviceRef = useRef(null), chapterRef = useRef(null);

  // Set on every mount, not only at creation: React's development double mount
  // runs this cleanup once, and a flag left false would hide every result.
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Clean up any half-made enrolment, then read the apps, the passkeys and the session.
  // `quiet` keeps the panes on screen while a change is re-read.
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) { setLoading(true); setFailed(false); }
    try {
      await removeUnverifiedFactors();
      const status = await getPasskeyStatus();
      const listed = await listTotpFactors({ bridgeFactorId: status.bridgeFactorId });
      if (!listed.success) { if (alive.current && !quiet) setFailed(true); return; }
      const apps = listed.data.verified;
      const hasBridge = Boolean(listed.data.bridge);
      let passkeys = [];
      // Passkey rows are readable only at level 2, which needs an app or a passkey first.
      if (apps.length || passkeysInUse({ hasBridge, passkeyCount: status.passkeyCount })) {
        const rows = await listPasskeys();
        if (!rows.success) { if (alive.current && !quiet) setFailed(true); return; }
        passkeys = rows.data;
      }
      const session = await getSessionFacts();
      if (!alive.current) return;
      setFacts({ apps, hasBridge, passkeyCount: status.passkeyCount, passkeys, session: session.success ? session.data : null });
      setFailed(false);
    } catch {
      if (alive.current && !quiet) setFailed(true);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { readPlatformAuthenticator().then((v) => { if (alive.current) setPlatform(v); }); }, []);

  const { apps, passkeys, session } = facts;
  const inUse = passkeysInUse({ hasBridge: facts.hasBridge, passkeyCount: facts.passkeyCount, passkeys });
  const held = holdLastApp(apps.length, inUse);
  const state = chapterState({ loading, error: failed, appCount: apps.length, inUse });
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const wording = passkeyWording(nav);

  // ---- actions ----
  const askRemoveApp = (app) => {
    const copy = removeAppConfirm(app, apps, passkeys.length, inUse);
    if (copy) setConfirm({ what: 'app', target: app, ...copy });
  };
  const askRemovePasskey = (row) => setConfirm({ what: 'passkey', target: row, ...removePasskeyConfirm(row, passkeys) });

  const doRemove = async () => {
    if (!confirm) return;
    const { what, target } = confirm;
    setRemoving(true);
    try {
      const result = what === 'app' ? await unenrollFactor(target.id, target.friendly_name) : await removePasskey(target.id, target.device_name);
      if (!result.success) { notify(result.error.message, 'bad'); return; }
      const name = what === 'app' ? target.friendly_name : target.device_name;
      setAppDone(''); setPasskey((p) => (p.phase === 'added' ? { phase: 'idle', name: '', error: '' } : p));
      notify(`Removed "${name}".`);
      // An app removal or the bridge's retirement can change the session's level.
      if (what === 'app' || result.data?.bridgeRemoved) await refreshAssurance();
      await load({ quiet: true });
    } finally {
      if (alive.current) { setRemoving(false); setConfirm(null); }
    }
  };

  const onActivated = async ({ friendlyName }) => {
    setAppDone(friendlyName);
    await refreshAssurance();
    await load({ quiet: true });
  };

  const addDevice = async (event) => {
    event.preventDefault();
    const name = tidyDeviceName(deviceName);
    if (!name) { setPasskey({ phase: 'idle', name: '', error: 'Give this device a name first.' }); addDeviceRef.current?.focus(); return; }
    setPasskey({ phase: 'wait', name, error: '' });
    const result = await registerPasskey(name);
    if (!alive.current) return;
    if (!result.success) { setPasskey({ phase: 'idle', name, error: result.error.message }); return; }
    setPasskey({ phase: 'added', name, error: '' });
    await refreshAssurance();
    await load({ quiet: true });
  };

  const everywhere = async () => {
    setLeaveError(''); setLeaving(true);
    // The global sign-out fires SIGNED_OUT; the hand-off keeps the router from bouncing to the login before the film loads.
    beginFilmHandoff();
    const result = await signOutEverywhere();
    if (!result.success) {
      cancelFilmHandoff();
      if (alive.current) { setLeaving(false); setLeaveError(result.error.message); }
      return;
    }
    onLeave();
  };

  // A removed row's button is gone, so focus falls back to the pane's add control.
  const returnFocus = () => addAppRef.current || chapterRef.current?.querySelector('.sec-pane button');

  // ---- panes ----
  const appsPane = (
    <Pane id="sec-apps" title="Authenticator apps">
      <p className="sec-note">{appsNote(apps.length)}</p>
      {apps.length > 0 && (
        <ul className="sec-list">
          {apps.map((app) => (
            <li key={app.id} className="sec-row" data-testid="sec-app">
              <span className="sec-row__icon" aria-hidden="true"><Smartphone size={18} /></span>
              <div className="sec-row__text"><span className="sec-row__name">{app.friendly_name}</span><span className="sec-row__meta">Added {formatDay(app.created_at)}</span></div>
              <div className="sec-row__act">
                <button type="button" className="voyage-bar__button" onClick={() => askRemoveApp(app)} disabled={held || removing} aria-describedby={held ? 'sec-held' : undefined} aria-label={`Remove ${app.friendly_name}`}><Trash2 size={15} aria-hidden="true" /><span>Remove</span></button>
              </div>
              {held && <p className="sec-row__why" id="sec-held"><Lock size={13} aria-hidden="true" /> {HELD_REASON}</p>}
            </li>
          ))}
        </ul>
      )}
      {appDone && <div className="sec-banner sec-banner--ok" role="status"><Check size={16} aria-hidden="true" /><p>"{appDone}" is active. Keep its setup key in your password manager.</p></div>}
      <div className="sec-actions">
        <button ref={addAppRef} type="button" className={`voyage-bar__button${apps.length ? '' : ' voyage-bar__button--primary'}`} onClick={() => setAdding(true)}><Plus size={15} aria-hidden="true" /><span>{apps.length ? 'Add an authenticator app' : 'Set up an authenticator app'}</span></button>
      </div>
    </Pane>
  );

  const passkeyAdd = !apps.length
    ? <p className="sec-note">Passkeys open after the first authenticator app is confirmed.</p>
    : passkey.phase === 'wait'
      ? <div className="sec-wait" role="status" aria-busy="true"><span className="sec-wait__ring" aria-hidden="true"><Fingerprint size={16} /></span><p>{wording.waiting}<small>Confirm in the browser's prompt to save "{passkey.name}". Cancel there to stop.</small></p></div>
      : !isSupported()
        ? <p className="sec-note">This browser cannot save a passkey. Use a current Safari, Chrome, Edge or Firefox.</p>
        : (
          <form className="sec-add" onSubmit={addDevice} noValidate>
            <label htmlFor="sec-device">Name for this device</label>
            <div className="sec-add__row">
              <input ref={addDeviceRef} id="sec-device" type="text" maxLength={DEVICE_NAME_MAX} autoComplete="off" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} aria-invalid={passkey.error ? 'true' : undefined} aria-describedby={passkey.error ? 'sec-device-err' : undefined} />
              <button type="submit" className="voyage-bar__button voyage-bar__button--primary"><Fingerprint size={15} aria-hidden="true" /><span>Add this device</span></button>
            </div>
            {passkey.error && <p className="field__error" id="sec-device-err" role="alert"><AlertCircle size={14} aria-hidden="true" />{passkey.error}</p>}
          </form>
        );

  const passkeysPane = (
    <Pane id="sec-passkeys" title="Passkeys">
      <p className="sec-note">On a device with a passkey, sign-in asks for your fingerprint, face or device PIN instead of the code. The authenticator app above stays as the fallback.</p>
      {passkeys.length
        ? (
          <ul className="sec-list">
            {passkeys.map((row) => (
              <li key={row.id} className="sec-row" data-testid="sec-passkey">
                <span className="sec-row__icon" aria-hidden="true"><Fingerprint size={18} /></span>
                <div className="sec-row__text">
                  <span className="sec-row__name">{row.device_name}{isLocalhostPasskey(row) && <span className="sec-tag" title={LOCALHOST_TITLE}>localhost</span>}</span>
                  <span className="sec-row__meta">Added {formatDay(row.created_at)}. {row.last_used_at ? `Last used ${formatDay(row.last_used_at)}` : 'Not used yet'}</span>
                </div>
                <div className="sec-row__act">
                  <button type="button" className="voyage-bar__button" onClick={() => askRemovePasskey(row)} disabled={removing} aria-label={`Remove ${row.device_name}`}><Trash2 size={15} aria-hidden="true" /><span>Remove</span></button>
                </div>
              </li>
            ))}
          </ul>
        )
        : <p className="sec-note"><b>No passkeys yet.</b> Every sign-in asks for the six-digit code.</p>}
      {passkey.phase === 'added' && <div className="sec-banner sec-banner--ok" role="status"><Check size={16} aria-hidden="true" /><p>{passkeyAddedText(passkey.name, detectPasskeyDevice(nav))}</p></div>}
      {passkeyAdd}
    </Pane>
  );

  const told = describeSession(session, { passkeys });
  const sessionPane = (
    <Pane id="sec-session" title="This session">
      <dl className="sec-facts">
        <div><dt>Second step</dt>{told.passed
          ? <dd><span className="sec-ok"><ShieldCheck size={16} aria-hidden="true" />Both steps passed</span>{told.route && <span>{told.route}</span>}<small>Assurance level 2. Content changes are accepted.</small></dd>
          : <dd><span className="sec-warn"><TriangleAlert size={16} aria-hidden="true" />One step only</span><small>{levelOneNote(told.firstStep)} Content changes are refused at this level.</small></dd>}
        </div>
        {told.signedIn && <div><dt>Signed in</dt><dd>{told.signedIn.text}<small>{told.signedIn.ago}</small></dd></div>}
        <div><dt>Stays signed in</dt><dd>In this browser until you sign out{told.renews ? `; the session renews itself ${told.renews}` : ''}<small>Closes when you sign out here or everywhere</small></dd></div>
        <div><dt>This device</dt><dd>{deviceText(nav, platform)}</dd></div>
      </dl>
      {leaveError && <div className="deck__error" role="alert"><AlertCircle size={18} aria-hidden="true" /><p>{leaveError}</p></div>}
      <div className="sec-actions">
        <button type="button" className="voyage-bar__button" onClick={everywhere} disabled={leaving} aria-describedby="sec-everywhere"><LogOut size={15} aria-hidden="true" /><span>{leaving ? 'Signing out everywhere' : 'Sign out everywhere'}</span></button>
      </div>
      <p className="sec-note" id="sec-everywhere">Ends this session and every other browser or device signed in as you.</p>
    </Pane>
  );

  const firstSessionPane = (
    <Pane id="sec-session" title="This session">
      <dl className="sec-facts">
        <div><dt>Second step</dt><dd><span className="sec-warn"><TriangleAlert size={16} aria-hidden="true" />Not set up</span><small>{levelOneNote(told.firstStep)}</small></dd></div>
        {told.signedIn && <div><dt>Signed in</dt><dd>{told.signedIn.text}</dd></div>}
      </dl>
    </Pane>
  );

  const alertsPane = (
    <Pane id="sec-alerts" title="Wrong-address alerts">
      <p className="sec-note">When someone tries to sign in with any other email address or Google account, you get an email: at most one every 30 minutes, with the number of attempts. The address tried is masked.</p>
      <p className="sec-note"><b>Not listed here.</b> The site keeps only a counter for that limit, not a log, so there is nothing to show without storing more.</p>
    </Pane>
  );

  const recoveryPane = (
    <Pane id="sec-recovery" title="If you lose your phone">
      <ol className="sec-note sec-steps-list">
        <li>Re-add the app on a new phone with the setup key saved in your password manager.</li>
        <li>No key: sign in with a backup app or a passkey, then remove the lost phone here.</li>
        <li>Neither: remove the factors with the Supabase admin command in the project notes, then enrol again.</li>
      </ol>
    </Pane>
  );

  let body;
  if (state === 'loading') {
    body = (
      <div className="sec-grid">
        <div className="sec-col">
          <Pane id="sec-l1" title="Authenticator apps"><Skel h={18} /><Skel h={56} /><Skel h={56} /><p className="sec-note" role="status">Reading your authenticators.</p></Pane>
          <Pane id="sec-l2" title="Passkeys"><Skel h={56} /></Pane>
        </div>
        <div className="sec-col"><Pane id="sec-l3" title="This session"><Skel h={120} /></Pane></div>
      </div>
    );
  } else if (state === 'error') {
    body = (
      <div className="deck__error" role="alert">
        <AlertCircle size={18} aria-hidden="true" /><p>{READ_FAILED}</p>
        <button type="button" className="voyage-bar__button" onClick={() => load()}><RefreshCw size={15} aria-hidden="true" /><span>Try again</span></button>
      </div>
    );
  } else if (state === 'first') {
    body = (
      <>
        <div className="sec-banner sec-banner--warn" role="status"><TriangleAlert size={16} aria-hidden="true" /><p><b>Set up an authenticator app to open the rest of the admin.</b> Until one is confirmed, every other chapter shows only this request, and content changes are refused.</p></div>
        <div className="sec-grid">
          <div className="sec-col">{appsPane}{recoveryPane}</div>
          <div className="sec-col">{firstSessionPane}{passkeysPane}</div>
        </div>
      </>
    );
  } else {
    body = (
      <div className="sec-grid">
        <div className="sec-col">{appsPane}{passkeysPane}</div>
        <div className="sec-col">{sessionPane}{alertsPane}{recoveryPane}</div>
      </div>
    );
  }

  return (
    <div ref={chapterRef} className="sec" data-testid="security-chapter" data-state={state} aria-busy={state === 'loading' ? 'true' : undefined}>
      {body}
      <SecurityAddAppDialog open={adding} appCount={apps.length} onClose={() => setAdding(false)} onActivated={onActivated} returnTo={returnFocus} />
      <ConfirmDialog
        open={Boolean(confirm)} title={confirm?.title} body={confirm?.body} more={confirm?.more} confirmLabel={confirm?.confirm}
        tone="danger" confirmIcon={Trash2} className="sec-confirm" trapFocus initialFocus="cancel" returnTo={returnFocus} busy={removing}
        onConfirm={doRemove} onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
