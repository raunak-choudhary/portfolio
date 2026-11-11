// src/contexts/ThemeContext.js

import React, { createContext, useContext, useState, useEffect } from 'react';

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

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    
    // Store theme preference
    localStorage.setItem('portfolio-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'dark' ? 'light' : 'dark');
  };

  const setDarkTheme = () => {
    setTheme('dark');
  };

  const setLightTheme = () => {
    setTheme('light');
  };

  const isDark = theme === 'dark';
  const isLight = theme === 'light';

  const value = {
    theme,
    isDark,
    isLight,
    toggleTheme,
    setDarkTheme,
    setLightTheme
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};