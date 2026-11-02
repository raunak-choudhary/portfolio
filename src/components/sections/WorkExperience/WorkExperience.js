import React, { useEffect } from 'react';
import ExperienceCard from './ExperienceCard';
import { useSupabaseByStatus } from '../../../hooks/useSupabase';
import LoadingSpinner from '../../common/LoadingSpinner';
import './WorkExperience.css';

const WorkExperience = () => {
  // ✅ NEW: useSupabase hook integration (replaces manual state management)
  const { data: workExperiences, loading, error } = useSupabaseByStatus(
    'work_experience', 
    'active',
    {},
    { orderBy: { column: 'start_date', ascending: false } }
  );

  // ✅ PRESERVED: Scroll to top when component mounts (unchanged)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // ✅ PRESERVED: Loading spinner display (unchanged)
  if (loading) {
    return (
      <section className="work-experience-section section">
        <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <LoadingSpinner size="large" message="Loading work experience..." />
        </div>
      </section>
    );
  }

  return (
    <section className="work-experience-section section">
      <div className="container">
        {/* ✅ PRESERVED: Header section (unchanged) */}
        <div className="section-header">
          <h1 className="neon-title">Work Experience</h1>
          <p className="neon-subtitle">Professional career journey and key achievements</p>
        </div>

        <div className="work-experience-content">
          {error ? (
            // ✅ ENHANCED: Error state with improved error handling
            <div className="no-content-message glass-card">
              <div className="no-content-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 9v4m0 4h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="no-content-title">Error Loading Work Experience</h3>
              <p className="no-content-text">
                {typeof error === 'string' ? error : error?.message || 'Something went wrong while loading work experience. Please try again later.'}
              </p>
              <div className="no-content-decoration">
                <div className="floating-particle"></div>
                <div className="floating-particle"></div>
                <div className="floating-particle"></div>
              </div>
            </div>
          ) : !workExperiences || workExperiences.length === 0 ? (
            // ✅ PRESERVED: No work experience state (unchanged)
            <div className="no-content-message glass-card">
              <div className="no-content-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 6H16L14 2H10L8 6H4C2.9 6 2 6.9 2 8V19C2 20.1 2.9 21 4 21H20C21.1 21 22 20.1 22 19V8C22 6.9 21.1 6 20 6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 6V4C8 3.45 8.45 3 9 3H15C15.55 3 16 3.45 16 4V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 12V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M9 14H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <h3 className="no-content-title">No Work Experience Available</h3>
              <p className="no-content-text">
                No information present. Professional work history and achievements will be displayed here once they are added to the portfolio.
              </p>
              <div className="no-content-decoration">
                <div className="floating-particle"></div>
                <div className="floating-particle"></div>
                <div className="floating-particle"></div>
              </div>
            </div>
          ) : (
            // ✅ PRESERVED: Work experience grid - display actual data (unchanged)
            <div className="work-experience-grid">
              {workExperiences.map((workExperience, index) => (
                <ExperienceCard key={workExperience.id || index} workExperience={workExperience} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default WorkExperience;