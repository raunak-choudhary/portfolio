import React from 'react';
import Projects from '../components/sections/Projects/Projects';
import { useEffect, useRef } from 'react';
import visitorTracking from '../services/visitorTrackingService';

const ProjectsPage = () => {
  const hasTracked = useRef(false);

  useEffect(() => {
    // Only track once per page mount
    if (!hasTracked.current) {
      hasTracked.current = true;
      
      // Track page view (when someone visits /projects)
      visitorTracking.trackPageView('projects', 'Projects - RC Portfolio');
      
      // Track section view (content engagement)
      visitorTracking.trackSectionView('projects', 'main');
    }
  }, []);

  return (
    <div className="page-wrapper">
      <Projects />
    </div>
  );
};

export default ProjectsPage;