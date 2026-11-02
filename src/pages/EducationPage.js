import React from 'react';
import Education from '../components/sections/Education/Education';
import { useEffect, useRef } from 'react';
import visitorTracking from '../services/visitorTrackingService';

const EducationPage = () => {
  const hasTracked = useRef(false);

  useEffect(() => {
    // Only track once per page mount
    if (!hasTracked.current) {
      hasTracked.current = true;
      
      // Track page view (when someone visits /education)
      visitorTracking.trackPageView('education', 'Education - RC Portfolio');
      
      // Track section view (content engagement)
      visitorTracking.trackSectionView('education', 'main');
    }
  }, []);

  return (
    <div className="page-wrapper">
      <Education />
    </div>
  );
};

export default EducationPage;