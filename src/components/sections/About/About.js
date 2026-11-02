// src/components/sections/About/About.js - FIXED FOR ARRAY FORMAT

import { useEffect, useRef } from 'react';
import visitorTracking from '../../../services/visitorTrackingService';
import React, { useState } from 'react';
import { portfolioData } from '../../../data/portfolioData';
import { useSupabase } from '../../../hooks/useSupabase';
import LoadingSpinner from '../../common/LoadingSpinner';
import './About.css';

// Helper function to convert array format to object format for display
const convertBasicInfoToObject = (basicInfoArray) => {
  // Handle null/undefined
  if (!basicInfoArray) return {};
  
  // If it's already an object (legacy format), return as-is
  if (typeof basicInfoArray === 'object' && !Array.isArray(basicInfoArray)) {
    return basicInfoArray;
  }
  
  // If it's an array (new format), convert to object
  if (Array.isArray(basicInfoArray)) {
    const obj = {};
    basicInfoArray
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0)) // Sort by order
      .forEach(item => {
        if (item && item.key && item.value) {
          obj[item.key] = item.value;
        }
      });
    return obj;
  }
  
  // Fallback
  return {};
};

const About = () => {
  const hasTracked = useRef(false);
  const { startTracking, stopTracking } = visitorTracking.useTimeTracking('about', 'main');

  useEffect(() => {
    if (!hasTracked.current) {
      hasTracked.current = true;
      startTracking();
      visitorTracking.trackSectionView('about', 'main');
    }

    return () => {
      stopTracking();
    };
  }, [startTracking, stopTracking]);
  
  const [activeTab, setActiveTab] = useState('about');

  // Fetch about data with real-time updates
  const { 
    data: aboutData, 
    loading
  } = useSupabase('about_content', {}, { 
    orderBy: { column: 'created_at', ascending: false },
    limit: 1,
    single: true,
    realtime: true,
    cacheKey: 'about-public-display'
  });

  // Smart data mapping with database structure - FIXED FOR ARRAY FORMAT
  const displayData = aboutData ? {
    aboutMe: {
      title: aboutData.about_me_title || portfolioData.about.aboutMe.title,
      content: aboutData.about_me_content || portfolioData.about.aboutMe.content
    },
    basicInfo: {
      title: aboutData.basic_info_title || portfolioData.about.basicInfo.title,
      details: convertBasicInfoToObject(aboutData.basic_info) || portfolioData.about.basicInfo.details
    },
    profileImages: {
      aboutMe: aboutData.profile_image_about || null,
      basicInfo: aboutData.profile_image_info || null,
      legacy: aboutData.profile_image_url || null
    }
  } : portfolioData.about;

  const tabs = [
    { id: 'about', label: 'About Me', content: displayData.aboutMe },
    { id: 'info', label: 'Basic Info', content: displayData.basicInfo }
  ];

  // Smart profile image selection with multiple fallbacks
  const getProfileImageSrc = () => {
    let imageUrl = null;

    // Try API images first
    if (displayData.profileImages) {
      if (activeTab === 'about' && displayData.profileImages.aboutMe) {
        imageUrl = displayData.profileImages.aboutMe;
      } else if (activeTab === 'info' && displayData.profileImages.basicInfo) {
        imageUrl = displayData.profileImages.basicInfo;
      } else if (displayData.profileImages.legacy) {
        imageUrl = displayData.profileImages.legacy;
      } else if (displayData.profileImages.aboutMe) {
        imageUrl = displayData.profileImages.aboutMe;
      } else if (displayData.profileImages.basicInfo) {
        imageUrl = displayData.profileImages.basicInfo;
      }
    }

    // Fallback to static images
    if (!imageUrl) {
      imageUrl = activeTab === 'about' ? '/profile_pic_1.jpg' : '/profile_pic_2.jpg';
    }

    return imageUrl;
  };

  // Show loading only initially
  if (loading && !aboutData) {
    return (
      <section id="about" className="about-section section">
        <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <LoadingSpinner size="large" message="Loading about content..." />
        </div>
      </section>
    );
  }

  return (
    <section id="about" className="about-section section">
      <div className="container">
        {/* Tab Navigation - Centered at top */}
        <div className="about-tabs-header">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        <div className="about-content">
          {/* Left Side: Tab Content */}
          <div className="about-text">
            {/* Tab Content */}
            <div className="tab-content">
              {activeTab === 'about' && (
                <div className="tab-panel animate-fade-in">
                  <h3 className="tab-title">{displayData.aboutMe.title}</h3>
                  <div className="about-text-content">
                    {displayData.aboutMe.content.split('\n\n').map((paragraph, index) => (
                      <p key={index} className="about-paragraph">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'info' && (
                <div className="tab-panel animate-fade-in">
                  <h3 className="tab-title">{displayData.basicInfo.title}</h3>
                  <div className="basic-info-grid">
                    {Object.entries(displayData.basicInfo.details).map(([key, value]) => (
                      <div key={key} className="info-item glass-card">
                        <div className="info-label">
                          {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                        </div>
                        <div className="info-value">
                          {Array.isArray(value) ? value.join(', ') : value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Side: Profile Picture */}
          <div className="about-image">
            <div className="profile-picture-container">
              <div className="profile-picture profile-neon">
                <img 
                  src={getProfileImageSrc()}
                  alt="Raunak Choudhary" 
                  className="profile-img"
                  onError={(e) => {
                    // Progressive fallback for image loading errors
                    if (e.target.src.includes('profile_pic_1.jpg')) {
                      e.target.src = '/profile_pic_2.jpg';
                    } else if (e.target.src.includes('profile_pic_2.jpg')) {
                      e.target.src = '/logo.png';
                    } else if (e.target.src.includes('/storage/')) {
                      // Supabase image failed, try static
                      e.target.src = activeTab === 'about' ? '/profile_pic_1.jpg' : '/profile_pic_2.jpg';
                    } else {
                      // Final fallback
                      e.target.src = '/logo.png';
                    }
                  }}
                />
              </div>
              
              {/* Background Glow Effect */}
              <div className="profile-background-glow"></div>
              
              {/* Floating Elements */}
              <div className="profile-floating-elements">
                <div className="floating-particle"></div>
                <div className="floating-particle"></div>
                <div className="floating-particle"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;