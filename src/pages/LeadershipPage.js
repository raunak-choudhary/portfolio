import React from 'react';
import Leadership from '../components/sections/Leadership/Leadership';
import { useEffect, useRef } from 'react';
import visitorTracking from '../services/visitorTrackingService';

const LeadershipPage = () => {
  const hasTracked = useRef(false);

  useEffect(() => {
    // Only track once per page mount
    if (!hasTracked.current) {
      hasTracked.current = true;
      
      // Track page view (when someone visits /leadership)
      visitorTracking.trackPageView('leadership', 'Leadership & Volunteering - RC Portfolio');
      
      // Track section view (content engagement)
      visitorTracking.trackSectionView('leadership', 'main');
    }
  }, []);

  return (
    <div className="page-wrapper">
      <Leadership />
    </div>
  );
};

export default LeadershipPage;