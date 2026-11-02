import React, { useEffect, useMemo } from 'react';
import RecommendationCard from './RecommendationCard';
import { useSupabaseByStatus } from '../../../hooks/useSupabase';
import LoadingSpinner from '../../common/LoadingSpinner';
import './Recommendations.css';

const Recommendations = () => {
  // 🔧 UPDATED: Database integration with useSupabase hook
  const { data: flatRecommendations, loading, error } = useSupabaseByStatus(
    'recommendations', 
    'active',
    {},
    { 
      orderBy: { column: 'created_at', ascending: false }
    }
  );

  // 🔧 ADDED: Process flat recommendations data with public filtering
  const recommendations = useMemo(() => {
    if (!flatRecommendations || flatRecommendations.length === 0) {
      return [];
    }

    console.log('✅ Recommendations fetched successfully:', flatRecommendations.length, 'entries');
    
    // Filter out non-public recommendations and add featured priority sorting
    const publicRecommendations = flatRecommendations
      .filter(rec => rec.is_public !== false)
      .sort((a, b) => {
        // Featured recommendations first
        if (a.is_featured && !b.is_featured) return -1;
        if (!a.is_featured && b.is_featured) return 1;
        // Then by created_at (most recent first)
        return new Date(b.created_at) - new Date(a.created_at);
      });
    
    console.log('👥 Public recommendations processed:', publicRecommendations.length);
    return publicRecommendations || [];
  }, [flatRecommendations]);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Show loading spinner
  if (loading) {
    return (
      <section className="recommendations-section section">
        <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <LoadingSpinner size="large" message="Loading recommendations..." />
        </div>
      </section>
    );
  }

  return (
    <section className="recommendations-section section">
      <div className="container">
        {/* Header matching Projects section style */}
        <div className="section-header">
          <h1 className="neon-title">Recommendations</h1>
          <p className="neon-subtitle">Professional testimonials and endorsements from colleagues and mentors</p>
        </div>

        <div className="recompft-recommendations-content">
          {error ? (
            // Error state - 🔧 UPDATED: Enhanced error handling with recompft- prefix
            <div className="recompft-no-content-message recompft-glass-card">
              <div className="recompft-no-content-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 9v4m0 4h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="recompft-no-content-title">Error Loading Recommendations</h3>
              <p className="recompft-no-content-text">
                {typeof error === 'object' ? error.message : error || 'Something went wrong while loading recommendations. Please try again later.'}
              </p>
              <div className="recompft-no-content-decoration">
                <div className="recompft-floating-particle"></div>
                <div className="recompft-floating-particle"></div>
                <div className="recompft-floating-particle"></div>
              </div>
            </div>
          ) : recommendations.length === 0 ? (
            // No recommendations state with recompft- prefix
            <div className="recompft-no-content-message recompft-glass-card">
              <div className="recompft-no-content-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 21C3 17.686 5.686 15 9 15S15 17.686 15 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                  <path d="M16 3.13C16.84 3.35 17.56 3.85 18.07 4.54C18.58 5.23 18.84 6.07 18.82 6.94C18.8 7.81 18.5 8.64 17.96 9.31C17.42 9.98 16.66 10.44 15.82 10.62" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M19 21C19 19.74 18.65 18.55 18.05 17.55" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M7 10L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="recompft-no-content-title">No Recommendations Available</h3>
              <p className="recompft-no-content-text">
                No information present. Professional recommendations and testimonials will be displayed here once they are added to the portfolio.
              </p>
              <div className="recompft-no-content-decoration">
                <div className="recompft-floating-particle"></div>
                <div className="recompft-floating-particle"></div>
                <div className="recompft-floating-particle"></div>
              </div>
            </div>
          ) : (
            // Recommendations grid - display actual data with recompft- prefix
            <div className="recompft-recommendations-grid">
              {recommendations.map((recommendation, index) => (
                <RecommendationCard key={recommendation.id || index} recommendation={recommendation} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default Recommendations;