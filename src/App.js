// src/App.js - PRODUCTION VERSION WITH VISITOR TRACKING

import React, { useEffect } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import AppRouter from './Router';
import './styles/globals.css';
import { AuthProvider } from './contexts/AuthContext';
import { viewportUtils } from './utils/viewportUtils';

// 🔐 PRODUCTION: Import encryption system (no test files)
import routeEncoder from './utils/routeEncoder';
import routeNavigation from './utils/routeNavigation';

// 📊 VISITOR TRACKING: Import visitor tracking service
import visitorTrackingService from './services/visitorTrackingService';

function App() {
  // 📊 NEW: Initialize visitor tracking
  useEffect(() => {
    // Initialize visitor tracking for real analytics
    try {
      visitorTrackingService.initializeVisitorTracking();
      console.log('📊 Visitor tracking initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing visitor tracking:', error);
    }
  }, []);

  // 🔐 Initialize encryption system (production version)
  useEffect(() => {
    // Make encryption system available for internal use
    if (typeof window !== 'undefined') {
      window.routeEncoder = routeEncoder;
      window.routeNavigation = routeNavigation;
      
      // Initialize encryption system silently in production
      try {
        console.log('🔐 Admin security system initialized');
        
        // Initialize admin routes if not already done
        const routes = routeEncoder.getStoredAdminRoutes();
        
        // Only log in development
        if (process.env.NODE_ENV === 'development') {
          console.log('📍 Admin routes ready:', routes);
        }
        
      } catch (error) {
        // Silent fallback in production
        if (process.env.NODE_ENV === 'development') {
          console.error('❌ Encryption system error:', error);
        }
      }
    }
  }, []);

  // Add viewport fixes
  useEffect(() => {
    viewportUtils.init();
    
    const timer = setTimeout(() => {
      viewportUtils.reset();
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);

  // Handle production environment detection
  useEffect(() => {
    const isProduction = window.location.hostname !== 'localhost' && 
                        !window.location.hostname.includes('127.0.0.1') &&
                        !window.location.hostname.includes('local');
    
    if (isProduction) {
      document.documentElement.classList.add('production-environment');
      document.body.classList.add('production-environment');
      
      const applyProductionFixes = () => {
        const html = document.documentElement;
        const body = document.body;
        
        html.style.setProperty('zoom', '1', 'important');
        html.style.setProperty('transform', 'scale(1)', 'important');
        html.style.setProperty('font-size', '16px', 'important');
        
        body.style.setProperty('zoom', '1', 'important');
        body.style.setProperty('transform', 'scale(1)', 'important');
        body.style.setProperty('font-size', '16px', 'important');
      };
      
      applyProductionFixes();
      setTimeout(applyProductionFixes, 500);
    }
  }, []);

  return (
    <ErrorBoundary fallbackMessage="Something went wrong with the portfolio. Please refresh the page.">
      <ThemeProvider>
        <AuthProvider>
          <Router>
            <div className="App">
              <AppRouter />
            </div>
          </Router>
        </AuthProvider> 
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;