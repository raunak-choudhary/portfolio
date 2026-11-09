// src/components/admin/AdminSignOut/AdminSignOut.js - PRODUCTION VERSION

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOutAdmin } from '../../../services/authService';
import './AdminSignOut.css';

const AdminSignOut = () => {
  const navigate = useNavigate();
  
  // Animation states
  const [currentLanguageIndex, setCurrentLanguageIndex] = useState(0);
  const [typedText, setTypedText] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  const [animationPhase, setAnimationPhase] = useState('typing');
  const [showFloatingElements, setShowFloatingElements] = useState(false);

  // Multi-language farewell messages
  const farewellMessages = React.useMemo(() => [
    {
      language: 'Hindi',
      message: 'अलविदा! धन्यवाद!',
      code: 'HI',
      color: '#ff6b35',
      flag: '🇮🇳'
    },
    {
      language: 'Spanish', 
      message: '¡Adiós! ¡Gracias!',
      code: 'ES',
      color: '#e74c3c',
      flag: '🇪🇸'
    },
    {
      language: 'French',
      message: 'Au revoir! Merci!',
      code: 'FR', 
      color: '#3498db',
      flag: '🇫🇷'
    },
    {
      language: 'German',
      message: 'Auf Wiedersehen! Danke!',
      code: 'DE',
      color: '#f39c12',
      flag: '🇩🇪'
    },
    {
      language: 'Japanese',
      message: 'さようなら！ありがとう！',
      code: 'JA',
      color: '#e91e63',
      flag: '🇯🇵'
    },
    {
      language: 'Arabic',
      message: 'وداعا! شكرا لك!',
      code: 'AR',
      color: '#9c27b0',
      flag: '🇸🇦'
    },
    {
      language: 'English',
      message: 'Bye!! Thank You.',
      code: 'EN',
      color: '#00ff88',
      flag: '🇺🇸'
    }
  ], []);

  const currentMessage = farewellMessages[currentLanguageIndex];

  useEffect(() => {
    signOutAdmin();
  }, []);

  // Pace of the farewell. Owner decision 2026-11-09: every language and the
  // floating scene stay, but the whole page must finish within 20 seconds.
  // Seven messages of about 115 characters in total give roughly 16 seconds
  // with these values.
  const LANGUAGE_START_DELAY_MS = 500;
  const TYPE_INTERVAL_MS = 50;
  const LANGUAGE_PAUSE_MS = 700;
  const FLOATING_SCENE_MS = 2000;

  // Scene 1: Developer typing animation + typewriter effect
  useEffect(() => {
    if (animationPhase === 'typing') {
      const typingDelay = setTimeout(() => {
        let currentIndex = 0;
        const message = currentMessage.message;
        
        const typeInterval = setInterval(() => {
          if (currentIndex <= message.length) {
            setTypedText(message.slice(0, currentIndex));
            currentIndex++;
          } else {
            clearInterval(typeInterval);
            
            setTimeout(() => {
              if (currentLanguageIndex < farewellMessages.length - 1) {
                setCurrentLanguageIndex(prev => prev + 1);
                setTypedText('');
              } else {
                setAnimationPhase('floating');
                setShowFloatingElements(true);
                
                setTimeout(() => {
                  setAnimationPhase('complete');

                  // Clean up analytics session
                  try {
                    const analyticsSession = JSON.parse(localStorage.getItem('admin_analytics_session') || '{}');
                    if (analyticsSession.sessionId) {
                      localStorage.removeItem('admin_analytics_session');
                    }
                  } catch (error) {
                    console.warn('Analytics cleanup failed:', error);
                  }

                  navigate('/adminlogin', { replace: true });
                }, FLOATING_SCENE_MS);
              }
            }, LANGUAGE_PAUSE_MS);
          }
        }, TYPE_INTERVAL_MS);

        return () => clearInterval(typeInterval);
      }, LANGUAGE_START_DELAY_MS);

      return () => clearTimeout(typingDelay);
    }
  }, [currentLanguageIndex, animationPhase, currentMessage.message, farewellMessages.length, navigate]);

  // Cursor blinking effect
  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 500);

    return () => clearInterval(cursorInterval);
  }, []);

  return (
    <div className="admin-signout">
      {/* Animated Background */}
      <div className="signout-background">
        <div className="floating-orb orb-1"></div>
        <div className="floating-orb orb-2"></div>
        <div className="floating-orb orb-3"></div>
        <div className="floating-orb orb-4"></div>
        <div className="signout-grid"></div>
        
        {showFloatingElements && (
          <div className="floating-elements">
            <div className="floating-heart">❤️</div>
            <div className="floating-star">⭐</div>
            <div className="floating-wave">👋</div>
            <div className="floating-sparkle">✨</div>
            <div className="floating-smile">😊</div>
            <div className="floating-rocket">🚀</div>
          </div>
        )}
      </div>

      <div className="signout-container">
        <div className="signout-header">
          <div className="signout-logo">
            <img src="/logo.png" alt="RC Portfolio" className="logo-image" />
            <h1 className="signout-title">
              <span className="title-text">RC Portfolio</span>
              <span className="title-admin">Admin</span>
            </h1>
          </div>
        </div>

        <div className="farewell-section">
          <div className="language-progress">
            <div className="progress-text">
              {animationPhase === 'typing' ? (
                <>
                  <span className="current-language">{currentMessage.language}</span>
                  <span className="language-code">({currentMessage.code})</span>
                </>
              ) : (
                <span className="all-complete">Session Complete!</span>
              )}
            </div>
            <div className="progress-dots">
              {farewellMessages.map((_, index) => (
                <div 
                  key={index}
                  className={`progress-dot ${index <= currentLanguageIndex ? 'completed' : ''}`}
                  style={{
                    '--dot-color': farewellMessages[index].color
                  }}
                ></div>
              ))}
            </div>
          </div>

          <div className="message-display">
            <div className="language-flag">
              <span className="flag-emoji">{currentMessage.flag}</span>
            </div>
            
            <div className="message-container">
              <div 
                className="typed-message"
                style={{
                  '--message-color': currentMessage.color
                }}
              >
                {typedText}
                <span className={`cursor ${showCursor ? 'visible' : 'hidden'}`}>|</span>
              </div>
              
              <div className="message-language">
                {currentMessage.language}
              </div>
            </div>
          </div>

          <div className="creative-elements">
            <div className="thank-you-cards">
              {farewellMessages.slice(0, currentLanguageIndex + 1).map((msg, index) => (
                <div 
                  key={index}
                  className="thank-you-card"
                  style={{
                    '--card-delay': `${index * 0.2}s`,
                    '--card-color': msg.color
                  }}
                >
                  <span className="card-flag">{msg.flag}</span>
                  <span className="card-message">{msg.message}</span>
                </div>
              ))}
            </div>

            <div className="ripple-container">
              <div className="ripple ripple-1"></div>
              <div className="ripple ripple-2"></div>
              <div className="ripple ripple-3"></div>
            </div>

            <div className="particle-trail">
              <div className="trail-particle particle-1"></div>
              <div className="trail-particle particle-2"></div>
              <div className="trail-particle particle-3"></div>
              <div className="trail-particle particle-4"></div>
              <div className="trail-particle particle-5"></div>
            </div>
          </div>

          {animationPhase === 'floating' && (
            <div className="final-message animate-fade-in">
              <h2 className="final-title">
                <span className="sparkle">✨</span>
                Session Ended Successfully
                <span className="sparkle">✨</span>
              </h2>
              <p className="final-subtitle">
                Redirecting to secure login...
              </p>
              <div className="loading-dots">
                <span>.</span><span>.</span><span>.</span>
              </div>
            </div>
          )}
        </div>

        <div className="signout-footer">
          <p className="security-note">
            🔒 Session securely terminated
          </p>
          <p className="redirect-info">
            Automatic redirect in {animationPhase === 'floating' ? String(FLOATING_SCENE_MS / 1000) : '...'} seconds
          </p>
          <p className="encryption-note">
            🔐 Redirecting to encrypted login route
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminSignOut;
