// src/App.js - PRODUCTION VERSION WITH VISITOR TRACKING

import React, { useEffect } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import AppRouter from './Router';
import './styles/globals.css';
import { viewportUtils } from './utils/viewportUtils';

// 📊 VISITOR TRACKING: Import visitor tracking service
import visitorTrackingService from './services/visitorTrackingService';

function App() {
  // Visitor tracking: records the landing page view and starts the engaged
  // clock (once per session). The returned cleanup stops the clock, which
  // keeps React strict mode's mount, unmount, mount from starting two.
  useEffect(() => {
    let stopTracking;
    try {
      stopTracking = visitorTrackingService.initializeVisitorTracking();
    } catch (error) {
      console.error('Error initializing visitor tracking:', error);
    }
    return () => {
      if (typeof stopTracking === 'function') stopTracking();
    };
  }, []);

  // Add viewport fixes
  useEffect(() => {
    viewportUtils.init();
    
    const timer = setTimeout(() => {
      viewportUtils.reset();
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <ErrorBoundary fallbackMessage="Something went wrong with the portfolio. Please refresh the page.">
      <ThemeProvider>
        <Router>
          <div className="App">
            <AppRouter />
          </div>
        </Router>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
