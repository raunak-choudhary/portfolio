import React from 'react';
import Skills from '../components/sections/Skills/Skills';
import { useEffect, useRef } from 'react';
import visitorTracking from '../services/visitorTrackingService';

const SkillsPage = () => {
  const hasTracked = useRef(false);

  useEffect(() => {
    // Only track once per page mount
    if (!hasTracked.current) {
      hasTracked.current = true;
      
      // Track page view (when someone visits /skills)
      visitorTracking.trackPageView('skills', 'Skills & Competencies - RC Portfolio');
      
      // Track section view (content engagement)
      visitorTracking.trackSectionView('skills', 'main');
    }
  }, []);

  return (
    <div className="page-wrapper">
      <Skills />
    </div>
  );
};

export default SkillsPage;