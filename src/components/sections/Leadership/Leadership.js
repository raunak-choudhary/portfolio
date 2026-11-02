import React, { useEffect, useMemo } from 'react';
import LeadershipCard from './LeadershipCard';
import { useSupabaseByStatus } from '../../../hooks/useSupabase';
import LoadingSpinner from '../../common/LoadingSpinner';
import './Leadership.css';

const Leadership = () => {
  // 🔧 UPDATED: Database integration with useSupabase hook
  const { data: flatLeadership, loading, error } = useSupabaseByStatus(
    'leadership', 
    'active',
    {},
    { 
      orderBy: { column: 'start_date', ascending: false }
    }
  );

  // Add featured priority sorting
  const leadership = useMemo(() => {
    if (!flatLeadership || flatLeadership.length === 0) return [];
    
    return flatLeadership.sort((a, b) => {
      // Featured items first
      if (a.is_featured && !b.is_featured) return -1;
      if (!a.is_featured && b.is_featured) return 1;
      // Then by start_date (most recent first)
      return new Date(b.start_date) - new Date(a.start_date);
    });
  }, [flatLeadership]);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Show loading spinner
  if (loading) {
    return (
      <section className="leadership-section section">
        <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <LoadingSpinner size="large" message="Loading leadership positions..." />
        </div>
      </section>
    );
  }

  return (
    <section className="leadership-section section">
      <div className="container">
        {/* Header matching Projects section style */}
        <div className="section-header">
          <h1 className="neon-title">Leadership</h1>
          <p className="neon-subtitle">Leadership roles and volunteer experiences that shaped my professional journey</p>
        </div>

        <div className="ldrpft-leadership-content">
          {error ? (
            // Error state - 🔧 UPDATED: Enhanced error handling with ldrpft- prefix
            <div className="ldrpft-no-content-message ldrpft-glass-card">
              <div className="ldrpft-no-content-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 9v4m0 4h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="ldrpft-no-content-title">Error Loading Leadership</h3>
              <p className="ldrpft-no-content-text">
                {typeof error === 'object' ? error.message : error || 'Something went wrong while loading leadership positions. Please try again later.'}
              </p>
              <div className="ldrpft-no-content-decoration">
                <div className="ldrpft-floating-particle"></div>
                <div className="ldrpft-floating-particle"></div>
                <div className="ldrpft-floating-particle"></div>
              </div>
            </div>
          ) : !leadership || leadership.length === 0 ? (
            // No leadership state with ldrpft- prefix
            <div className="ldrpft-no-content-message ldrpft-glass-card">
              <div className="ldrpft-no-content-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M16 21V19C16 17.9391 15.5786 16.9217 14.8284 16.1716C14.0783 15.4214 13.0609 15 12 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="8.5" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                  <path d="M20 8V14L23 11L20 8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M20 21V19C20 18.1 19.7 17.3 19.2 16.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M15 7.13C15.8 7.35 16.5 7.85 17 8.54C17.5 9.23 17.8 10.07 17.8 10.94C17.8 11.81 17.5 12.64 17 13.31C16.5 13.98 15.8 14.44 15 14.66" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="ldrpft-no-content-title">No Leadership Experience Available</h3>
              <p className="ldrpft-no-content-text">
                No information present. Leadership roles and volunteer experiences will be displayed here once they are added to the portfolio.
              </p>
              <div className="ldrpft-no-content-decoration">
                <div className="ldrpft-floating-particle"></div>
                <div className="ldrpft-floating-particle"></div>
                <div className="ldrpft-floating-particle"></div>
              </div>
            </div>
          ) : (
            // Leadership grid - display actual data with ldrpft- prefix
            <div className="ldrpft-leadership-grid">
              {leadership.map((position, index) => (
                <LeadershipCard key={position.id || index} leadership={position} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default Leadership;