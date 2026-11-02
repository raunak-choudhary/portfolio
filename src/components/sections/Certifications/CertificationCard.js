// =====================================================
// CertificationCard.js - Individual Certification Card
// Yellow/Gold Theme with Direct Certificate Opening
// =====================================================

import React from 'react';

const CertificationCard = ({ certification, onViewDetails }) => {
  console.log('🏆 Rendering CertificationCard:', certification?.title);

  // Smart button logic based on available data
  const hasTitle = certification.title && certification.title.trim() !== '';
  const hasCertificateUrl = certification.certificate_pdf_url && certification.certificate_pdf_url.trim() !== '';
  
  // Check if there's meaningful data beyond just title
  const hasOtherData = Boolean(
    certification.issuer ||
    certification.description ||
    certification.issue_date ||
    certification.expiry_date ||
    certification.credential_id ||
    certification.credential_url ||
    certification.skills_covered?.length > 0 ||
    certification.certification_type ||
    certification.difficulty_level ||
    certification.verification_status
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
      console.log('📄 Opening certificate in new window:', certification.certificate_pdf_url);
      
      // Open certificate in new window/tab
      window.open(certification.certificate_pdf_url, '_blank', 'noopener,noreferrer');
      
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
    console.warn('CertificationCard: No title provided, skipping render');
    return null;
  }

  return (
    <div className="certification-card-wrapper">
      {/* Featured Badge - NOW OUTSIDE the card */}
      {certification.is_featured && (
        <div className="featured-badge">
          <div className="featured-star">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <div className="featured-pulse"></div>
        </div>
      )}
      
      <div className={`certification-card glass-card ${certification.is_featured ? 'featured-certification' : ''}`}>
        {/* Card Content */}
        <div className="certification-card-content">
          {/* Certification Title - Centered */}
          <div className="certification-title">
            {certification.title}
          </div>

          {/* Horizontal Line Separator */}
          <div className="title-separator"></div>

          {/* Footer Buttons - Smart Display Logic */}
          {showButtons && (
            <div className={`certification-actions ${!showViewCertificate || !showViewDetails ? 'single-button' : 'dual-buttons'}`}>
              {/* View Certificate Button - UPDATED: Direct opening */}
              {showViewCertificate && (
                <button
                  className="certification-btn view-certificate-btn"
                  onClick={handleCertificateClick}
                  onKeyDown={(e) => handleKeyDown(e, handleCertificateClick)}
                  aria-label={`View certificate for ${certification.title}`}
                >
                  <span>View Certificate</span>
                </button>
              )}

              {/* View Details Button */}
              {showViewDetails && (
                <button
                  className="certification-btn view-details-btn"
                  onClick={handleDetailsClick}
                  onKeyDown={(e) => handleKeyDown(e, handleDetailsClick)}
                  aria-label={`View details for ${certification.title}`}
                >
                  <span>View Details</span>
                </button>
              )}
            </div>
          )}

          {/* No Buttons State - Just Title Display */}
          {!showButtons && (
            <div className="no-actions-message">
              <span className="limited-info-text">Basic Information</span>
            </div>
          )}
        </div>

        {/* Card Background Glow Effect */}
        <div className="card-background-glow"></div>
      </div>
    </div>
  );
};

export default CertificationCard;