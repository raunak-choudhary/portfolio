import React from 'react';
import Recommendations from '../components/sections/Recommendations/Recommendations';
import { useEffect, useRef } from 'react';
import visitorTracking from '../services/visitorTrackingService';

const RecommendationsPage = () => {
  const hasTracked = useRef(false);

  useEffect(() => {
    // Only track once per page mount
    if (!hasTracked.current) {
      hasTracked.current = true;
      
      // Track page view (when someone visits /recommendations)
      visitorTracking.trackPageView('recommendations', 'LinkedIn Recommendations - RC Portfolio');
      
      // Track section view (content engagement)
      visitorTracking.trackSectionView('recommendations', 'main');
    }
  }, []);

  return (
    <div className="page-wrapper">
      <Recommendations />
    </div>
  );
};

export default RecommendationsPage;