// src/components/sections/Hero/Hero.js - CLEAN PRODUCTION VERSION
import React, { useEffect, useRef } from 'react';
import visitorTracking from '../../../services/visitorTrackingService';
import { useNavigate, useLocation } from 'react-router-dom';
import Cube3D from './Cube3D';
import { portfolioData } from '../../../data/portfolioData';
import { useSupabase } from '../../../hooks/useSupabase';
import LoadingSpinner from '../../common/LoadingSpinner';
import './Hero.css';

const Hero = () => {
  const hasTracked = useRef(false);
  const { startTracking, stopTracking } = visitorTracking.useTimeTracking('hero', 'main');

  useEffect(() => {
    if (!hasTracked.current) {
      hasTracked.current = true;
      startTracking();
      visitorTracking.trackSectionView('hero', 'main');
    }

    return () => {
      stopTracking();
    };
  }, [startTracking, stopTracking]);

  const navigate = useNavigate();
  const location = useLocation();

  // Fetch hero data with real-time updates
  const { 
    data: heroData, 
    loading
  } = useSupabase('hero_content', {}, { 
    orderBy: { column: 'created_at', ascending: false },
    limit: 1,
    single: true,
    realtime: true,
    cacheKey: 'hero-public-display'
  });

  // Smart data mapping with database structure
  const displayData = heroData ? {
    title: heroData.title || portfolioData.hero.title,
    subtitle: heroData.subtitle || portfolioData.hero.subtitle,
    description: heroData.description || portfolioData.hero.description,
    highlights: Array.isArray(heroData.highlights) && heroData.highlights.length > 0 
      ? heroData.highlights 
      : portfolioData.hero.highlights,
    cta_text: heroData.cta_text || 'View My Work',
    cta_link: heroData.cta_link || '#navigation'
  } : portfolioData.hero;

  const handleNavClick = (sectionId) => {
    if (location.pathname === '/') {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        window.history.pushState(null, '', `/#${sectionId}`);
      }
    } else {
      navigate(`/#${sectionId}`);
      setTimeout(() => {
        const element = document.getElementById(sectionId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 300);
    }
  };

  const handleCTAClick = () => {
    if (displayData.cta_link) {
      if (displayData.cta_link.startsWith('#')) {
        handleNavClick(displayData.cta_link.substring(1));
      } else if (displayData.cta_link.startsWith('/')) {
        navigate(displayData.cta_link);
      } else {
        window.open(displayData.cta_link, '_blank');
      }
    } else {
      handleNavClick('navigation');
    }
  };

  // Show loading only initially
  if (loading && !heroData) {
    return (
      <section className="hero-section">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <LoadingSpinner size="large" message="Loading hero content..." />
        </div>
      </section>
    );
  }

  return (
    <section className="hero-section">
      {/* Moving Light Rays Background */}
      <div className="hero-light-rays">
        <div className="hero-light-ray"></div>
        <div className="hero-light-ray"></div>
        <div className="hero-light-ray"></div>
      </div>
      
      {/* Floating Particles */}
      <div className="floating-particles">
        <div className="floating-particle"></div>
        <div className="floating-particle"></div>
        <div className="floating-particle"></div>
        <div className="floating-particle"></div>
      </div>

      <div className="hero-content">
        {/* Left Side: Introduction Text */}
        <div className="hero-text">
          <h1 className="hero-title">
            <span className="shimmer-text">{displayData.title}</span>
          </h1>
          <h2 className="hero-subtitle text-glow">
            {displayData.subtitle}
          </h2>
          <p className="hero-description">
            {displayData.description}
          </p>
          
          {/* Highlights */}
          <div className="hero-highlights">
            {displayData.highlights.map((highlight, index) => (
              <div 
                key={index} 
                className={`hero-highlight animate-fade-in-up animate-delay-${(index + 1) * 200}`}
              >
                <span className="highlight-icon">✓</span>
                <span className="highlight-text">{highlight}</span>
              </div>
            ))}
          </div>

          {/* CTA Buttons */}
          <div className="hero-actions">
            <button 
              className="neon-button primary"
              onClick={handleCTAClick}
            >
              {displayData.cta_text || 'View My Work'}
            </button>
            <button 
              className="neon-button secondary"
              onClick={() => handleNavClick('contact')}
            >
              Contact Me
            </button>
          </div>
        </div>

        {/* Creative Divider Between Text and Cube */}
        <div className="hero-divider">
          <div className="hero-divider-icons">
            <div className="divider-icon code-bracket">&lt;/&gt;</div>
            <div className="divider-icon curly-brace">&#123;&#125;</div>
            <div className="divider-icon lambda-symbol">λ</div>
            <div className="divider-icon delta-symbol">Δ</div>
          </div>
        </div>

        {/* Right Side: 3D Cube */}
        <div className="hero-cube-wrapper">
          <Cube3D />
        </div>
      </div>
    </section>
  );
};

export default Hero;