import React from 'react';
import Certifications from '../components/sections/Certifications/Certifications';
import { useEffect, useRef } from 'react';
import visitorTracking from '../services/visitorTrackingService';

const CertificationsPage = () => {
  const hasTracked = useRef(false);

  useEffect(() => {
    // Only track once per page mount
    if (!hasTracked.current) {
      hasTracked.current = true;
      
      // Track page view (when someone visits /certifications)
      visitorTracking.trackPageView('certifications', 'Certifications & Badges - RC Portfolio');
      
      // Track section view (content engagement)
      visitorTracking.trackSectionView('certifications', 'main');
    }
  }, []);

  return (
    <div className="page-wrapper">
      <Certifications />
    </div>
  );
};

export default CertificationsPage;