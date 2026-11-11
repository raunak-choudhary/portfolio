// src/components/admin/SkyBackground/SkySettingsContext.js
//
// Settings for the zodiac sky and the glass panels over it, shared between
// the Sky menu in the header and the background renderer. Remembered per
// browser in localStorage (cosmetic values only, validated on the way in).
//
// Theme: in "auto" mode the dashboard follows the New York clock (day sky
// while the Sun is up, night sky otherwise) and pushes the result into the
// site-wide ThemeContext so every panel switches with the sky. "dark" and
// "light" pin it. The check runs once a minute.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, mergeSettings, resolveTheme, sanitizeSettings } from './skyModel';

const SkySettingsContext = createContext(null);

/** How often auto mode re-checks the Sun over New York. */
export const THEME_CHECK_MS = 60 * 1000;

function readStoredSettings(storage) {
  try {
    const raw = storage?.getItem(SETTINGS_STORAGE_KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeStoredSettings(storage, settings) {
  try { storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)); } catch { /* private mode or full storage: the sky still works */ }
}

/** Whether the visitor asked the operating system for less motion. */
function prefersReducedMotion() {
  try { return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/**
 * @param {object} props
 * @param {Storage} [props.storage] injectable for tests; defaults to window.localStorage.
 * @param {() => Date} [props.now] injectable clock for tests.
 */
export function SkySettingsProvider({ children, storage, now = () => new Date() }) {
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  const [settings, setSettings] = useState(() => readStoredSettings(store));
  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(settings.themeMode, now()));
  const [reducedMotion] = useState(prefersReducedMotion);
  const { theme, setDarkTheme, setLightTheme } = useTheme();

  // Follow the clock in auto mode; pinned modes resolve at once.
  useEffect(() => {
    const check = () => setResolvedTheme(resolveTheme(settings.themeMode, now()));
    check();
    if (settings.themeMode !== 'auto') return undefined;
    const timer = setInterval(check, THEME_CHECK_MS);
    return () => clearInterval(timer);
  }, [settings.themeMode, now]);

  // Push the sky's theme into the site theme so panels, text and the sky agree.
  useEffect(() => {
    if (resolvedTheme === theme) return;
    if (resolvedTheme === 'dark') setDarkTheme(); else setLightTheme();
  }, [resolvedTheme, theme, setDarkTheme, setLightTheme]);

  // Persist, and expose the glass values to CSS.
  useEffect(() => {
    writeStoredSettings(store, settings);
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    if (!root) return undefined;
    root.style.setProperty('--sky-glass', String(settings.glass));
    root.style.setProperty('--sky-blur', `${settings.blur}px`);
    return () => { root.style.removeProperty('--sky-glass'); root.style.removeProperty('--sky-blur'); };
  }, [settings, store]);

  const update = useCallback((patch) => setSettings((prev) => mergeSettings(prev, patch)), []);
  const reset = useCallback(() => setSettings({ ...DEFAULT_SETTINGS }), []);

  const value = useMemo(() => ({
    settings,
    update,
    reset,
    resolvedTheme,
    reducedMotion,
    /** Motion the renderer should actually show: the setting, unless the OS asked for less. */
    effectiveMotion: settings.motion && !reducedMotion,
  }), [settings, update, reset, resolvedTheme, reducedMotion]);

  return <SkySettingsContext.Provider value={value}>{children}</SkySettingsContext.Provider>;
}

export function useSkySettings() {
  const context = useContext(SkySettingsContext);
  if (!context) throw new Error('useSkySettings must be used within a SkySettingsProvider');
  return context;
}
