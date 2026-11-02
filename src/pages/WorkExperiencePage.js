import React from 'react';
import WorkExperience from '../components/sections/WorkExperience/WorkExperience';
import { useEffect, useRef } from 'react';
import visitorTracking from '../services/visitorTrackingService';

const WorkExperiencePage = () => {
  const hasTracked = useRef(false);

  useEffect(() => {
    // Only track once per page mount
    if (!hasTracked.current) {
      hasTracked.current = true;
      
      // Track page view (when someone visits /work-experience)
      visitorTracking.trackPageView('work-experience', 'Work Experience - RC Portfolio');
      
      // Track section view (content engagement)
      visitorTracking.trackSectionView('work-experience', 'main');
    }
  }, []);

  return (
    <div className="page-wrapper">
      <WorkExperience />
    </div>
  );
};

export default WorkExperiencePage;