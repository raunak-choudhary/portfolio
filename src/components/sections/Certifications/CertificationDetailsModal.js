// =====================================================
// CertificationDetailsModal.js - Enhanced Overlay & No Certificate Button
// Yellow/Gold Theme with Isolated Modal Experience
// =====================================================

import React, { useEffect, useRef, useState } from 'react';

const CertificationDetailsModal = ({ certification, onClose }) => {
  console.log('🔍 Rendering CertificationDetailsModal for:', certification?.title);

  const modalRef = useRef(null);
  const contentRef = useRef(null);
  const [logoError, setLogoError] = useState(false);

  // REMOVED: handleOverlayClick - Modal should NOT close on backdrop click
  
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // ENHANCED: Focus trap for accessibility + prevent background interaction
  useEffect(() => {
    const modal = modalRef.current;
    if (modal) {
      const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      const handleTabKey = (e) => {
        if (e.key === 'Tab') {
          if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      };

      // ENHANCED: Prevent all background interactions
      const preventBackgroundInteraction = (e) => {
        // Only allow interaction within the modal
        if (!modal.contains(e.target)) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      };

      modal.addEventListener('keydown', handleTabKey);
      
      // ENHANCED: Block all background interactions
      document.addEventListener('click', preventBackgroundInteraction, true);
      document.addEventListener('scroll', preventBackgroundInteraction, true);
      document.addEventListener('wheel', preventBackgroundInteraction, { passive: false });
      document.addEventListener('touchmove', preventBackgroundInteraction, { passive: false });
      
      firstElement?.focus();

      return () => {
        modal.removeEventListener('keydown', handleTabKey);
        document.removeEventListener('click', preventBackgroundInteraction, true);
        document.removeEventListener('scroll', preventBackgroundInteraction, true);
        document.removeEventListener('wheel', preventBackgroundInteraction);
        document.removeEventListener('touchmove', preventBackgroundInteraction);
      };
    }
  }, []);

  // ENHANCED: Disable main page scroll and add overlay management
  useEffect(() => {
    // Disable main page scroll
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';

    return () => {
      // Restore original scroll behavior
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.width = '';
      document.body.style.height = '';
    };
  }, []);

  // Generate issuer initials for fallback
  const generateIssuerInitials = (issuer) => {
    if (!issuer) return 'IS';
    
    const words = issuer.split(' ').filter(word => word.length > 0);
    if (words.length === 1) {
      return words[0].substring(0, 2).toUpperCase();
    }
    return words.slice(0, 2).map(word => word.charAt(0).toUpperCase()).join('');
  };

  // Handle logo error
  const handleLogoError = () => {
    console.warn('Failed to load issuer logo:', certification.issuer_logo_url);
    setLogoError(true);
  };

  // Check if content is scrollable
  const isContentScrollable = () => {
    if (contentRef.current) {
      return contentRef.current.scrollHeight > contentRef.current.clientHeight;
    }
    return false;
  };

  // Format credential URL for display
  const formatCredentialUrl = (url) => {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url.length > 50 ? url.substring(0, 47) + '...' : url;
    }
  };

  if (!certification) return null;

  return (
    <div 
      className="certification-details-modal-overlay" 
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="details-modal-title"
      aria-describedby="details-modal-description"
    >
      <div className="certification-details-modal">
        {/* Modal Header */}
        <div className="details-modal-header">
          <div className="details-header-content">
            {/* Issuer Logo or Initials */}
            <div className="issuer-logo-container">
              {certification.issuer_logo_url && !logoError ? (
                <img 
                  src={certification.issuer_logo_url}
                  alt={`${certification.issuer} logo`}
                  className="issuer-logo"
                  onError={handleLogoError}
                />
              ) : (
                <div className="issuer-initials">
                  {generateIssuerInitials(certification.issuer)}
                </div>
              )}
            </div>
            
            <div className="details-title-section">
              <h2 id="details-modal-title" className="details-modal-title">
                {certification.title}
              </h2>
              <div className="certification-issuer-name">
                {certification.issuer}
              </div>
            </div>
          </div>

          {/* Close Button */}
          <button 
            className="details-modal-close"
            onClick={onClose}
            aria-label="Close certification details"
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* Modal Content - Scrollable */}
        <div 
          className={`details-modal-content ${isContentScrollable() ? 'scrollable' : ''}`}
          ref={contentRef}
          id="details-modal-description"
        >
          
          {/* Dates Section */}
          <div className="details-section dates-section">
            <div className="details-card priority-high">
              <div className="detail-header">
                <span className="detail-icon">📅</span>
                <span className="detail-title">Certification Dates</span>
              </div>
              <div className="dates-grid">
                <div className="date-item">
                    <span className="date-label">Issue Date:</span>
                    <span className="date-value">
                        {certification.issue_date ? 
                        new Date(certification.issue_date + 'T00:00:00').toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long', 
                            day: 'numeric'
                        }) : 'N/A'
                        }
                    </span>
                </div>
                <div className="date-item">
                    <span className="date-label">Expiry Date:</span>
                    <span className={`date-value ${certification.is_expired ? 'expired' : ''}`}>
                        {certification.expiry_date ? 
                        new Date(certification.expiry_date + 'T00:00:00').toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long', 
                            day: 'numeric'
                        }) : 'No expiration'
                        }
                    </span>
                </div>
                {certification.days_until_expiry !== null && certification.days_until_expiry > 0 && (
                  <div className="expiry-warning">
                    <span className="warning-icon">⏰</span>
                    <span className="warning-text">
                      Expires in {certification.days_until_expiry} days
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Description Section */}
          {certification.description && certification.description.trim() && (
            <div className="details-section">
              <div className="details-card priority-medium">
                <div className="detail-header">
                  <span className="detail-icon">📝</span>
                  <span className="detail-title">Description</span>
                </div>
                <p className="certification-description">
                  {certification.description}
                </p>
              </div>
            </div>
          )}

          {/* Skills Covered Section */}
          {certification.skills_covered && certification.skills_covered.length > 0 && (
            <div className="details-section">
              <div className="details-card priority-medium">
                <div className="detail-header">
                  <span className="detail-icon">🛠️</span>
                  <span className="detail-title">Skills Covered ({certification.skills_covered.length})</span>
                </div>
                <div className="skills-covered-grid">
                  {certification.skills_covered.map((skill, index) => (
                    <div key={index} className="skill-tag">
                      {skill}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Credential Information */}
          {(certification.credential_id || certification.credential_url) && (
            <div className="details-section credentials-section">
              <div className="details-card priority-medium">
                <div className="detail-header">
                  <span className="detail-icon">🔗</span>
                  <span className="detail-title">Credential Information</span>
                </div>
                <div className="credential-info">
                  {certification.credential_id && (
                    <div className="credential-item">
                      <span className="credential-label">Credential ID:</span>
                      <span className="credential-value credential-id">
                        {certification.credential_id}
                      </span>
                    </div>
                  )}
                  {certification.credential_url && (
                    <div className="credential-item">
                      <span className="credential-label">Verification URL:</span>
                      <a 
                        href={certification.credential_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="credential-link"
                        aria-label="Verify certification credentials"
                      >
                        <span className="link-text">{formatCredentialUrl(certification.credential_url)}</span>
                        <svg viewBox="0 0 24 24" fill="none" className="external-link-icon">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2"/>
                        </svg>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Certification Metadata */}
          {(certification.certification_type || certification.difficulty_level || certification.verification_status) && (
            <div className="details-section">
              <div className="details-card priority-low">
                <div className="detail-header">
                  <span className="detail-icon">📊</span>
                  <span className="detail-title">Certification Details</span>
                </div>
                <div className="metadata-grid">
                  {certification.certification_type && (
                    <div className="metadata-item">
                      <span className="metadata-label">Type:</span>
                      <span className="metadata-value certification-type">
                        {certification.certification_type}
                      </span>
                    </div>
                  )}
                  {certification.difficulty_level && (
                    <div className="metadata-item">
                      <span className="metadata-label">Level:</span>
                      <span className="metadata-value difficulty-level">
                        {certification.difficulty_level}
                      </span>
                    </div>
                  )}
                  {certification.verification_status && (
                    <div className="metadata-item">
                      <span className="metadata-label">Status:</span>
                      <span className={`metadata-value verification-status ${certification.verification_status.toLowerCase()}`}>
                        {certification.verification_status}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer - UPDATED: Removed Certificate Button */}
        <div className="details-modal-footer">
          <div className="modal-actions">
            {/* REMOVED: View Certificate Button */}
            
            {/* Close Button */}
            <button 
              className="action-btn close-btn secondary"
              onClick={onClose}
            >
              <span>Close</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CertificationDetailsModal;