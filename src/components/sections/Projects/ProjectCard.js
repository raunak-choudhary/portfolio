import React, { useState, useEffect } from 'react';

const ProjectCard = ({ project }) => {
  console.log('🎨 Rendering Optimized ProjectCard:', project?.title);

  const [isFlipped, setIsFlipped] = useState(false);
  const [showImageGallery, setShowImageGallery] = useState(false);
  const [currentFeatureIndex, setCurrentFeatureIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Handle multiple GitHub URLs from database
  const githubUrls = Array.isArray(project.github_urls) ? project.github_urls : 
                    (project.githubUrl ? [project.githubUrl] : 
                    (project.github_url ? [project.github_url] : []));

  // Handle multiple images
  const imageUrls = Array.isArray(project.image_urls) ? project.image_urls : 
                   (project.image_url ? [project.image_url] : []);

  // Handle technologies array
  const technologies = Array.isArray(project.technologies) ? project.technologies : 
                      (typeof project.technologies === 'string' ? [project.technologies] : []);

  // Handle key features array
  const keyFeatures = Array.isArray(project.key_features) ? project.key_features : [];

  // Get descriptions
  const shortDescription = project.short_description || project.description || 'No description available';
  const detailedDescription = project.detailed_description || shortDescription;

  // Auto-rotate features every 4 seconds
  useEffect(() => {
    if (keyFeatures.length <= 1 || isPaused) return;

    const interval = setInterval(() => {
      setCurrentFeatureIndex(prev => (prev + 1) % keyFeatures.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [keyFeatures.length, isPaused]);

  // Enhanced Background Isolation for Image Gallery Modal
  useEffect(() => {
    if (showImageGallery) {
      console.log('🔒 Enabling enhanced modal isolation for Projects gallery');
      
      // Store original body styles
      const originalOverflow = document.body.style.overflow;
      const originalPosition = document.body.style.position;
      const originalWidth = document.body.style.width;
      const originalHeight = document.body.style.height;
      
      // Disable main page scroll completely
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100%';

      // Block ALL background interactions
      const preventBackgroundInteraction = (e) => {
        const galleryModal = document.querySelector('.project-gallery-modal');
        if (galleryModal && !galleryModal.contains(e.target)) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      };

      // Add comprehensive event blocking
      document.addEventListener('click', preventBackgroundInteraction, true);
      document.addEventListener('scroll', preventBackgroundInteraction, true);
      document.addEventListener('wheel', preventBackgroundInteraction, { passive: false });
      document.addEventListener('touchmove', preventBackgroundInteraction, { passive: false });
      document.addEventListener('keydown', preventBackgroundInteraction, true);

      return () => {
        console.log('🔓 Restoring original page state for Projects');
        
        // Restore everything on cleanup
        document.body.style.overflow = originalOverflow;
        document.body.style.position = originalPosition;
        document.body.style.width = originalWidth;
        document.body.style.height = originalHeight;
        
        // Remove all event listeners
        document.removeEventListener('click', preventBackgroundInteraction, true);
        document.removeEventListener('scroll', preventBackgroundInteraction, true);
        document.removeEventListener('wheel', preventBackgroundInteraction);
        document.removeEventListener('touchmove', preventBackgroundInteraction);
        document.removeEventListener('keydown', preventBackgroundInteraction, true);
      };
    }
  }, [showImageGallery]);

  // Card flip handler
  const handleCardClick = (e) => {
    // Don't flip if clicking on buttons, links, or interactive elements
    if (e.target.closest('.action-button') || 
        e.target.closest('.project-link') || 
        e.target.closest('.feature-carousel') ||
        e.target.closest('.feature-dots') ||
        e.target.closest('.tech-tag')) {
      return;
    }
    
    console.log('🔄 Card flip triggered for:', project?.title);
    setIsFlipped(!isFlipped);
    
    // Add haptic feedback for mobile devices
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  // Handle feature carousel interactions
  const handleFeatureHover = () => {
    setIsPaused(true);
  };

  const handleFeatureLeave = () => {
    setIsPaused(false);
  };

  const handleDotClick = (index, e) => {
    e.stopPropagation();
    setCurrentFeatureIndex(index);
    setIsPaused(true);
    
    // Resume auto-rotation after 5 seconds
    setTimeout(() => {
      setIsPaused(false);
    }, 5000);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick(e);
    }
    if (e.key === 'Escape' && isFlipped) {
      setIsFlipped(false);
    }
  };

  // Handle image gallery - Enhanced for isolation
  const openImageGallery = (e) => {
    e.stopPropagation();
    console.log('🖼️ Opening enhanced image gallery for:', project?.title);
    setShowImageGallery(true);
  };

  const closeImageGallery = () => {
    console.log('❌ Closing Projects image gallery');
    setShowImageGallery(false);
  };

  const handleImageClick = (imageUrl, e) => {
    e.stopPropagation(); // Prevent any parent click handlers
    console.log('🖼️ Opening image in new window:', imageUrl);
    
    // Open image in new window/tab
    window.open(imageUrl, '_blank', 'noopener,noreferrer');
  };


  // REMOVED: handleBackdropClick function for enhanced modal isolation
  // Modal should only close via close button or escape key

  // Enhanced escape key handling
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (showImageGallery) {
          closeImageGallery();
        } else if (isFlipped) {
          setIsFlipped(false);
        }
      }
    };

    // Only attach when needed for performance
    if (showImageGallery || isFlipped) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [showImageGallery, isFlipped]);

  return (
    <>
      {/* Main Project Card */}
      <div 
        className={`project-card-wrapper ${isFlipped ? 'flipped' : ''}`}
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-label={`Project card for ${project.title}. Press Enter or Space to flip and see details.`}
        aria-pressed={isFlipped}
      >
        <div className="project-card-3d">
          
          {/* =================== FRONT SIDE =================== */}
          <div className="card-side card-front">
            
            {/* Header with Status Indicators */}
            <div className="card-header">
              <div className="status-indicators">
                {project.featured && (
                  <div className="status-badge featured">
                    <span className="badge-icon">⭐</span>
                    <span className="badge-text">Featured</span>
                  </div>
                )}
                
                {imageUrls.length > 0 && (
                  <div className="status-badge images">
                    <span className="badge-icon">📸</span>
                    <span className="badge-text">{imageUrls.length}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Project Title */}
            <div className="title-section">
              <h3 className="project-title">{project.title}</h3>
              <div className="title-underline"></div>
            </div>

            {/* Project Meta - Compact Grid */}
            <div className="meta-section">
              <div className="meta-row">
                <div className="meta-item">
                  <span className="meta-label">Team</span>
                  <span className="meta-value">{project.team_size || '1'} member{project.team_size > 1 ? 's' : ''}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Duration</span>
                  <span className="meta-value">{project.duration || 'N/A'}</span>
                </div>
              </div>
              <div className="meta-row single-item">
                <div className="meta-item full-width">
                  <span className="meta-label">Project Type</span>
                  <span className="meta-value">{project.project_type || 'Project'}</span>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="description-section">
              <p className="description-text">{shortDescription}</p>
            </div>

            {/* Technology Stack - Horizontal Compact Layout */}
            <div className="tech-section">
              <div className="tech-header">
                <span className="tech-icon">🛠️</span>
                <span className="tech-title">Tech Stack</span>
              </div>
              <div className="tech-tags">
                {technologies.slice(0, 6).map((tech, index) => (
                  <span key={index} className="tech-tag">
                    {tech}
                  </span>
                ))}
                {technologies.length > 6 && (
                  <span className="tech-tag tech-more">
                    +{technologies.length - 6}
                  </span>
                )}
              </div>
            </div>

            {/* Key Features - Compact Carousel */}
            {keyFeatures.length > 0 && (
              <div 
                className="features-section"
                onMouseEnter={handleFeatureHover}
                onMouseLeave={handleFeatureLeave}
              >
                <div className="features-header">
                  <span className="features-icon">🔑</span>
                  <span className="features-title">Key Features</span>
                  {keyFeatures.length > 1 && (
                    <div className="feature-dots">
                      {keyFeatures.map((_, index) => (
                        <button
                          key={index}
                          className={`feature-dot ${index === currentFeatureIndex ? 'active' : ''}`}
                          onClick={(e) => handleDotClick(index, e)}
                          aria-label={`View feature ${index + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="current-feature">
                  {keyFeatures[currentFeatureIndex]}
                </div>
              </div>
            )}

            {/* Front Footer */}
            <div className="card-footer">
              <div className="flip-hint">
                <span className="hint-text">Tap to explore details</span>
                <span className="hint-arrow">→</span>
              </div>
            </div>
          </div>

          {/* =================== BACK SIDE =================== */}
          <div className="card-side card-back">
            
            {/* Back Header */}
            <div className="back-header">
              <h3 className="back-title">{project.title}</h3>
              <div className="back-subtitle">Project Details</div>
            </div>

            {/* Scrollable Content */}
            <div className="back-content">
              
              {/* Overview */}
              <div className="detail-section">
                <div className="detail-header">
                  <span className="detail-icon">📋</span>
                  <span className="detail-title">Overview</span>
                </div>
                <p className="detail-text">{detailedDescription}</p>
              </div>

              {/* All Technologies */}
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

              {/* All Key Features */}
              {keyFeatures.length > 0 && (
                <div className="detail-section">
                  <div className="detail-header">
                    <span className="detail-icon">🔑</span>
                    <span className="detail-title">Key Features ({keyFeatures.length})</span>
                  </div>
                  <ul className="features-list">
                    {keyFeatures.map((feature, index) => (
                      <li key={index} className="feature-item">
                        <span className="feature-bullet">▸</span>
                        <span className="feature-text">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Challenges */}
              {project.challenges && (
                <div className="detail-section">
                  <div className="detail-header">
                    <span className="detail-icon">⚡</span>
                    <span className="detail-title">Challenges</span>
                  </div>
                  <p className="detail-text">{project.challenges}</p>
                </div>
              )}

              {/* Learnings */}
              {project.learnings && (
                <div className="detail-section">
                  <div className="detail-header">
                    <span className="detail-icon">🧠</span>
                    <span className="detail-title">Key Learnings</span>
                  </div>
                  <p className="detail-text">{project.learnings}</p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="action-section">
              
              {/* Live Demo */}
              {project.live_url && (
                <a 
                  href={project.live_url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="action-btn demo-btn"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="btn-icon">🚀</span> &nbsp;&nbsp;
                  <span className="btn-text">Live Demo</span>
                </a>
              )}

              {/* GitHub Links */}
              {githubUrls.map((url, index) => (
                <a 
                  key={index}
                  href={url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="action-btn github-btn"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="btn-icon">📂</span> &nbsp;&nbsp;
                  <span className="btn-text">
                    GitHub{githubUrls.length > 1 ? ` ${index + 1}` : ''}
                  </span>
                </a>
              ))}

              {/* Images */}
              {imageUrls.length > 0 && (
                <button 
                  className="action-btn images-btn"
                  onClick={openImageGallery}
                >
                  <span className="btn-icon">🖼️</span>&nbsp;&nbsp;
                  <span className="btn-text">Images ({imageUrls.length})</span>
                </button>
              )}
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

      {/* Enhanced Image Gallery Modal */}
      {showImageGallery && (
        <div 
          className="project-gallery-overlay-enhanced"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-gallery-title"
        >
          <div className="project-gallery-modal">
            
            {/* Gallery Header */}
            <div className="project-gallery-header">
              <div className="project-gallery-title-section">
                <h3 id="project-gallery-title" className="project-gallery-title">{project.title}</h3>
                <span className="project-gallery-subtitle">Project Gallery ({imageUrls.length} images)</span>
              </div>
              <button 
                className="project-gallery-close" 
                onClick={closeImageGallery}
                aria-label="Close gallery"
              >
                ✕
              </button>
            </div>

            {/* Gallery Grid */}
            <div className="project-gallery-grid">
              {imageUrls.map((url, index) => (
                <div key={index} className="project-gallery-item">
                  <div className="project-image-container">
                    <img 
                      src={url} 
                      alt={`${project.title} - Screenshot ${index + 1}`}
                      className="project-gallery-image"
                      loading="lazy"
                      onClick={(e) => handleImageClick(url, e)} // ADD THIS LINE
                      style={{ cursor: 'pointer' }} // ADD THIS LINE
                      onError={(e) => {
                        console.warn(`Failed to load image ${index + 1} for ${project.title}`);
                        e.target.src = '/logo.png';
                      }}
                    />
                    <div className="project-image-overlay">
                      <span className="project-image-number">{index + 1}</span>
                    </div>
                  </div>
                  <div className="project-image-caption">
                    Screenshot {index + 1} of {imageUrls.length}
                  </div>
                </div>
              ))}
            </div>

            {/* Gallery Footer */}
            <div className="project-gallery-footer">
              <span className="project-gallery-info">Press Escape or click X to close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ProjectCard;