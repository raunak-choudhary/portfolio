// src/components/admin/AdminLogin/PreflightControls.js
//
// Small pieces shared by the login screens: the masked one-time-code field,
// the six-cell code entry of step 02, the message lines, the fingerprint
// mark and Google's "G" mark. Kept in one file because each is a few lines
// and they only make sense on these screens.

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

const EyeIcon = ({ shown }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {!shown && <path d="M4 4l16 16" />}
  </svg>
);

/**
 * Step 02's code entry: six drawn cells over one real input. The input is
 * transparent, not hidden, so typing, paste, iOS one-time-code suggestions
 * and password managers all reach a single labelled field; the cells are
 * aria-hidden and only show what it holds. Masked by default (dots), with
 * the same Show/Hide toggle as CodeField. `attempt` remounts the row so the
 * shake after a wrong code plays once per attempt.
 */
export const CodeCells = forwardRef(function CodeCells(
  { id, label, value, onChange, disabled, checking, invalid, describedBy, attempt = 0 },
  ref
) {
  const [reveal, setReveal] = useState(false);
  const next = Math.min(value.length, ONE_TIME_CODE_LENGTH - 1);
  const cells = [];
  for (let index = 0; index < ONE_TIME_CODE_LENGTH; index += 1) {
    const digit = value[index];
    let content = null;
    if (digit !== undefined) content = reveal ? digit : <span className="preflight-cell__dot" />;
    const isNext = index === next && value.length < ONE_TIME_CODE_LENGTH;
    cells.push(<span key={index} className={`preflight-cell${isNext ? ' preflight-cell--next' : ''}`}>{content}</span>);
    if (index === ONE_TIME_CODE_LENGTH / 2 - 1) cells.push(<span key="gap" className="preflight-cells__gap" />);
  }
  const classes = ['preflight-cells'];
  if (invalid) classes.push('preflight-cells--wrong');
  if (checking) classes.push('preflight-cells--checking');
  if (value.length === ONE_TIME_CODE_LENGTH) classes.push('preflight-cells--full');
  return (
    <div className={classes.join(' ')}>
      <div className="preflight-cells__head">
        <label htmlFor={id} className="preflight-field__label">{label}</label>
        <button
          type="button"
          className="preflight-reveal"
          onClick={() => setReveal((shown) => !shown)}
          aria-pressed={reveal}
          aria-controls={id}
          disabled={disabled}
        >
          <EyeIcon shown={reveal} />
          <span>{reveal ? 'Hide' : 'Show'}</span>
          <span className="visually-hidden"> the code</span>
        </button>
      </div>
      <div className="preflight-cells__box">
        <input
          ref={ref}
          id={id}
          name={id}
          type={reveal ? 'text' : 'password'}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={ONE_TIME_CODE_LENGTH}
          className="preflight-cells__input"
          value={value}
          onChange={(event) => onChange(sanitizeCodeInput(event.target.value))}
          disabled={disabled}
          readOnly={checking}
          aria-busy={checking || undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          spellCheck={false}
        />
        <div key={attempt} className="preflight-cells__row" aria-hidden="true">{cells}</div>
      </div>
    </div>
  );
});

/** A calm status line: an information mark and words, no box (a closed prompt is not an error). */
export const CalmLine = ({ children }) => (
  <div className="preflight-msg preflight-msg--calm" role="status">
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="10" cy="10" r="8" />
      <path d="M10 9v5" />
      <path d="M10 6.2v.01" strokeWidth="2.2" />
    </svg>
    <p>{children}</p>
  </div>
);

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

/**
 * A fingerprint drawn in thin strokes, the weight of the light step
 * numerals. `size` 22 sits in the unlock ring; 16 goes beside a text link.
 */
export const FingerprintMark = ({ size = 22, className = 'preflight-fingerprint' }) => (
  <svg className={className} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5.2 6.6A8.6 8.6 0 0 1 20.6 12v.6" />
    <path d="M3.4 14.6a8.8 8.8 0 0 1 .4-5.4" />
    <path d="M7.4 18.6A9.5 9.5 0 0 1 6.6 12a5.4 5.4 0 0 1 10.8 0v1.2c0 1.2.4 2.2 1.2 3" />
    <path d="M12 12v1.6c0 3 1 5.6 2.8 7.6" />
    <path d="M9 12a3 3 0 0 1 6 0v1.4c0 1.4-.1 2.4.4 3.9" />
    <path d="M9.2 15.4c.2 2.4 1 4.6 2.2 6.2" />
    <path d="M20.4 16.4c-.2.9-.4 1.6-.8 2.4" />
  </svg>
);

/** A small keypad mark for "Use a code instead". */
export const KeypadMark = () => (
  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2.5" y="6" width="15" height="8" rx="2" />
    <path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01" strokeWidth="2" />
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
