// src/components/admin/Voyage/SecurityAddAppDialog.js
//
// "Add an authenticator app" in the Security chapter, in three steps inside
// the shared record dialog frame:
//   1. Name    an optional name, so apps can be told apart later;
//   2. Scan    Supabase's QR code and the setup key (with Copy), and the code
//              the app shows, checked as soon as the sixth digit is in;
//   3. Done    the app is active; the setup key is the owner's to keep.
//
// Nothing changes until the code is confirmed: the factor Supabase creates
// at step 2 stays unverified, and Cancel (or Escape, or closing) removes it
// again. The setup key is shown once and never stored by this code. Every
// failure is one fixed sentence; nothing from the server is shown.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, Copy, Info, ShieldCheck, X } from 'lucide-react';
import {
  ONE_TIME_CODE_LENGTH, enrollTotp, isValidOneTimeCode, removeUnverifiedFactors, sanitizeCodeInput, verifyTotpEnrollment,
} from '../../../services/authService';
import { defaultAppName, groupSecret } from '../Security/securityModel';
import useModalFocus from './useModalFocus';

const STEPS = ['Name', 'Scan and confirm', 'Done'];
const NAME_MAX = 60;

/** The sentence for a code that did not match (the approved mockup's words). */
export const CODE_MISMATCH = 'That code did not match. Codes change every 30 seconds: enter the one showing now. If it keeps failing, check the phone\'s clock is set automatically.';

/** The sentence for a failed check, by authService error code. */
export function codeErrorText(error) {
  if (error?.code === 'MFA_CODE_REJECTED') return CODE_MISMATCH;
  return error?.message || 'The code could not be checked. Try again.';
}

function StepList({ current }) {
  return (
    <ol className="sec-steps" aria-label="Progress">
      {STEPS.map((label, i) => (
        <li key={label} aria-current={i === current ? 'step' : undefined} className={i < current ? 'is-done' : undefined}>
          {i < current ? <Check size={13} aria-hidden="true" /> : null}{label}
        </li>
      ))}
    </ol>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {number} props.appCount apps already enrolled (for the default name).
 * @param {() => void} props.onClose closes the dialog (after any clean-up).
 * @param {(app: {factorId: string, friendlyName: string}) => Promise<void>|void} props.onActivated runs once the code is accepted.
 * @param {() => HTMLElement|null} [props.returnTo] focus target if the opener is gone.
 */
export default function SecurityAddAppDialog({ open, appCount, onClose, onActivated, returnTo }) {
  const [step, setStep] = useState('name');        // 'name' | 'scan' | 'done'
  const [name, setName] = useState('');
  const [pending, setPending] = useState(null);    // { factorId, friendlyName, qrCode, secret }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');          // the step's failure (banner on step 1, field error on step 2)
  const [copied, setCopied] = useState('');        // '' | 'ok' | 'failed'
  const panelRef = useRef(null), codeRef = useRef(null), nameRef = useRef(null), closeRef = useRef(null);
  const checking = useRef(false);

  // A fresh dialog every time it opens.
  useEffect(() => {
    if (!open) return;
    setStep('name'); setName(''); setPending(null); setCode(''); setBusy(false); setError(''); setCopied('');
    checking.current = false;
  }, [open]);

  // Leaving before the code is confirmed removes the half-made factor; after Done there is nothing to clean.
  const close = async () => {
    if (busy) return;
    if (step === 'scan') {
      setBusy(true);
      try { await removeUnverifiedFactors(); } finally { setBusy(false); }
    }
    onClose();
  };

  useModalFocus(open, panelRef, {
    onEscape: () => { close(); },
    initialFocus: () => nameRef.current,
    returnTo,
  });

  // Each step puts focus where the work is.
  useEffect(() => {
    if (!open) return;
    if (step === 'scan') codeRef.current?.focus();
    if (step === 'done') panelRef.current?.querySelector('[data-action="close-done"]')?.focus();
  }, [open, step]);

  const start = async () => {
    setError(''); setBusy(true);
    try {
      await removeUnverifiedFactors();
      const result = await enrollTotp(name.trim() || defaultAppName(appCount));
      if (!result.success) { setError(result.error.message); return; }
      setPending(result.data); setCode(''); setStep('scan');
    } finally { setBusy(false); }
  };

  const check = async (value) => {
    if (!pending || checking.current || !isValidOneTimeCode(value)) return;
    checking.current = true;
    setError(''); setBusy(true);
    try {
      const result = await verifyTotpEnrollment(pending.factorId, value);
      if (!result.success) { setError(codeErrorText(result.error)); setCode(''); codeRef.current?.focus(); return; }
      setStep('done');
      await onActivated({ factorId: pending.factorId, friendlyName: pending.friendlyName });
    } finally { checking.current = false; setBusy(false); }
  };

  const onCode = (event) => {
    const value = sanitizeCodeInput(event.target.value);
    setCode(value);
    if (error) setError('');
    if (value.length === ONE_TIME_CODE_LENGTH) check(value);   // checked as soon as the sixth digit is in
  };

  const copyKey = async () => {
    try { await navigator.clipboard.writeText(pending.secret); setCopied('ok'); } catch { setCopied('failed'); }
  };

  if (!open) return null;
  const current = step === 'name' ? 0 : step === 'scan' ? 1 : 2;
  const appName = pending?.friendlyName || '';

  let body, foot;
  if (step === 'name') {
    body = (
      <div className="sec-enrol sec-enrol--single">
        {error ? <div className="sec-banner sec-banner--bad" role="alert"><AlertCircle size={16} aria-hidden="true" /><p>{error}</p></div> : null}
        <div className="field">
          <div className="field__row"><label htmlFor="sec-app-name">Name this app</label><span className="field__count">{name.length} / {NAME_MAX}</span></div>
          <input ref={nameRef} id="sec-app-name" type="text" maxLength={NAME_MAX} placeholder="iPad, Authy" autoComplete="off" aria-describedby="sec-app-help" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); start(); } }} disabled={busy} />
          <p className="field__help" id="sec-app-help">So you can tell your apps apart later. Optional.</p>
        </div>
        <p className="sec-note">Works with Google Authenticator, Authy, 1Password, or any app that shows six-digit codes. The next step shows a QR code and a setup key.</p>
      </div>
    );
    foot = (
      <>
        <span />
        <div className="record-dialog__actions">
          <button type="button" className="voyage-bar__button voyage-bar__button--quiet" onClick={close} disabled={busy}><span>Cancel</span></button>
          <button type="button" className="voyage-bar__button voyage-bar__button--primary" onClick={start} disabled={busy}><span>{busy ? 'Preparing' : 'Continue'}</span></button>
        </div>
      </>
    );
  } else if (step === 'scan') {
    body = (
      <div className="sec-enrol">
        <div className="sec-qr">{pending.qrCode
          ? <img src={pending.qrCode} alt={`QR code for the authenticator app "${appName}"`} />
          : <p className="sec-qr__missing">The QR code could not be drawn. Type the setup key instead.</p>}</div>
        <div className="sec-key">
          <label htmlFor="sec-key">Or type this setup key</label>
          <code id="sec-key" tabIndex={-1}>{groupSecret(pending.secret)}</code>
          <button type="button" className="voyage-bar__button voyage-bar__button--small" onClick={copyKey} disabled={busy}><Copy size={15} aria-hidden="true" /><span>{copied === 'ok' ? 'Copied' : 'Copy key'}</span></button>
          <span className="sec-sr" role="status">{copied === 'ok' ? 'Setup key copied.' : ''}</span>
          {copied === 'failed' ? <p className="field__error" role="alert"><AlertCircle size={14} aria-hidden="true" />Copy did not work here. Select the key and copy it by hand.</p> : null}
          <p className="sec-note">Save it in your password manager now. It is shown once and never stored by the site.</p>
        </div>
        <div className="sec-code-field">
          <label htmlFor="sec-first">Code the app shows now</label>
          <input
            ref={codeRef} id="sec-first" className="sec-code" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code"
            maxLength={ONE_TIME_CODE_LENGTH} value={code} onChange={onCode} readOnly={busy}
            aria-invalid={error ? 'true' : undefined} aria-describedby={error ? 'sec-first-err' : 'sec-first-help'}
          />
          {error
            ? <p className="field__error" id="sec-first-err" role="alert"><AlertCircle size={14} aria-hidden="true" />{error}</p>
            : <p className="field__help" id="sec-first-help">{busy ? 'Checking the code.' : 'Checked as soon as the sixth digit is in.'}</p>}
        </div>
      </div>
    );
    foot = (
      <>
        <span className="record-dialog__status"><Info size={14} aria-hidden="true" />Nothing changes until the code is confirmed.</span>
        <div className="record-dialog__actions">
          <button type="button" className="voyage-bar__button voyage-bar__button--quiet" onClick={close} disabled={busy}><span>Cancel</span></button>
          <button type="button" className="voyage-bar__button voyage-bar__button--primary" onClick={() => check(code)} disabled={busy || !isValidOneTimeCode(code)}><span>Activate</span></button>
        </div>
      </>
    );
  } else {
    body = (
      <div className="sec-done" role="status">
        <h4><ShieldCheck size={20} aria-hidden="true" />Authenticator active</h4>
        <p>"{appName}" now works at sign-in{appCount > 0 ? ' alongside your other apps' : ''}. If you have not yet, save the setup key in your password manager: it is the only way to re-add this app on a new device.</p>
      </div>
    );
    foot = (
      <>
        <span />
        <div className="record-dialog__actions">
          <button type="button" data-action="close-done" className="voyage-bar__button voyage-bar__button--primary" onClick={onClose}><span>Close</span></button>
        </div>
      </>
    );
  }

  return createPortal(
    <div className="record-backdrop sec-dialog" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={panelRef} className="record-dialog sec-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="sec-dlg-title" data-testid="sec-add-dialog" data-step={step}>
        <header className="record-dialog__head">
          <div className="record-dialog__titles">
            <div className="voyage-chapter__kicker">Security</div>
            <h3 id="sec-dlg-title">Add an authenticator app</h3>
            <StepList current={current} />
          </div>
          <button ref={closeRef} type="button" className="record-dialog__close" aria-label="Close" onClick={close} disabled={busy}><X size={18} /></button>
        </header>
        <div className="record-dialog__body">{body}</div>
        <footer className="record-dialog__foot">{foot}</footer>
      </div>
    </div>,
    document.body,
  );
}
