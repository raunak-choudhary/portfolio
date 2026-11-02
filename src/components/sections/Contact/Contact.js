// =================================================================
// Contact.js - Enhanced Header Section
// =================================================================

// src/components/sections/Contact/Contact.js

import React, { useEffect, useRef } from 'react';
import visitorTracking from '../../../services/visitorTrackingService';
import ContactForm from './ContactForm';
import './Contact.css';

const Contact = () => {
  const hasTracked = useRef(false);
  const { startTracking, stopTracking } = visitorTracking.useTimeTracking('contact', 'main');

  useEffect(() => {
    if (!hasTracked.current) {
      hasTracked.current = true;
      startTracking();
      visitorTracking.trackSectionView('contact', 'main');
    }

    return () => {
      stopTracking();
    };
  }, [startTracking, stopTracking]);

  return (
    <section className="contact-section" id="contact">
      <div className="container">
        {/* Enhanced Header with Professional Focus */}
        <div className="section-header">
          <h2 className="section-title-contact shimmer-text">Let's Connect & Build Something Amazing</h2>
          <p className="section-subtitle-contact">
            Ready to discuss opportunities, collaborations, or just connect? I'm excited to hear from talented professionals, innovative teams, and ambitious students!
          </p>
        </div>
        
        {/* Professional Call-to-Action */}
        <div className="form-header-main">
          <h3 className="form-title-main">🚀 Ready to Connect?</h3>
          <p className="form-subtitle-main">
            Whether you're a recruiter with an exciting opportunity, a hiring manager looking for talent, 
            or a fellow developer interested in collaboration – let's start the conversation!
          </p>
          
          {/* Quick Contact Stats */}
          <div className="contact-stats">
            <div className="stat-item">
              <span className="stat-number">24h</span>
              <span className="stat-label">Avg Response Time</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">100%</span>
              <span className="stat-label">Response Rate</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">3+</span>
              <span className="stat-label">Years Experience</span>
            </div>
          </div>
        </div>

        <div className="contact-content">
          <ContactForm />
        </div>
        
        {/* Professional Footer */}
        <div className="contact-footer">
          <div className="alternative-contact">
            <h4>Prefer Other Channels?</h4>
            <div className="contact-links">
              <a 
                href="https://linkedin.com/in/raunak-choudhary" 
                target="_blank" 
                rel="noopener noreferrer"
                className="contact-link linkedin"
              >
                <span className="link-icon">💼</span>
                <span>LinkedIn</span>
              </a>
              <a 
                href="mailto:raunakchoudhary17@gmail.com" 
                className="contact-link email"
              >
                <span className="link-icon">📧</span>
                <span>Direct Email</span>
              </a>
              <a 
                href="tel:+19292894648" 
                className="contact-link phone"
              >
                <span className="link-icon">📱</span>
                <span>Phone</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Contact;