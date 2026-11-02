import React from 'react';
import Achievements from '../components/sections/Achievements/Achievements';
import { useEffect, useRef } from 'react';
import visitorTracking from '../services/visitorTrackingService';

const AchievementsPage = () => {
  const hasTracked = useRef(false);

  useEffect(() => {
    // Only track once per page mount
    if (!hasTracked.current) {
      hasTracked.current = true;
      
      // Track page view (when someone visits /education)
      visitorTracking.trackPageView('achievements', 'Achievements & Awards - RC Portfolio');
      
      // Track section view (content engagement)
      visitorTracking.trackSectionView('achievements', 'main');
    }
  }, []);

  return (
    <div className="page-wrapper">
      <Achievements />
    </div>
  );
};

export default AchievementsPage;