// src/components/admin/AdminWelcome/AdminWelcome.js

import React, { useState, useEffect } from 'react';
import AdminDashboard from '../AdminDashboard/AdminDashboard';
import './AdminWelcome.css';

const AdminWelcome = () => {
  
  // Animation sequence states
  const [currentScene, setCurrentScene] = useState('developer'); // developer -> loading -> dashboard
  const [typedText, setTypedText] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  const fullText = "Welcome to Admin Dashboard";

  // Scene 1: Developer typing animation + typewriter effect
  useEffect(() => {
    if (currentScene === 'developer') {
      // Start typing after 2 seconds (let developer animation settle)
      const typingDelay = setTimeout(() => {
        let currentIndex = 0;
        
        const typeInterval = setInterval(() => {
          if (currentIndex <= fullText.length) {
            setTypedText(fullText.slice(0, currentIndex));
            currentIndex++;
          } else {
            clearInterval(typeInterval);
            
            // Wait 1 second after typing completes, then fade out
            setTimeout(() => {
              setCurrentScene('loading');
            }, 1000);
          }
        }, 100); // 100ms per character

        return () => clearInterval(typeInterval);
      }, 2000);

      return () => clearTimeout(typingDelay);
    }
  }, [currentScene, fullText]);

  // Cursor blinking effect
  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 500);

    return () => clearInterval(cursorInterval);
  }, []);

  // Scene 2: Loading sequence 0-100%
  useEffect(() => {
    if (currentScene === 'loading') {
      let progress = 0;
      const loadingInterval = setInterval(() => {
        progress += Math.random() * 8 + 2; // Random increment 2-10
        
        if (progress >= 100) {
          progress = 100;
          setLoadingProgress(100);
          clearInterval(loadingInterval);
          
          // Wait 500ms at 100%, then show dashboard
          setTimeout(() => {
            setCurrentScene('dashboard');
          }, 500);
        } else {
          setLoadingProgress(progress);
        }
      }, 80); // Update every 80ms

      return () => clearInterval(loadingInterval);
    }
  }, [currentScene]);

  // Scene 3: Show final dashboard
  if (currentScene === 'dashboard') {
    return <AdminDashboard />;
  }

  return (
    <div className="admin-welcome">
      {/* Animated Background */}
      <div className="welcome-background">
        <div className="floating-orb orb-1"></div>
        <div className="floating-orb orb-2"></div>
        <div className="floating-orb orb-3"></div>
        <div className="welcome-grid"></div>
      </div>

      {/* Scene 1: Developer Animation */}
      {currentScene === 'developer' && (
        <div className="developer-scene animate-fade-in">
          <div className="scene-container">
            {/* Developer Character */}
            <div className="developer-character">
              <div className="developer-body">
                <div className="developer-head"></div>
                <div className="developer-torso"></div>
                <div className="developer-arm developer-arm-left"></div>
                <div className="developer-arm developer-arm-right typing-arm"></div>
              </div>
            </div>

            {/* Computer Setup */}
            <div className="computer-setup">
              <div className="computer-monitor">
                <div className="monitor-screen">
                  <div className="screen-glow"></div>
                  <div className="terminal-window">
                    <div className="terminal-header">
                      <div className="terminal-buttons">
                        <span className="btn-close"></span>
                        <span className="btn-minimize"></span>
                        <span className="btn-maximize"></span>
                      </div>
                      <div className="terminal-title">RC Portfolio Admin</div>
                    </div>
                    <div className="terminal-content">
                      <div className="terminal-line">
                        <span className="terminal-prompt">admin@rcportfolio:~$</span>
                        <span className="terminal-command"> ./login</span>
                      </div>
                      <div className="terminal-line">
                        <span className="login-success">✅ Authentication successful</span>
                      </div>
                      <div className="terminal-line">
                        <span className="loading-dots">Initializing dashboard...</span>
                      </div>
                      <div className="terminal-line welcome-text-line">
                        <span className="typed-text">{typedText}</span>
                        <span className={`cursor ${showCursor ? 'visible' : 'hidden'}`}>|</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="computer-base"></div>
              <div className="keyboard"></div>
            </div>

            {/* Welcome Message Display */}
            <div className="welcome-message">
              <h1 className="welcome-title">
                Hello, <span className="user-name">{'RC'}</span>!
              </h1>
              <p className="welcome-subtitle">Preparing your admin dashboard...</p>
            </div>
          </div>
        </div>
      )}

      {/* Scene 2: Loading Screen */}
      {currentScene === 'loading' && (
        <div className="loading-scene animate-fade-in">
          <div className="loading-container">
            {/* Logo */}
            <div className="loading-logo">
              <img src="/logo.png" alt="RC Portfolio" className="logo-image" />
              <h2 className="loading-brand">RC Portfolio Admin</h2>
            </div>

            {/* Loading Progress */}
            <div className="loading-progress-section">
              <div className="progress-text">
                <span className="loading-label">Loading Dashboard...</span>
                <span className="progress-percentage">{Math.round(loadingProgress)}%</span>
              </div>
              
              <div className="progress-bar-container">
                <div className="progress-bar-background">
                  <div 
                    className="progress-bar-fill"
                    style={{ width: `${loadingProgress}%` }}
                  ></div>
                  <div className="progress-bar-glow"></div>
                </div>
              </div>

              {/* Loading Status Messages */}
              <div className="loading-status">
                {loadingProgress < 20 && <span>Connecting to admin panel...</span>}
                {loadingProgress >= 20 && loadingProgress < 40 && <span>Loading user preferences...</span>}
                {loadingProgress >= 40 && loadingProgress < 60 && <span>Preparing content management...</span>}
                {loadingProgress >= 60 && loadingProgress < 80 && <span>Initializing dashboard modules...</span>}
                {loadingProgress >= 80 && loadingProgress < 100 && <span>Finalizing setup...</span>}
                {loadingProgress >= 100 && <span>Welcome to your dashboard!</span>}
              </div>
            </div>

            {/* Loading Particles */}
            <div className="loading-particles">
              <div className="particle particle-1"></div>
              <div className="particle particle-2"></div>
              <div className="particle particle-3"></div>
              <div className="particle particle-4"></div>
              <div className="particle particle-5"></div>
              <div className="particle particle-6"></div>
            </div>

            {/* Creative Elements */}
            <div className="loading-decorations">
              <div className="decoration-ring ring-1"></div>
              <div className="decoration-ring ring-2"></div>
              <div className="decoration-ring ring-3"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminWelcome;