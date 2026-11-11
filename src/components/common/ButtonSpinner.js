// src/components/common/ButtonSpinner.js
//
// A spinner that fits inside a button: one em, inline, no message, no glow.
// LoadingSpinner is for whole panels and brings its own container and text,
// which is what broke the login buttons' layout.

import React from 'react';
import './ButtonSpinner.css';

/**
 * @param {object} props
 * @param {string} [props.label] accessible name; the visible text beside it usually says the same.
 */
export default function ButtonSpinner({ label = 'Working' }) {
  return <span className="button-spinner" role="status" aria-label={label} />;
}
