// src/contexts/ThemeContext.js

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  // The saved preference is read when the state is created (not in a mount
  // effect) so the first paint already has the right theme and nothing set by
  // a child provider, such as the admin sky's day and night switch, is overridden.
  const [theme, setTheme] = useState(() => {
    try {
      const savedTheme = localStorage.getItem('portfolio-theme');
      return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'dark';
    } catch {
      return 'dark';
    }
  });

  // Whether the current theme is the visitor's own choice. The admin sky sets
  // the theme from the New York clock with `{ persist: false }`; that must not
  // overwrite the preference the public site remembers.
  const persistRef = useRef(true);

  // Apply the theme to the document before the browser paints, so a theme
  // set during the first commit (the admin sky follows the New York clock and
  // does not use the saved preference) never shows one frame of the other
  // palette. The colours come from [data-theme] selectors on these elements.
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  // Store the preference. Storage can be blocked or full (private windows,
  // site data switched off); the theme then simply is not remembered. An
  // exception thrown here, inside an effect, would unmount the whole app.
  useEffect(() => {
    if (!persistRef.current) return;
    try {
      localStorage.setItem('portfolio-theme', theme);
    } catch {
      /* not remembered */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    persistRef.current = true;
    setTheme(prevTheme => prevTheme === 'dark' ? 'light' : 'dark');
  }, []);

  /** @param {{ persist?: boolean }} [options] persist false applies the theme without remembering it. */
  const setDarkTheme = useCallback(({ persist = true } = {}) => {
    persistRef.current = persist !== false;
    setTheme('dark');
  }, []);

  /** @param {{ persist?: boolean }} [options] persist false applies the theme without remembering it. */
  const setLightTheme = useCallback(({ persist = true } = {}) => {
    persistRef.current = persist !== false;
    setTheme('light');
  }, []);

  const value = useMemo(() => ({
    theme,
    isDark: theme === 'dark',
    isLight: theme === 'light',
    toggleTheme,
    setDarkTheme,
    setLightTheme,
  }), [theme, toggleTheme, setDarkTheme, setLightTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};