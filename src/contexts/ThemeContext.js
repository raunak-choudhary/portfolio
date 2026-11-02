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
  // Default to dark theme as per requirements
  const [theme, setTheme] = useState('dark');

  // Initialize theme from localStorage or default to dark
  useEffect(() => {
    const savedTheme = localStorage.getItem('portfolio-theme');
    if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
      setTheme(savedTheme);
    } else {
      // Set default to dark theme
      setTheme('dark');
      localStorage.setItem('portfolio-theme', 'dark');
    }
  }, []);

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