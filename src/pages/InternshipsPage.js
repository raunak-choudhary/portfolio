import React from 'react';
import Internships from '../components/sections/Internships/Internships';
import { useEffect, useRef } from 'react';
import visitorTracking from '../services/visitorTrackingService';

const InternshipsPage = () => {
  const hasTracked = useRef(false);

  useEffect(() => {
    // Only track once per page mount
    if (!hasTracked.current) {
      hasTracked.current = true;
      
      // Track page view (when someone visits /internships)
      visitorTracking.trackPageView('internships', 'Internships - RC Portfolio');
        
      // Track section view (content engagement)
      visitorTracking.trackSectionView('internships', 'main');
    }
  }, []);

  return (
    <div className="page-wrapper">
      <Internships />
    </div>
  );
};

export default InternshipsPage;