// =====================================================
// SkillModal.js - Enhanced Overlay Modal System
// Red/Coral Theme with Complete Background Isolation
// Updated: Enhanced overlay prevents background interaction
// =====================================================

import React, { useEffect, useRef, useState } from 'react';

const SkillModal = ({ skill, onClose }) => {
  console.log('🔍 Rendering Enhanced SkillModal for:', skill?.skill_name);

  const overlayRef = useRef(null);
  const modalRef = useRef(null);
  const contentRef = useRef(null);
  const [certificateImages, setCertificateImages] = useState({});

  // Enhanced overlay click handling - PREVENTS modal close on overlay click
  const handleOverlayClick = (e) => {
    // Only close if clicking the close button areas, not the overlay itself
    e.stopPropagation();
    // Do NOT close modal on overlay click
    return;
  };

  // Handle modal container click - prevent event bubbling
  const handleModalClick = (e) => {
    e.stopPropagation();
  };

  // Handle escape key - only way to close besides close buttons
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Enhanced body scroll management - complete isolation with scrollbar hiding
  useEffect(() => {
    if (skill) {
      // Store original styles
      const originalBodyOverflow = document.body.style.overflow;
      const originalBodyPosition = document.body.style.position;
      const originalBodyTop = document.body.style.top;
      const originalBodyWidth = document.body.style.width;
      const originalBodyHeight = document.body.style.height;
      const originalHtmlOverflow = document.documentElement.style.overflow;
      const scrollY = window.scrollY;

      // Lock body scroll completely AND HIDE SCROLLBAR
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.height = '100vh';
      document.documentElement.style.overflow = 'hidden';

      // Cleanup function to restore scroll
      return () => {
        document.body.style.overflow = originalBodyOverflow;
        document.body.style.position = originalBodyPosition;
        document.body.style.top = originalBodyTop;
        document.body.style.width = originalBodyWidth;
        document.body.style.height = originalBodyHeight;
        document.documentElement.style.overflow = originalHtmlOverflow;
        window.scrollTo(0, scrollY);
      };
    }
  }, [skill]);

  // Enhanced focus trap for accessibility
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

      modal.addEventListener('keydown', handleTabKey);
      firstElement?.focus();

      return () => modal.removeEventListener('keydown', handleTabKey);
    }
  }, []);

  // Load certificate thumbnails
  useEffect(() => {
    if (skill?.certifications && skill.certifications.length > 0) {
      skill.certifications.forEach((certificate, index) => {
        loadCertificateThumbnail(certificate, index);
      });
    }
  }, [skill]);

  // Generate thumbnail for certificate
  const loadCertificateThumbnail = (certificateUrl, index) => {
    const fileExtension = certificateUrl.split('.').pop()?.toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension)) {
      // For image files, use the image itself as thumbnail
      const img = new Image();
      img.onload = () => {
        setCertificateImages(prev => ({
          ...prev,
          [index]: {
            type: 'image',
            thumbnail: certificateUrl,
            isLoaded: true
          }
        }));
      };
      img.onerror = () => {
        setCertificateImages(prev => ({
          ...prev,
          [index]: {
            type: 'image',
            thumbnail: null,
            isLoaded: false
          }
        }));
      };
      img.src = certificateUrl;
    } else if (fileExtension === 'pdf') {
      // For PDF files, we'll use a PDF icon
      setCertificateImages(prev => ({
        ...prev,
        [index]: {
          type: 'pdf',
          thumbnail: null,
          isLoaded: true
        }
      }));
    } else {
      // For other file types, use a generic document icon
      setCertificateImages(prev => ({
        ...prev,
        [index]: {
          type: 'document',
          thumbnail: null,
          isLoaded: true
        }
      }));
    }
  };

  // Format proficiency level to percentage
  const formatProficiency = (level) => {
    return level ? `${(level * 10)}%` : 'Not specified';
  };

  // Format proficiency level to text
  const getProficiencyText = (level) => {
    if (!level) return 'Not specified';
    if (level <= 2) return 'Beginner';
    if (level <= 4) return 'Basic';
    if (level <= 6) return 'Intermediate';
    if (level <= 8) return 'Advanced';
    return 'Expert';
  };

  // Handle certificate download
  const handleCertificateDownload = (certificateUrl, index) => {
    console.log('📄 Downloading certificate:', certificateUrl);
    
    // Extract filename from URL or create one
    const urlParts = certificateUrl.split('/');
    const filename = urlParts[urlParts.length - 1] || `${skill.skill_name}-certificate-${index + 1}`;
    
    // Create temporary download link
    const link = document.createElement('a');
    link.href = certificateUrl;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Add haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(100);
    }
  };

  // Enhanced close handler
  const handleClose = () => {
    console.log('❌ Closing enhanced skill modal');
    onClose();
  };

  // Render certificate thumbnail
  const renderCertificateThumbnail = (certificate, index) => {
    const imageData = certificateImages[index];
    
    if (!imageData) {
      return (
        <div className="certificate-thumbnail loading">
          <div className="thumbnail-loading-spinner"></div>
        </div>
      );
    }

    if (imageData.type === 'image' && imageData.thumbnail) {
      return (
        <div className="certificate-thumbnail image-thumbnail">
          <img 
            src={imageData.thumbnail} 
            alt={`Certificate ${index + 1}`}
            className="certificate-preview-image"
          />
          <div className="thumbnail-overlay">
            <svg viewBox="0 0 24 24" fill="currentColor" className="preview-icon">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
        </div>
      );
    }

    // Render appropriate icon based on file type
    const getFileIcon = () => {
      switch (imageData.type) {
        case 'pdf':
          return (
            <svg viewBox="0 0 24 24" fill="currentColor" className="file-type-icon pdf-icon">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <path d="M9 13h6M9 17h6M9 9h1"/>
            </svg>
          );
        default:
          return (
            <svg viewBox="0 0 24 24" fill="currentColor" className="file-type-icon document-icon">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10,9 9,9 8,9"/>
            </svg>
          );
      }
    };

    return (
      <div className={`certificate-thumbnail file-thumbnail ${imageData.type}-thumbnail`}>
        {getFileIcon()}
        <div className="file-type-label">
          {imageData.type.toUpperCase()}
        </div>
      </div>
    );
  };

  if (!skill) return null;

  return (
    <div 
      className="skill-modal-enhanced-overlay" 
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="skill-modal-title"
      aria-describedby="skill-modal-description"
    >
      <div 
        className="skill-modal-container"
        ref={modalRef}
        onClick={handleModalClick}
      >
        <div className="skill-modal">
          {/* Modal Header */}
          <div className="skill-modal-header">
            <div className="skill-header-content">
              <h2 id="skill-modal-title" className="skill-modal-title">
                {skill.skill_name}
              </h2>
              
              {/* Skill Category Badge */}
              {skill.skill_type && (
                <div className="skill-category-badge">
                  {skill.skill_type}
                </div>
              )}

              {/* Featured Badge */}
              {skill.is_featured && (
                <div className="modal-featured-badge">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="featured-star-icon">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  <span>Featured Skill</span>
                </div>
              )}
            </div>

            {/* Close Button */}
            <button 
              className="skill-modal-close"
              onClick={handleClose}
              aria-label="Close skill details"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          {/* Modal Content - Enhanced Scrollable Container */}
          <div 
            className="skill-modal-content-scrollable"
            ref={contentRef}
            id="skill-modal-description"
          >
            
            {/* Primary Information Section */}
            <div className="skill-section primary-info">
              
              {/* Proficiency Level - Most Important */}
              {skill.proficiency_level && (
                <div className="skill-detail-card priority-high">
                  <div className="detail-header">
                    <span className="detail-icon">📊</span>
                    <span className="detail-title">Proficiency Level</span>
                  </div>
                  <div className="proficiency-display">
                    <div className="proficiency-visual">
                      <div className="proficiency-bar">
                        <div 
                          className="proficiency-fill" 
                          style={{ width: `${skill.proficiency_level * 10}%` }}
                        />
                      </div>
                      <div className="proficiency-text">
                        <span className="proficiency-percentage">{formatProficiency(skill.proficiency_level)}</span>
                        <span className="proficiency-label">{getProficiencyText(skill.proficiency_level)}</span>
                      </div>
                    </div>
                    <div className="proficiency-dots">
                      {[...Array(10)].map((_, index) => (
                        <div 
                          key={index}
                          className={`proficiency-dot ${index < skill.proficiency_level ? 'filled' : 'empty'}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Description */}
              {skill.description && (
                <div className="skill-detail-card priority-high">
                  <div className="detail-header">
                    <span className="detail-icon">📝</span>
                    <span className="detail-title">Description</span>
                  </div>
                  <p className="skill-description">{skill.description}</p>
                </div>
              )}

              {/* Projects Used */}
              {skill.projects_used && skill.projects_used.length > 0 && (
                <div className="skill-detail-card priority-high">
                  <div className="detail-header">
                    <span className="detail-icon">🚀</span>
                    <span className="detail-title">Projects Used In</span>
                  </div>
                  <div className="projects-list">
                    {skill.projects_used.map((project, index) => (
                      <div key={index} className="project-tag">
                        {project}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Secondary Information Section */}
            <div className="skill-section secondary-info">
              
              {/* Learning Source */}
              {skill.learning_source && (
                <div className="skill-detail-card priority-medium">
                  <div className="detail-header">
                    <span className="detail-icon">🎓</span>
                    <span className="detail-title">Learning Source</span>
                  </div>
                  <p className="detail-text">{skill.learning_source}</p>
                </div>
              )}

              {/* Category */}
              {skill.category && skill.category !== skill.skill_type && (
                <div className="skill-detail-card priority-low">
                  <div className="detail-header">
                    <span className="detail-icon">📂</span>
                    <span className="detail-title">Category</span>
                  </div>
                  <p className="detail-text">{skill.category}</p>
                </div>
              )}

              {/* Skill Priority Level (for admin reference) */}
              {skill.order_index && (
                  <div className="skill-detail-card priority-low">
                      <div className="detail-header">
                      <span className="detail-icon">⭐</span>
                      <span className="detail-title">Skill Priority</span>
                      </div>
                      <p className="detail-text">
                      {skill.is_featured ? 'Featured Skill' : `Entry Level #${skill.order_index}`}
                      </p>
                  </div>
              )}
            </div>

            {/* Certificates Section - Special Treatment with Thumbnails */}
            {skill.certifications && skill.certifications.length > 0 && (
              <div className="skill-section certificates-section">
                <div className="skill-detail-card priority-high certificates-card">
                  <div className="detail-header">
                    <span className="detail-icon">🏆</span>
                    <span className="detail-title">
                      Certifications ({skill.certifications.length})
                    </span>
                  </div>
                  
                  <div className="certificates-grid">
                    {skill.certifications.map((certificate, index) => (
                      <div key={index} className="certificate-item">
                        {/* Certificate Thumbnail */}
                        {renderCertificateThumbnail(certificate, index)}
                        
                        <div className="certificate-details">
                          <div className="certificate-info">
                            <span className="certificate-name">
                              Certificate {index + 1}
                            </span>
                            <span className="certificate-type">
                              {certificate.includes('.pdf') ? 'PDF Document' : 
                               certificate.includes('.jpg') || certificate.includes('.png') ? 'Image' : 
                               'Document'}
                            </span>
                          </div>
                          
                          <div className="certificate-actions">
                            <button 
                              className="download-btn"
                              onClick={() => handleCertificateDownload(certificate, index)}
                              aria-label={`Download certificate ${index + 1}`}
                            >
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <span>Download</span>
                            </button>
                            
                            <button 
                              className="view-btn"
                              onClick={() => window.open(certificate, '_blank')}
                              aria-label={`View certificate ${index + 1}`}
                            >
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2"/>
                                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                              </svg>
                              <span>View</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Bulk Download Option */}
                  {skill.certifications.length > 1 && (
                    <div className="bulk-download">
                      <button 
                        className="bulk-download-btn"
                        onClick={() => {
                          skill.certifications.forEach((cert, index) => {
                            setTimeout(() => handleCertificateDownload(cert, index), index * 1000);
                          });
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M12 18V12M9 15l3 3 3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>Download All Certificates</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="skill-modal-footer">
            <div className="modal-actions">
              <button 
                className="close-modal-btn"
                onClick={handleClose}
              >
                <span>Close</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkillModal;