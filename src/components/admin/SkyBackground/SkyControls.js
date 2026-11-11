// src/components/admin/SkyBackground/SkyControls.js
//
// The "Sky" button in the dashboard header and the small panel it opens:
// theme (auto, night, day), the drawings, clouds, motion and panel toggles,
// and the glass and blur sliders. Everything a demo needs, one click away,
// and out of the way the rest of the time.

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BLUR_RANGE, GLASS_RANGE, moonPhase } from './skyModel';
import { useSkySettings } from './SkySettingsContext';
import './SkyControls.css';

const THEME_MODES = [
  { value: 'auto', label: 'Auto', hint: 'Follows the New York clock' },
  { value: 'dark', label: 'Night', hint: 'Night sky' },
  { value: 'light', label: 'Day', hint: 'Day sky' },
];

const TOGGLES = [
  { key: 'drawings', label: 'Drawings', hint: 'The 1824 atlas figures behind the stars' },
  { key: 'clouds', label: 'Clouds', hint: 'Drifting cumulus' },
  { key: 'motion', label: 'Motion', hint: 'Figures drawing themselves, twinkle, the living Sun' },
  { key: 'panels', label: 'Panels', hint: 'Hide the panels to see the whole sky' },
];

/** One line of sky facts for the foot of the panel. */
export function describeSky(resolvedTheme, date = new Date()) {
  const { lit, waxing } = moonPhase(date);
  const moon = `Moon ${Math.round(lit * 100)}% ${waxing ? 'waxing' : 'waning'}`;
  return `${resolvedTheme === 'light' ? 'Day' : 'Night'} over New York · ${moon}`;
}

export default function SkyControls() {
  const { settings, update, reset, resolvedTheme, reducedMotion } = useSkySettings();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ top: 88, right: 16 });
  const rootRef = useRef(null), panelRef = useRef(null);
  const panelId = useId();

  // The header clips its children (it scrolls sideways on narrow screens and its backdrop filter makes it a
  // containing block), so the panel is rendered into <body> and placed under the button by measurement.
  const place = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ top: Math.round(rect.bottom + 10), right: Math.max(12, Math.round(window.innerWidth - rect.right)) });
  };
  const toggle = () => { if (!open) place(); setOpen((v) => !v); };

  // Close on Escape or a click outside; follow the button when the window changes.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    const onPointer = (event) => {
      const inButton = rootRef.current?.contains(event.target), inPanel = panelRef.current?.contains(event.target);
      if (!inButton && !inPanel) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', place);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer); window.removeEventListener('resize', place); };
  }, [open]);

  return (
    <div className="sky-controls" ref={rootRef}>
      <button
        type="button"
        className={`sky-controls__button${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        title="Sky and glass settings"
        onClick={toggle}
      >
        <span className="sky-controls__icon" aria-hidden="true">{resolvedTheme === 'light' ? '☀' : '☾'}</span>
        <span className="sky-controls__label">Sky</span>
      </button>

      {open && createPortal(
        <div
          className="sky-controls__panel"
          id={panelId}
          role="dialog"
          aria-label="Sky settings"
          ref={panelRef}
          style={{ '--sky-panel-top': `${anchor.top}px`, '--sky-panel-right': `${anchor.right}px` }}
        >
          <div className="sky-controls__group" role="group" aria-label="Theme">
            <span className="sky-controls__heading">Theme</span>
            <div className="sky-controls__segments">
              {THEME_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={`sky-controls__segment${settings.themeMode === mode.value ? ' is-active' : ''}`}
                  aria-pressed={settings.themeMode === mode.value}
                  title={mode.hint}
                  onClick={() => update({ themeMode: mode.value })}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className="sky-controls__group" role="group" aria-label="Layers">
            {TOGGLES.map((toggle) => (
              <label key={toggle.key} className="sky-controls__toggle" title={toggle.hint}>
                <span>{toggle.label}</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={settings[toggle.key]}
                  aria-checked={settings[toggle.key]}
                  onChange={(event) => update({ [toggle.key]: event.target.checked })}
                />
                <span className="sky-controls__switch" aria-hidden="true" />
              </label>
            ))}
            {reducedMotion && settings.motion && (
              <p className="sky-controls__note">Your system asks for less motion, so the sky holds still.</p>
            )}
          </div>

          <div className="sky-controls__group" role="group" aria-label="Glass">
            <label className="sky-controls__slider">
              <span>Glass <output>{settings.glass.toFixed(2)}</output></span>
              <input
                type="range"
                min={GLASS_RANGE.min}
                max={GLASS_RANGE.max}
                step="0.01"
                value={settings.glass}
                aria-label="Panel opacity"
                onChange={(event) => update({ glass: Number(event.target.value) })}
              />
            </label>
            <label className="sky-controls__slider">
              <span>Blur <output>{settings.blur}px</output></span>
              <input
                type="range"
                min={BLUR_RANGE.min}
                max={BLUR_RANGE.max}
                step="1"
                value={settings.blur}
                aria-label="Panel blur"
                onChange={(event) => update({ blur: Number(event.target.value) })}
              />
            </label>
          </div>

          <div className="sky-controls__foot">
            <span className="sky-controls__facts">{describeSky(resolvedTheme)}</span>
            <button type="button" className="sky-controls__reset" onClick={reset}>Reset</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
