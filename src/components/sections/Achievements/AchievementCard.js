// =====================================================
// AchievementCard.js - Individual Achievement Card
// Blue Theme with Direct Certificate Opening
// =====================================================

import React from 'react';

const AchievementCard = ({ achievement, onViewDetails }) => {
  console.log('🏆 Rendering AchievementCard:', achievement?.title);

  // Smart button logic based on available data
  const hasTitle = achievement.title && achievement.title.trim() !== '';
  const hasCertificateUrl = achievement.certificate_url && achievement.certificate_url.trim() !== '';
  
  // Check if there's meaningful data beyond just title
  const hasOtherData = Boolean(
    achievement.description ||
    achievement.date_achieved ||
    achievement.category ||
    achievement.issuing_organization ||
    achievement.competition_name ||
    achievement.position ||
    achievement.participants_count ||
    achievement.impact ||
    achievement.verification_url
  );

  // Determine button display logic
  const showViewCertificate = hasCertificateUrl;
  const showViewDetails = hasOtherData;
  const showButtons = hasTitle && (showViewCertificate || showViewDetails);

  // Handle keyboard navigation for accessibility
  const handleKeyDown = (e, action) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };

  // Handle certificate view - UPDATED: Direct window opening
  const handleCertificateClick = () => {
    if (hasCertificateUrl) {
      console.log('📄 Opening certificate in new window:', achievement.certificate_url);
      
      // Open certificate in new window/tab
      window.open(achievement.certificate_url, '_blank', 'noopener,noreferrer');
      
      // Add haptic feedback for mobile devices
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }
  };

  // Handle details view
  const handleDetailsClick = () => {
    if (onViewDetails && hasOtherData) {
      onViewDetails();
    }
  };

  // Don't render if no title
  if (!hasTitle) {
    console.warn('AchievementCard: No title provided, skipping render');
    return null;
  }

  return (
    <div className="accomplishment-card-wrapper">
      {/* Featured Badge - LEFT positioned, blue theme */}
      {achievement.is_featured && (
        <div className="achievement-featured-badge">
          <div className="achievement-featured-star">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <div className="achievement-featured-pulse"></div>
        </div>
      )}
      
      <div className={`accomplishment-card glass-achievement-card ${achievement.is_featured ? 'distinguished-accomplishment' : ''}`}>
        {/* Card Content */}
        <div className="accomplishment-card-content">
          {/* Achievement Title - Centered */}
          <div className="accomplishment-title">
            {achievement.title}
          </div>

          {/* Horizontal Line Separator */}
          <div className="accomplishment-separator"></div>

          {/* Footer Buttons - Smart Display Logic */}
          {showButtons && (
            <div className={`accomplishment-actions ${!showViewCertificate || !showViewDetails ? 'single-action' : 'dual-actions'}`}>
              {/* View Certificate Button - UPDATED: Direct opening */}
              {showViewCertificate && (
                <button
                  className="accomplishment-btn view-achievement-certificate-btn"
                  onClick={handleCertificateClick}
                  onKeyDown={(e) => handleKeyDown(e, handleCertificateClick)}
                  aria-label={`View certificate for ${achievement.title}`}
                >
                  <span>View Certificate</span>
                </button>
              )}

              {/* View Details Button */}
              {showViewDetails && (
                <button
                  className="accomplishment-btn view-achievement-details-btn"
                  onClick={handleDetailsClick}
                  onKeyDown={(e) => handleKeyDown(e, handleDetailsClick)}
                  aria-label={`View details for ${achievement.title}`}
                >
                  <span>View Details</span>
                </button>
              )}
            </div>
          )}

          {/* No Buttons State - Just Title Display */}
          {!showButtons && (
            <div className="no-achievement-actions-message">
              <span className="basic-achievement-info-text">Basic Information</span>
            </div>
          )}
        </div>

        {/* Card Background Glow Effect */}
        <div className="accomplishment-background-glow"></div>
      </div>
    </div>
  );
};

export default AchievementCard;