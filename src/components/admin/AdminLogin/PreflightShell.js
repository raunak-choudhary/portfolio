// src/components/admin/AdminLogin/PreflightShell.js
//
// The frame every login screen shares: the night sky, one glass panel with
// the RC · ADMIN wordmark, the pre-flight checklist (01 Identity, 02 Second
// key, 03 Launch) and the readout of true facts. The current step is lit and
// holds the screen's controls; done steps show a check and an optional
// summary; later steps wait, dimmed. When `launching` is set the panel steps
// back and the page goes to black, so the Matrix entry that follows starts
// from the same black without a flash.

import React, { useEffect, useState } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import PreflightSky from './PreflightSky';
import { STEPS, readoutParts, stepState } from './preflightModel';
import './Preflight.css';

const FONT_URL = `${process.env.PUBLIC_URL || ''}/admin/fonts/oswald-variable.woff2`;
let fontRequested = false;

/**
 * Registers the self-hosted Oswald face (OFL, public/admin/fonts) once. It is
 * loaded with the FontFace API because a CSS url() to /admin/fonts makes the
 * CRA build try to bundle the file. Without the API the fallback stack is used.
 */
export function loadCondensedFont() {
  if (fontRequested || typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined') return;
  fontRequested = true;
  try {
    const face = new FontFace('Oswald', `url(${FONT_URL}) format('woff2')`, { weight: '200 700', display: 'swap' });
    face.load().then((loaded) => document.fonts.add(loaded)).catch(() => {});
  } catch { /* fallback fonts */ }
}

/** Re-reads the clock and the Moon every 20 seconds so the minute never lags long. */
const READOUT_REFRESH_MS = 20000;

const Check = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8.5l3.2 3L13 4.5" />
  </svg>
);

/** One readout line in small mono caps; the parts are joined with a thin rule so no glyph separators are read aloud. */
export const Readout = ({ now }) => {
  const [date, setDate] = useState(() => now || new Date());
  useEffect(() => {
    if (now) return undefined;
    const timer = setInterval(() => setDate(new Date()), READOUT_REFRESH_MS);
    return () => clearInterval(timer);
  }, [now]);
  const parts = readoutParts(now || date);
  return (
    <p className="preflight-readout">
      {parts.map((part, index) => (
        <span key={part} className="preflight-readout__part">
          {index > 0 && <span className="preflight-readout__rule" aria-hidden="true" />}
          {part}
        </span>
      ))}
    </p>
  );
};

/**
 * @param {object} props
 * @param {'identity'|'second'|'launch'} props.current the lit step.
 * @param {React.ReactNode} props.children the lit step's controls.
 * @param {Object<string,string>} [props.summaries] one short line under a done step, by step id.
 * @param {boolean} [props.launching] true while handing off to the entry.
 * @param {Date} [props.now] fixed time for tests and stills.
 */
const PreflightShell = ({ current, children, summaries = {}, launching = false, now }) => {
  const { theme } = useTheme();
  useEffect(() => { loadCondensedFont(); }, []);

  return (
    <div className={`preflight${launching ? ' preflight--launching' : ''}`}>
      <PreflightSky palette={theme === 'light' ? 'dawn' : 'night'} />

      <div className="preflight__scroll">
        <section className="preflight-panel" aria-labelledby="preflight-title">
          <header className="preflight-panel__head">
            <h1 id="preflight-title" className="preflight-wordmark">
              <span>RC</span>
              <span className="preflight-wordmark__dot" aria-hidden="true">·</span>
              <span>ADMIN</span>
              <span className="visually-hidden">, sign in</span>
            </h1>
          </header>

          <ol className="preflight-steps">
            {STEPS.map((step) => {
              const state = stepState(step.id, current);
              return (
                <li
                  key={step.id}
                  className={`preflight-step preflight-step--${state}`}
                  data-step={step.id}
                  aria-current={state === 'current' ? 'step' : undefined}
                >
                  <span className="preflight-step__num" aria-hidden="true">{step.numeral}</span>
                  <div className="preflight-step__main">
                    <h2 className="preflight-step__label">
                      <span className="visually-hidden">Step {Number(step.numeral)}: </span>
                      {step.label}
                      {state === 'done' && (
                        <span className="preflight-step__check">
                          <Check />
                          <span className="visually-hidden"> (done)</span>
                        </span>
                      )}
                    </h2>
                    {state === 'done' && summaries[step.id] && (
                      <p className="preflight-step__summary">{summaries[step.id]}</p>
                    )}
                    {state === 'current' && <div className="preflight-step__body">{children}</div>}
                  </div>
                </li>
              );
            })}
          </ol>

          <footer className="preflight-panel__foot">
            <Readout now={now} />
          </footer>
        </section>
      </div>

      <div className="preflight__blackout" aria-hidden="true" />
    </div>
  );
};

export default PreflightShell;
