// src/components/sections/Navigation/Navigation.js

import React from 'react';
import { useEffect, useRef } from 'react';
import visitorTracking from '../../../services/visitorTrackingService';
import { useNavigate } from 'react-router-dom';
import './Navigation.css';

const Navigation = () => {
  const hasTracked = useRef(false);
  const { startTracking, stopTracking } = visitorTracking.useTimeTracking('navigation', 'main');

  useEffect(() => {
    if (!hasTracked.current) {
      hasTracked.current = true;
      startTracking();
      visitorTracking.trackSectionView('navigation', 'main');
    }

    return () => {
      stopTracking();
    };
  }, [startTracking, stopTracking]);

  const navigate = useNavigate();

  const navigationCards = [
    {
      id: 'projects',
      title: 'Projects',
      description: 'Explore my development projects',
      icon: '🚀',
      path: '/projects',
      gradient: 'linear-gradient(135deg, var(--neon-cyan), var(--neon-blue))'
    },
    {
      id: 'work-experience',
      title: 'Work Experience',
      description: 'Professional career journey',
      icon: '💼',
      path: '/work-experience',
      gradient: 'linear-gradient(135deg, var(--neon-blue), var(--neon-purple))'
    },
    {
      id: 'education',
      title: 'Education',
      description: 'Academic background',
      icon: '🎓',
      path: '/education',
      gradient: 'linear-gradient(135deg, var(--neon-purple), var(--neon-pink))'
    },
    {
      id: 'skills',
      title: 'Skills',
      description: 'Technical expertise',
      icon: '⚡',
      path: '/skills',
      gradient: 'linear-gradient(135deg, var(--neon-pink), var(--neon-orange))'
    },
    {
      id: 'internships',
      title: 'Internships',
      description: 'Professional training',
      icon: '🌟',
      path: '/internships',
      gradient: 'linear-gradient(135deg, var(--neon-orange), var(--neon-cyan))'
    },
    {
      id: 'certifications',
      title: 'Certifications',
      description: 'Professional credentials',
      icon: '🏆',
      path: '/certifications',
      gradient: 'linear-gradient(135deg, var(--neon-cyan), var(--neon-green))'
    },
    {
      id: 'achievements',
      title: 'Achievements',
      description: 'Notable accomplishments',
      icon: '🎯',
      path: '/achievements',
      gradient: 'linear-gradient(135deg, var(--neon-green), var(--neon-cyan))'
    },
    {
      id: 'leadership',
      title: 'Leadership',
      description: 'Leadership experiences',
      icon: '👑',
      path: '/leadership',
      gradient: 'linear-gradient(135deg, var(--neon-cyan), var(--neon-blue))'
    },
    {
      id: 'recommendations',
      title: 'Recommendations',
      description: 'Professional testimonials',
      icon: '💎',
      path: '/recommendations',
      gradient: 'linear-gradient(135deg, var(--neon-blue), var(--neon-purple))'
    }
  ];

  const handleCardClick = (path) => {
    navigate(path);
  };

  return (
    <section className="navigation-section" id="navigation">
      <div className="container">
        <div className="section-header">
          <h2 className="neon-title">Explore Portfolio</h2>
          <p className="neon-subtitle">
            Click on any section below to navigate through different aspects of my professional journey
          </p>
        </div>

        <div className="navigation-grid">
          {navigationCards.map((card) => (
            <div
              key={card.id}
              className="navigation-card glass-card"
              onClick={() => handleCardClick(card.path)}
              style={{
                '--card-gradient': card.gradient
              }}
            >
              <div className="card-icon">{card.icon}</div>
              <h3 className="card-title">{card.title}</h3>
              <p className="card-description">{card.description}</p>
              <div className="card-hover-effect"></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Navigation;