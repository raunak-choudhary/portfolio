// =====================================================
// LeadershipCard.js - FIXED VERSION with ldrpft- prefix
// Fixed positioning issue during card flip
// =====================================================

import React, { useState, useEffect } from 'react';

const LeadershipCard = ({ leadership }) => {
  console.log('🎨 Rendering FIXED LeadershipCard:', leadership?.title);

  const [isFlipped, setIsFlipped] = useState(false);

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long'
      });
    } catch (error) {
      return 'N/A';
    }
  };

  // Format duration display
  const formatDuration = () => {
    const startDate = formatDate(leadership.start_date);
    const endDate = leadership.is_current ? 'Present' : formatDate(leadership.end_date);
    return `${startDate} - ${endDate}`;
  };

  // Check if there's content for back side
  const hasBackContent = () => {
    return (
      (leadership.key_responsibilities && leadership.key_responsibilities.length > 0) ||
      (leadership.achievements && leadership.achievements.length > 0) ||
      leadership.challenges_overcome ||
      leadership.impact ||
      (leadership.recognition_received && leadership.recognition_received.length > 0) ||
      (leadership.training_provided && leadership.training_provided.length > 0) ||
      leadership.organization_type ||
      leadership.team_size ||
      leadership.budget_managed ||
      leadership.volunteer_hours ||
      leadership.initiative_type ||
      leadership.mentees_count
    );
  };

  const canFlip = hasBackContent();

  // Card flip handler
  const handleCardClick = (e) => {
    // Don't flip if clicking on specific elements or if no back content
    if (!canFlip || 
        e.target.closest('.ldrpft-flip-icon-btn') ||
        e.target.closest('.ldrpft-featured-badge') ||
        e.target.closest('.ldrpft-status-badge')) {
      return;
    }
    
    console.log('🔄 Card flip triggered for:', leadership?.title);
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
      className={`ldrpft-card-wrapper ${isFlipped ? 'ldrpft-flipped' : ''} ${!canFlip ? 'ldrpft-no-flip' : ''}`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Leadership position card: ${leadership.title} at ${leadership.organization}. ${canFlip ? 'Press Enter or Space to flip and see details.' : 'No additional details available.'}`}
      aria-pressed={isFlipped}
    >
      <div className="ldrpft-card-3d">
        
        {/* =================== FRONT SIDE =================== */}
        <div className="ldrpft-card-side ldrpft-card-front">
          
          {/* Featured Badge - MOVED TO TOP */}
          {leadership.is_featured && (
            <div className="ldrpft-featured-section">
              <div className="ldrpft-featured-badge">
                <svg viewBox="0 0 24 24" fill="currentColor" className="ldrpft-star-icon">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                <span>Featured</span>
              </div>
            </div>
          )}

          {/* Header with Organization Initials and Flip Icon */}
          <div className="ldrpft-card-header">
            {/* Flip Icon - only show if there's back content */}
            {canFlip && (
              <button 
                className="ldrpft-flip-icon-btn"
                onClick={handleFlipIconClick}
                aria-label="Flip card to see details"
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 12l18-9v18l-18-9z" fill="currentColor"/>
                </svg>
              </button>
            )}
          </div>

          {/* Position Title */}
          <div className="ldrpft-title-section">
            <h3 className="ldrpft-position-title">{leadership.title?.toUpperCase()}</h3>
            <div className="ldrpft-title-underline"></div>
          </div>

          {/* Organization */}
          <div className="ldrpft-organization-section">
            <h4 className="ldrpft-organization-name">{leadership.organization}</h4>
          </div>

          {/* Location */}
          {leadership.location && (
            <div className="ldrpft-location-section">
              <div className="ldrpft-location-badge">
                <svg viewBox="0 0 24 24" fill="currentColor" className="ldrpft-location-icon">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
                <span>{leadership.location}</span>
              </div>
            </div>
          )}

          {/* Description with scrollable frame */}
          {leadership.description && (
            <div className="ldrpft-description-section">
              <div className="ldrpft-description-container">
                <div className="ldrpft-description-header">
                  <span className="ldrpft-description-icon">📝</span>
                  <span className="ldrpft-description-title">Description</span>
                </div>
                <div className="ldrpft-description-text-wrapper">
                  <p className="ldrpft-description-text">{leadership.description}</p>
                </div>
              </div>
            </div>
          )}

          {/* Duration */}
          <div className="ldrpft-duration-section">
            <div className="ldrpft-duration-header">
              <span className="ldrpft-duration-icon">📅</span>
              <span className="ldrpft-duration-title">Duration</span>
            </div>
            <p className="ldrpft-duration-text">{formatDuration()}</p>
          </div>

          {/* Status Badge */}
          <div className="ldrpft-status-section">
            <div className={`ldrpft-status-badge ${leadership.is_current ? 'ldrpft-active' : 'ldrpft-inactive'}`}>
              <span className="ldrpft-status-icon">
                {leadership.is_current ? '🟢' : '🔴'}
              </span>
              <span className="ldrpft-status-text">
                {leadership.is_current ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
          </div>

          {/* Skills Preview - First 5 skills */}
          {leadership.skills_developed && leadership.skills_developed.length > 0 && (
            <div className="ldrpft-skills-preview-section">
              <div className="ldrpft-skills-header">
                <span className="ldrpft-skills-icon">🎯</span>
                <span className="ldrpft-skills-title">Skills Developed</span>
              </div>
              <div className="ldrpft-skills-preview-container">
                {leadership.skills_developed.slice(0, 5).map((skill, index) => (
                  <span key={index} className="ldrpft-skill-tag-preview">
                    {skill}
                  </span>
                ))}
                {leadership.skills_developed.length > 5 && (
                  <span className="ldrpft-skill-tag-more">
                    +{leadership.skills_developed.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Card Footer */}
          <div className="ldrpft-card-footer">
            {canFlip ? (
              <div className="ldrpft-flip-hint">
                <span className="ldrpft-hint-text">Tap for details</span>
                <span className="ldrpft-hint-arrow">→</span>
              </div>
            ) : (
              <div className="ldrpft-no-flip-hint">
                <span className="ldrpft-hint-text">Position overview</span>
              </div>
            )}
          </div>
        </div>

        {/* =================== BACK SIDE =================== */}
        <div className="ldrpft-card-side ldrpft-card-back">
          
          {/* Back Header */}
          <div className="ldrpft-back-header">
            <h3 className="ldrpft-back-title">{leadership.title}</h3>
            <div className="ldrpft-back-subtitle">{leadership.organization}</div>
          </div>

          {/* Scrollable Content Area */}
          <div className="ldrpft-back-content">
            
            {/* Key Responsibilities */}
            {leadership.key_responsibilities && leadership.key_responsibilities.length > 0 && (
              <div className="ldrpft-detail-section">
                <div className="ldrpft-detail-header">
                  <span className="ldrpft-detail-icon">💼</span>
                  <span className="ldrpft-detail-title">Key Responsibilities</span>
                </div>
                <ul className="ldrpft-detail-list">
                  {leadership.key_responsibilities.map((responsibility, index) => (
                    <li key={index} className="ldrpft-detail-item">{responsibility}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Achievements */}
            {leadership.achievements && leadership.achievements.length > 0 && (
              <div className="ldrpft-detail-section">
                <div className="ldrpft-detail-header">
                  <span className="ldrpft-detail-icon">🏆</span>
                  <span className="ldrpft-detail-title">Achievements</span>
                </div>
                <ul className="ldrpft-detail-list">
                  {leadership.achievements.map((achievement, index) => (
                    <li key={index} className="ldrpft-detail-item">{achievement}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Challenges Overcome */}
            {leadership.challenges_overcome && (
              <div className="ldrpft-detail-section">
                <div className="ldrpft-detail-header">
                  <span className="ldrpft-detail-icon">⚡</span>
                  <span className="ldrpft-detail-title">Challenges Overcome</span>
                </div>
                <p className="ldrpft-detail-text">{leadership.challenges_overcome}</p>
              </div>
            )}

            {/* Impact */}
            {leadership.impact && (
              <div className="ldrpft-detail-section">
                <div className="ldrpft-detail-header">
                  <span className="ldrpft-detail-icon">💫</span>
                  <span className="ldrpft-detail-title">Impact</span>
                </div>
                <p className="ldrpft-detail-text">{leadership.impact}</p>
              </div>
            )}

            {/* Recognition Received */}
            {leadership.recognition_received && leadership.recognition_received.length > 0 && (
              <div className="ldrpft-detail-section">
                <div className="ldrpft-detail-header">
                  <span className="ldrpft-detail-icon">🎖️</span>
                  <span className="ldrpft-detail-title">Recognition Received</span>
                </div>
                <ul className="ldrpft-detail-list">
                  {leadership.recognition_received.map((recognition, index) => (
                    <li key={index} className="ldrpft-detail-item">{recognition}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Training Provided */}
            {leadership.training_provided && leadership.training_provided.length > 0 && (
              <div className="ldrpft-detail-section">
                <div className="ldrpft-detail-header">
                  <span className="ldrpft-detail-icon">📚</span>
                  <span className="ldrpft-detail-title">Training Provided</span>
                </div>
                <ul className="ldrpft-detail-list">
                  {leadership.training_provided.map((training, index) => (
                    <li key={index} className="ldrpft-detail-item">{training}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* All Skills Developed */}
            {leadership.skills_developed && leadership.skills_developed.length > 0 && (
              <div className="ldrpft-detail-section">
                <div className="ldrpft-detail-header">
                  <span className="ldrpft-detail-icon">🎯</span>
                  <span className="ldrpft-detail-title">All Skills Developed</span>
                </div>
                <div className="ldrpft-skills-all-container">
                  {leadership.skills_developed.map((skill, index) => (
                    <span key={index} className="ldrpft-skill-tag-back">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Outside Frame - Separate Display */}
          <div className="ldrpft-back-metadata">
            <div className="ldrpft-metadata-grid">
              
              {/* Organization Type */}
              {leadership.organization_type && (
                <div className="ldrpft-metadata-item">
                  <span className="ldrpft-metadata-label">Type</span>
                  <span className="ldrpft-metadata-value">{leadership.organization_type}</span>
                </div>
              )}

              {/* Team Size */}
              {leadership.team_size && (
                <div className="ldrpft-metadata-item">
                  <span className="ldrpft-metadata-label">Team Size</span>
                  <span className="ldrpft-metadata-value">{leadership.team_size}</span>
                </div>
              )}

              {/* Budget Managed */}
              {leadership.budget_managed && (
                <div className="ldrpft-metadata-item">
                  <span className="ldrpft-metadata-label">Budget</span>
                  <span className="ldrpft-metadata-value">{leadership.budget_managed}</span>
                </div>
              )}

              {/* Volunteer Hours */}
              {leadership.volunteer_hours && (
                <div className="ldrpft-metadata-item">
                  <span className="ldrpft-metadata-label">Vol. Hours</span>
                  <span className="ldrpft-metadata-value">{leadership.volunteer_hours}</span>
                </div>
              )}

              {/* Initiative Type */}
              {leadership.initiative_type && (
                <div className="ldrpft-metadata-item">
                  <span className="ldrpft-metadata-label">Initiative</span>
                  <span className="ldrpft-metadata-value">{leadership.initiative_type}</span>
                </div>
              )}

              {/* Mentees Count */}
              {leadership.mentees_count && (
                <div className="ldrpft-metadata-item">
                  <span className="ldrpft-metadata-label">Mentees</span>
                  <span className="ldrpft-metadata-value">{leadership.mentees_count}</span>
                </div>
              )}
            </div>
          </div>

          {/* Back Footer */}
          <div className="ldrpft-card-footer">
            <div className="ldrpft-flip-hint">
              <span className="ldrpft-hint-arrow">←</span>
              <span className="ldrpft-hint-text">Back to overview</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadershipCard;