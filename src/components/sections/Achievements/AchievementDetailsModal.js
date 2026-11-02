// =====================================================
// AchievementDetailsModal.js - Updated with Enhanced Overlay & No Certificate Button
// Blue Theme with Isolated Modal Experience
// =====================================================

import React, { useEffect, useRef } from 'react';

const AchievementDetailsModal = ({ achievement, onClose }) => {
  console.log('🔍 Rendering AchievementDetailsModal for:', achievement?.title);

  const modalRef = useRef(null);
  const contentRef = useRef(null);

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

  // Check if content is scrollable
  const isContentScrollable = () => {
    if (contentRef.current) {
      return contentRef.current.scrollHeight > contentRef.current.clientHeight;
    }
    return false;
  };

  // Format verification URL for display
  const formatVerificationUrl = (url) => {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url.length > 50 ? url.substring(0, 47) + '...' : url;
    }
  };

  // Enhanced organization logic with proper labeling
  const getOrganizationInfo = () => {
    if (achievement.issuing_organization && achievement.issuing_organization.trim()) {
      return {
        label: 'Issuing Organization',
        value: achievement.issuing_organization,
        icon: '🏢',
        type: 'organization'
      };
    } else if (achievement.competition_name && achievement.competition_name.trim()) {
      return {
        label: 'Competition Name',
        value: achievement.competition_name,
        icon: '🏆',
        type: 'competition'
      };
    }
    return null;
  };

  const formatAchievementDate = () => {
    if (!achievement.date_achieved) return null;
    
    try {
      // Parse the date string directly without timezone conversion
      const dateString = achievement.date_achieved;
      
      // Handle different date formats from database
      let dateParts;
      if (dateString.includes('-')) {
        // Format: YYYY-MM-DD or YYYY-MM-DD HH:MM:SS
        dateParts = dateString.split('T')[0].split('-'); // Take only date part, ignore time
      } else {
        console.warn('Unexpected date format:', dateString);
        return null;
      }
      
      if (dateParts.length !== 3) return null;
      
      const year = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]);
      const day = parseInt(dateParts[2]);
      
      // Validate date parts
      if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      
      // Create date object using UTC to avoid timezone shifts
      const date = new Date(Date.UTC(year, month - 1, day));
      
      // Format date as "15 March 2023" format using UTC methods
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      
      const formattedDate = `${day} ${monthNames[month - 1]} ${year}`;
      
      // Calculate days since achievement using the raw date values
      const today = new Date();
      const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
      const timeDiff = todayUTC.getTime() - date.getTime();
      const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
      
      return {
        formatted: formattedDate,
        daysSince: daysDiff >= 0 ? daysDiff : null
      };
    } catch (error) {
      console.error('Error formatting achievement date:', error);
      return null;
    }
  };

  if (!achievement) return null;

  const organizationInfo = getOrganizationInfo();
  const achievementDate = formatAchievementDate();

  return (
    <div 
      className="achievement-details-modal-overlay" 
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="achievement-details-modal-title"
      aria-describedby="achievement-details-modal-description"
    >
      <div className="achievement-details-modal">
        {/* Modal Header */}
        <div className="achievement-details-modal-header">
          <div className="achievement-details-header-content">
            <h2 id="achievement-details-modal-title" className="achievement-details-modal-title">
              {achievement.title}
            </h2>
            {/* Enhanced organization display with proper types */}
            {organizationInfo && (
              <div className={`achievement-organization-display ${organizationInfo.type}`}>
                <span className="organization-label">{organizationInfo.label}:</span>
                <span className="organization-value">{organizationInfo.value}</span>
              </div>
            )}
          </div>

          {/* Close Button */}
          <button 
            className="achievement-details-modal-close"
            onClick={onClose}
            aria-label="Close achievement details"
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* Modal Content - Scrollable */}
        <div 
          className={`achievement-details-modal-content ${isContentScrollable() ? 'scrollable' : ''}`}
          ref={contentRef}
          id="achievement-details-modal-description"
        >
          
          {/* Achievement Date Section with enhanced formatting */}
          {achievementDate && (
            <div className="achievement-details-section">
              <div className="achievement-details-card priority-high">
                <div className="achievement-detail-header">
                  <span className="achievement-detail-icon">📅</span>
                  <span className="achievement-detail-title">Achievement Date</span>
                </div>
                <div className="achievement-date-display">
                  <span className="achievement-date-value">
                    {achievementDate.formatted}
                  </span>
                  {achievementDate.daysSince !== null && achievementDate.daysSince >= 0 && (
                    <span className="achievement-time-since">
                      {achievementDate.daysSince === 0 ? 'Achieved today' : 
                       achievementDate.daysSince === 1 ? 'Achieved 1 day ago' :
                       `Achieved ${achievementDate.daysSince} days ago`}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Organization/Competition Section with enhanced styling */}
          {organizationInfo && (
            <div className="achievement-details-section">
              <div className={`achievement-details-card priority-high ${organizationInfo.type}-card`}>
                <div className="achievement-detail-header">
                  <span className="achievement-detail-icon">{organizationInfo.icon}</span>
                  <span className="achievement-detail-title">{organizationInfo.label}</span>
                </div>
                <div className={`achievement-organization-content ${organizationInfo.type}-content`}>
                  <p className="achievement-organization-description">
                    {organizationInfo.value}
                  </p>
                  {organizationInfo.type === 'competition' && (
                    <div className="competition-badge">
                      <span className="competition-icon">🏆</span>
                      <span className="competition-text">Competition</span>
                    </div>
                  )}
                  {organizationInfo.type === 'organization' && (
                    <div className="organization-badge">
                      <span className="organization-icon">🏢</span>
                      <span className="organization-text">Official Recognition</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Description Section */}
          {achievement.description && achievement.description.trim() && (
            <div className="achievement-details-section">
              <div className="achievement-details-card priority-medium">
                <div className="achievement-detail-header">
                  <span className="achievement-detail-icon">📝</span>
                  <span className="achievement-detail-title">Description</span>
                </div>
                <p className="achievement-description-text">
                  {achievement.description}
                </p>
              </div>
            </div>
          )}

          {/* Category Section */}
          {achievement.category && achievement.category.trim() && (
            <div className="achievement-details-section">
              <div className="achievement-details-card priority-medium">
                <div className="achievement-detail-header">
                  <span className="achievement-detail-icon">🏷️</span>
                  <span className="achievement-detail-title">Category</span>
                </div>
                <div className="achievement-category-tag">
                  {achievement.category}
                </div>
              </div>
            </div>
          )}

          {/* Position & Participants Section */}
          {(achievement.position || achievement.participants_count) && (
            <div className="achievement-details-section">
              <div className="achievement-details-card priority-medium">
                <div className="achievement-detail-header">
                  <span className="achievement-detail-icon">🥇</span>
                  <span className="achievement-detail-title">Competition Details</span>
                </div>
                <div className="achievement-competition-grid">
                  {achievement.position && (
                    <div className="achievement-competition-item">
                      <span className="achievement-competition-label">Position:</span>
                      <span className="achievement-competition-value position-highlight">
                        {achievement.position}
                      </span>
                    </div>
                  )}
                  {achievement.participants_count && (
                    <div className="achievement-competition-item">
                      <span className="achievement-competition-label">Participants:</span>
                      <span className="achievement-competition-value">
                        {achievement.participants_count.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Impact Section */}
          {achievement.impact && achievement.impact.trim() && (
            <div className="achievement-details-section">
              <div className="achievement-details-card priority-medium">
                <div className="achievement-detail-header">
                  <span className="achievement-detail-icon">💡</span>
                  <span className="achievement-detail-title">Impact</span>
                </div>
                <p className="achievement-impact-text">
                  {achievement.impact}
                </p>
              </div>
            </div>
          )}

          {/* Verification URL Section */}
          {achievement.verification_url && achievement.verification_url.trim() && (
            <div className="achievement-details-section">
              <div className="achievement-details-card priority-low">
                <div className="achievement-detail-header">
                  <span className="achievement-detail-icon">🔗</span>
                  <span className="achievement-detail-title">Verification</span>
                </div>
                <div className="achievement-verification-info">
                  <a 
                    href={achievement.verification_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="achievement-verification-link"
                    aria-label="Verify achievement details"
                  >
                    <span className="verification-link-text">{formatVerificationUrl(achievement.verification_url)}</span>
                    <svg viewBox="0 0 24 24" fill="none" className="external-achievement-link-icon">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer - UPDATED: Removed Certificate Button */}
        <div className="achievement-details-modal-footer">
          <div className="achievement-modal-actions">
            {/* REMOVED: View Certificate Button */}
            
            {/* Close Button */}
            <button 
              className="achievement-action-btn close-achievement-btn secondary"
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

export default AchievementDetailsModal;