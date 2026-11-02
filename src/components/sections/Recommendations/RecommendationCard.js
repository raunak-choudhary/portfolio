// =====================================================
// RecommendationCard.js - COMPLETELY FIXED VERSION
// Replace your current file with this exact code
// =====================================================

import React, { useState, useEffect } from 'react';

const RecommendationCard = ({ recommendation }) => {
  console.log('🎨 Rendering FIXED RecommendationCard:', recommendation?.recommender_name);

  const [isFlipped, setIsFlipped] = useState(false);

  // Generate recommender initials for fallback
  const generateRecommenderInitials = (name) => {
    if (!name) return 'R';
    
    const words = name.split(' ').filter(word => word.length > 0);
    if (words.length === 1) {
      return words[0].substring(0, 2).toUpperCase();
    }
    return words.slice(0, 2).map(word => word.charAt(0).toUpperCase()).join('');
  };

  // Format date with fallback
  const formatDate = (dateString) => {
    if (!dateString) return null;
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return dateString;
    }
  };

  // Format LinkedIn URL for display
  const formatLinkedInUrl = (url) => {
    if (!url) return null;
    
    // Ensure URL starts with protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return `https://${url}`;
    }
    return url;
  };

  // Check if there's content for back side
  const hasBackContent = () => {
    return (
      recommendation.recommender_title ||
      recommendation.organization ||
      recommendation.date_received ||
      recommendation.rating ||
      recommendation.recommendation_type
    );
  };

  const canFlip = hasBackContent();

  // Card flip handler
  const handleCardClick = (e) => {
    // Don't flip if clicking on links or buttons, or if no back content
    if (!canFlip || 
        e.target.closest('.recompft-linkedin-link') || 
        e.target.closest('.recompft-flip-icon-btn') ||
        e.target.closest('.recompft-featured-badge')) {
      return;
    }
    
    console.log('🔄 Card flip triggered for:', recommendation?.recommender_name);
    setIsFlipped(!isFlipped);
    
    // Add haptic feedback for mobile devices
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  // Handle flip icon click
  const handleFlipIconClick = (e) => {
    e.stopPropagation();
    if (canFlip) {
      setIsFlipped(!isFlipped);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (canFlip) {
        handleCardClick(e);
      }
    }
    if (e.key === 'Escape' && isFlipped) {
      setIsFlipped(false);
    }
  };

  // Handle escape key to close card
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isFlipped) {
        setIsFlipped(false);
      }
    };

    if (isFlipped) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isFlipped]);

  return (
    <div 
      className={`recompft-card-container ${isFlipped ? 'recompft-flipped' : ''} ${!canFlip ? 'recompft-no-flip' : ''}`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Recommendation card from ${recommendation.recommender_name}. ${canFlip ? 'Press Enter or Space to flip and see details.' : 'No additional details available.'}`}
      aria-pressed={isFlipped}
    >
      <div className="recompft-card-inner">
        
        {/* =================== FRONT SIDE =================== */}
        <div className="recompft-card-face recompft-card-front">
          
          {/* Featured Badge - TOP LEFT POSITIONING */}
          {recommendation.is_featured && (
            <div className="recompft-featured-section">
              <div className="recompft-featured-badge">
                <span className="recompft-featured-star">★</span>
                <span className="recompft-featured-text">FEATURED</span>
              </div>
            </div>
          )}

          {/* Header with Profile Image and Flip Icon */}
          <div className="recompft-card-header">
            <div className="recompft-profile-image-section">
              {recommendation.profile_image_url ? (
                <img 
                  src={recommendation.profile_image_url}
                  alt={`${recommendation.recommender_name} profile`}
                  className="recompft-recommender-photo recompft-recommender-photo-large"
                  onError={(e) => {
                    console.warn(`Failed to load profile image for ${recommendation.recommender_name}`);
                    e.target.style.display = 'none';
                    e.target.nextElementSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              
              {/* Temp profile with initials */}
              <div 
                className="recompft-recommender-photo-temp recompft-recommender-photo-large"
                style={{ display: recommendation.profile_image_url ? 'none' : 'flex' }}
              >
                {generateRecommenderInitials(recommendation.recommender_name)}
              </div>
            </div>

            {/* Flip Icon - only show if there's back content */}
            {canFlip && (
              <button 
                className="recompft-flip-icon-btn"
                onClick={handleFlipIconClick}
                aria-label="Flip card to see details"
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 12l18-9v18l-18-9z" fill="currentColor"/>
                </svg>
              </button>
            )}
          </div>

          {/* Recommender Name */}
          <div className="recompft-name-section">
            <h3 className="recompft-recommender-name">{recommendation.recommender_name}</h3>
            <div className="recompft-name-underline"></div>
          </div>

          {/* Relationship */}
          {recommendation.relationship && (
            <div className="recompft-relationship-section">
              <div className="recompft-relationship-header">
                <span className="recompft-relationship-icon">🤝</span>
                <span className="recompft-relationship-title">Relationship</span>
              </div>
              <div className="recompft-relationship-badge">
                {recommendation.relationship}
              </div>
            </div>
          )}

          {/* Content and LinkedIn Section */}
          <div className="recompft-content-section">
            <div className="recompft-content-container">
              
              {/* Recommendation Content */}
              <div className="recompft-recommendation-content">
                <div className="recompft-content-header">
                  <span className="recompft-content-icon">💬</span>
                  <span className="recompft-content-title">Recommendation</span>
                </div>
                <div className="recompft-content-text-wrapper">
                  <p className="recompft-content-text">"{recommendation.content}"</p>
                </div>
              </div>

              {/* LinkedIn Profile Link */}
              {recommendation.linkedin_profile_url && (
                <div className="recompft-linkedin-section">
                  <a 
                    href={formatLinkedInUrl(recommendation.linkedin_profile_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="recompft-linkedin-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="recompft-linkedin-icon">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                    <span>Recommender's LinkedIn</span>
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Card Footer */}
          <div className="recompft-card-footer">
            {canFlip ? (
              <div className="recompft-flip-hint">
                <span className="recompft-hint-text">Tap for details</span>
                <span className="recompft-hint-arrow">→</span>
              </div>
            ) : (
              <div className="recompft-no-flip-hint">
                <span className="recompft-hint-text">Recommendation details</span>
              </div>
            )}
          </div>
        </div>

        {/* =================== BACK SIDE =================== */}
        <div className="recompft-card-face recompft-card-back">
          
          {/* Back Header */}
          <div className="recompft-back-header">
            <h3 className="recompft-back-title">{recommendation.recommender_name}</h3>
            <div className="recompft-back-subtitle">Additional Details</div>
          </div>

          {/* Scrollable Content */}
          <div className="recompft-back-content">
            
            {/* Recommender Title */}
            {recommendation.recommender_title && (
              <div className="recompft-detail-section">
                <div className="recompft-detail-header">
                  <span className="recompft-detail-icon">💼</span>
                  <span className="recompft-detail-title">Position</span>
                </div>
                <p className="recompft-detail-text">{recommendation.recommender_title}</p>
              </div>
            )}

            {/* Organization */}
            {recommendation.organization && (
              <div className="recompft-detail-section">
                <div className="recompft-detail-header">
                  <span className="recompft-detail-icon">🏢</span>
                  <span className="recompft-detail-title">Organization</span>
                </div>
                <p className="recompft-detail-text">{recommendation.organization}</p>
              </div>
            )}

            {/* Date Received */}
            {recommendation.date_received && (
              <div className="recompft-detail-section">
                <div className="recompft-detail-header">
                  <span className="recompft-detail-icon">📅</span>
                  <span className="recompft-detail-title">Date Received</span>
                </div>
                <p className="recompft-detail-text">{formatDate(recommendation.date_received)}</p>
              </div>
            )}

            {/* Rating */}
            {recommendation.rating && (
              <div className="recompft-detail-section">
                <div className="recompft-detail-header">
                  <span className="recompft-detail-icon">⭐</span>
                  <span className="recompft-detail-title">Rating</span>
                </div>
                <div className="recompft-rating-display">
                  {[...Array(5)].map((_, index) => (
                    <span 
                      key={index} 
                      className={`recompft-star ${index < recommendation.rating ? 'recompft-filled' : 'recompft-empty'}`}
                    >
                      ★
                    </span>
                  ))}
                  <span className="recompft-rating-text">({recommendation.rating}/5)</span>
                </div>
              </div>
            )}

            {/* Recommendation Type */}
            {recommendation.recommendation_type && (
              <div className="recompft-detail-section">
                <div className="recompft-detail-header">
                  <span className="recompft-detail-icon">📝</span>
                  <span className="recompft-detail-title">Type</span>
                </div>
                <div className="recompft-type-badge">
                  {recommendation.recommendation_type}
                </div>
              </div>
            )}
          </div>

          {/* Back Footer */}
          <div className="recompft-card-footer">
            <div className="recompft-flip-hint">
              <span className="recompft-hint-arrow">←</span>
              <span className="recompft-hint-text">Back to recommendation</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecommendationCard;