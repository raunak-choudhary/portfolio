// src/components/admin/AdminLogin/PreflightControls.js
//
// Small pieces shared by the login screens: the masked one-time-code field,
// the message lines, and Google's "G" mark. Kept in one file because each is
// a few lines and they only make sense on these screens.

import React, { forwardRef, useState } from 'react';
import { ONE_TIME_CODE_LENGTH, sanitizeCodeInput } from '../../../services/authService';

/**
 * A six-digit code input. Hidden by default (the code is a secret while it
 * is valid) with a toggle to reveal it. `autocomplete="one-time-code"` and a
 * numeric keypad let phones and password managers fill it from an SMS-style
 * suggestion or an authenticator extension.
 */
export const CodeField = forwardRef(function CodeField({ id, label, value, onChange, disabled, describedBy }, ref) {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="preflight-field">
      <label htmlFor={id} className="preflight-field__label">{label}</label>
      <div className="preflight-field__box">
        <input
          ref={ref}
          id={id}
          name={id}
          type={reveal ? 'text' : 'password'}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={ONE_TIME_CODE_LENGTH}
          className="preflight-field__input preflight-field__input--code"
          placeholder={'0'.repeat(ONE_TIME_CODE_LENGTH)}
          value={value}
          onChange={(event) => onChange(sanitizeCodeInput(event.target.value))}
          disabled={disabled}
          aria-describedby={describedBy}
          spellCheck={false}
        />
        <button
          type="button"
          className="preflight-field__reveal"
          onClick={() => setReveal((shown) => !shown)}
          aria-label={reveal ? 'Hide the code' : 'Show the code'}
          aria-pressed={reveal}
          disabled={disabled}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {!reveal && <path d="M4 4l16 16" />}
          </svg>
        </button>
      </div>
    </div>
  );
});

/** An error line: danger colour plus an icon and words, never colour alone. */
export const ErrorLine = ({ children }) => (
  <div className="preflight-msg preflight-msg--error" role="alert">
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="10" cy="10" r="8" />
      <path d="M10 5.8v5" />
      <path d="M10 14.2v.01" strokeWidth="2.4" />
    </svg>
    <p>{children}</p>
  </div>
);

/** A neutral status line, read out politely. */
export const NoticeLine = ({ children }) => (
  <div className="preflight-msg preflight-msg--notice" role="status">
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 10.5l3.5 3.2 7.5-8" />
    </svg>
    <p>{children}</p>
  </div>
);

/** A key-and-person mark for "Use passkey", drawn in the button's own colour. */
export const PasskeyMark = () => (
  <svg className="preflight-passkey__mark" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="7" r="3.5" />
    <path d="M2.5 20v-1.5A5.5 5.5 0 0 1 8 13h2.5" />
    <circle cx="17" cy="13.5" r="2.5" />
    <path d="M17 16v5.5l1.6-1.2M17 19h1.8" />
  </svg>
);

/** Google's standard four-colour "G", as their sign-in branding guidance asks; inline so no request leaves the page. */
export const GoogleMark = () => (
  <svg className="preflight-google__mark" viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);
