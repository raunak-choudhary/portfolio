import React, { useState, useEffect } from 'react';

const ExperienceCard = ({ workExperience }) => {
  console.log('🎨 Rendering ExperienceCard:', workExperience?.title);

  const [isFlipped, setIsFlipped] = useState(false);

  // Handle arrays from database
  const keyResponsibilities = Array.isArray(workExperience.key_responsibilities) ? workExperience.key_responsibilities : [];
  const achievements = Array.isArray(workExperience.achievements) ? workExperience.achievements : [];
  const technologies = Array.isArray(workExperience.technologies) ? workExperience.technologies : [];
  const clientsServed = Array.isArray(workExperience.clients_served) ? workExperience.clients_served : [];

  // Generate company initials for temp logo
  const generateCompanyInitials = (companyName) => {
    if (!companyName) return 'CO';
    
    const words = companyName.split(' ').filter(word => word.length > 0);
    if (words.length === 1) {
      return words[0].substring(0, 2).toUpperCase();
    }
    return words.slice(0, 2).map(word => word.charAt(0).toUpperCase()).join('');
  };

  // Format dates with fallback
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short' 
      });
    } catch (error) {
      return dateString || 'N/A';
    }
  };

  // Format duration
  const formatDuration = () => {
    const startDate = formatDate(workExperience.start_date);
    const endDate = workExperience.is_current ? 'Present' : formatDate(workExperience.end_date);
    return `${startDate} - ${endDate}`;
  };

  // Check if there's content for back side
  const hasBackContent = () => {
    return (
      workExperience.description ||
      keyResponsibilities.length > 0 ||
      achievements.length > 0 ||
      technologies.length > 0 ||
      clientsServed.length > 0 ||
      workExperience.reason_for_leaving ||
      workExperience.salary_range ||
      workExperience.team_size ||
      workExperience.department
    );
  };

  const canFlip = hasBackContent();

  // Card flip handler
  const handleCardClick = (e) => {
    // Don't flip if clicking on buttons, links, or if no back content
    if (!canFlip || 
        e.target.closest('.flip-icon-btn') || 
        e.target.closest('.status-badge') ||
        e.target.closest('.work-link')) {
      return;
    }
    
    console.log('🔄 Card flip triggered for:', workExperience?.title);
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
      className={`project-card-wrapper ${isFlipped ? 'flipped' : ''} ${!canFlip ? 'no-flip' : ''}`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Work experience card for ${workExperience.title} at ${workExperience.company}. ${canFlip ? 'Press Enter or Space to flip and see details.' : 'No additional details available.'}`}
      aria-pressed={isFlipped}
    >
      <div className="project-card-3d">
        
        {/* =================== FRONT SIDE =================== */}
        <div className="card-side card-front">
          
          {/* Header with Company Logo and Flip Icon */}
          <div className="card-header">
            <div className="company-logo-section">
              {workExperience.company_logo_url ? (
                <img 
                  src={workExperience.company_logo_url}
                  alt={`${workExperience.company} logo`}
                  className="company-logo company-logo-large"
                  onError={(e) => {
                    console.warn(`Failed to load company logo for ${workExperience.company}`);
                    e.target.style.display = 'none';
                    e.target.nextElementSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              
              {/* Temp logo with company initials */}
              <div 
                className="company-logo-temp company-logo-large"
                style={{ display: workExperience.company_logo_url ? 'none' : 'flex' }}
              >
                {generateCompanyInitials(workExperience.company)}
              </div>
            </div>

            {/* Flip Icon - only show if there's back content */}
            {canFlip && (
              <button 
                className="flip-icon-btn"
                onClick={handleFlipIconClick}
                aria-label="Flip card to see details"
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 12l18-9v18l-18-9z" fill="currentColor"/>
                </svg>
              </button>
            )}
          </div>

          {/* Job Title */}
          <div className="title-section">
            <h3 className="project-title">{workExperience.title}</h3>
            <div className="title-underline"></div>
          </div>

          {/* Company Name */}
          <div className="company-section">
            <h4 className="company-name">{workExperience.company}</h4>
          </div>

          {/* Employment Type */}
          <div className="employment-type-section">
            <div className="employment-type">
              {workExperience.employment_type || 'Full-time'}
            </div>
          </div>

          {/* Duration */}
          <div className="duration-section">
            <div className="duration-item">
              <span className="duration-label">Duration:</span>
              <span className="duration-value">{formatDuration()}</span>
            </div>
            {workExperience.duration && (
              <div className="duration-calculated">
                ({workExperience.duration})
              </div>
            )}
          </div>

          {/* Location and Status */}
          <div className="location-status-section">
            <div className="location-item">
              <span className="location-label">Location:</span>
              <span className="location-value">{workExperience.location || 'N/A'}</span>
            </div>
            <div className="status-section">
              <span 
                className={`status-badge ${workExperience.is_current ? 'status-active' : 'status-inactive'}`}
              >
              {workExperience.is_current ? 'ACTIVE' : 'NOT ACTIVE'}
              </span>
            </div>
          </div>

          {/* Performance Rating */}
          {workExperience.performance_rating && (
            <div className="rating-section">
              <div className="rating-item">
                <span className="rating-label">Performance:</span>
                <span className="rating-value">{workExperience.performance_rating}</span>
              </div>
            </div>
          )}

          {/* Card Footer */}
          <div className="card-footer">
            {canFlip ? (
              <div className="flip-hint">
                <span className="hint-text">Tap to explore details</span>
                <span className="hint-arrow">→</span>
              </div>
            ) : (
              <div className="no-flip-hint">
                <span className="hint-text">Basic information</span>
              </div>
            )}
          </div>
        </div>

        {/* =================== BACK SIDE =================== */}
        <div className="card-side card-back">
          
          {/* Back Header */}
          <div className="back-header">
            <h3 className="back-title">{workExperience.title}</h3>
            <div className="back-subtitle">{workExperience.company}</div>
          </div>

          {/* Scrollable Content */}
          <div className="back-content">
            
            {/* Description */}
            {workExperience.description && (
              <div className="detail-section">
                <div className="detail-header">
                  <span className="detail-icon">📋</span>
                  <span className="detail-title">Description</span>
                </div>
                <p className="detail-text">{workExperience.description}</p>
              </div>
            )}

            {/* Key Responsibilities */}
            {keyResponsibilities.length > 0 && (
              <div className="detail-section">
                <div className="detail-header">
                  <span className="detail-icon">✅</span>
                  <span className="detail-title">Key Responsibilities ({keyResponsibilities.length})</span>
                </div>
                <ul className="features-list">
                  {keyResponsibilities.map((responsibility, index) => (
                    <li key={index} className="feature-item">
                      <span className="feature-bullet">▸</span>
                      <span className="feature-text">{responsibility}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Achievements */}
            {achievements.length > 0 && (
              <div className="detail-section">
                <div className="detail-header">
                  <span className="detail-icon">🏆</span>
                  <span className="detail-title">Achievements ({achievements.length})</span>
                </div>
                <ul className="features-list">
                  {achievements.map((achievement, index) => (
                    <li key={index} className="feature-item">
                      <span className="feature-bullet">⭐</span>
                      <span className="feature-text">{achievement}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Technologies */}
            {technologies.length > 0 && (
              <div className="detail-section">
                <div className="detail-header">
                  <span className="detail-icon">🛠️</span>
                  <span className="detail-title">Technologies ({technologies.length})</span>
                </div>
                <div className="back-tech-grid">
                  {technologies.map((tech, index) => (
                    <span key={index} className="back-tech-tag">
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Clients Served */}
            {clientsServed.length > 0 && (
              <div className="detail-section">
                <div className="detail-header">
                  <span className="detail-icon">🤝</span>
                  <span className="detail-title">Clients Served ({clientsServed.length})</span>
                </div>
                <div className="back-tech-grid">
                  {clientsServed.map((client, index) => (
                    <span key={index} className="back-tech-tag">
                      {client}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Reason for Leaving */}
            {workExperience.reason_for_leaving && (
              <div className="detail-section">
                <div className="detail-header">
                  <span className="detail-icon">🚪</span>
                  <span className="detail-title">Reason for Leaving</span>
                </div>
                <p className="detail-text">{workExperience.reason_for_leaving}</p>
              </div>
            )}
          </div>

          {/* Fixed Bottom Section */}
          <div className="back-fixed-section">
            <div className="fixed-details-grid">
              {workExperience.salary_range && (
                <div className="fixed-detail-item">
                  <span className="fixed-detail-label">💰 Salary:</span>
                  <span className="fixed-detail-value">{workExperience.salary_range}</span>
                </div>
              )}
              
              {workExperience.team_size && (
                <div className="fixed-detail-item">
                  <span className="fixed-detail-label">👥 Team Size:</span>
                  <span className="fixed-detail-value">{workExperience.team_size}</span>
                </div>
              )}
              
              {workExperience.department && (
                <div className="fixed-detail-item">
                  <span className="fixed-detail-label">🏢 Department:</span>
                  <span className="fixed-detail-value">{workExperience.department}</span>
                </div>
              )}
            </div>
          </div>

          {/* Back Footer */}
          <div className="card-footer">
            <div className="flip-hint">
              <span className="hint-arrow">←</span>
              <span className="hint-text">Back to overview</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExperienceCard;