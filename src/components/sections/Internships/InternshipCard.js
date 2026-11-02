import React, { useState, useEffect } from 'react';

const InternshipCard = ({ internship }) => {
 console.log('🎨 Rendering InternshipCard:', internship?.title);

 const [isFlipped, setIsFlipped] = useState(false);
 const [showCertificateGallery, setShowCertificateGallery] = useState(false);

 // Handle multiple certificate URLs from database
 const certificateUrls = Array.isArray(internship.certificate_urls) ? internship.certificate_urls : 
                        (internship.certificate_url ? [internship.certificate_url] : []);

 // Handle technologies array
 const technologies = Array.isArray(internship.technologies) ? internship.technologies : 
                     (typeof internship.technologies === 'string' ? [internship.technologies] : []);

 // Handle key responsibilities array
 const keyResponsibilities = Array.isArray(internship.key_responsibilities) ? internship.key_responsibilities : [];

 // Handle achievements array
 const achievements = Array.isArray(internship.achievements) ? internship.achievements : [];

 // Handle skills gained array
 const skillsGained = Array.isArray(internship.skills_gained) ? internship.skills_gained : [];

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

 // Calculate duration
 const calculateDuration = () => {
   if (internship.duration) return internship.duration;
   
   if (!internship.start_date || !internship.end_date) return 'N/A';
   
   try {
     const start = new Date(internship.start_date);
     const end = new Date(internship.end_date);
     const diffTime = Math.abs(end - start);
     const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
     const diffMonths = Math.round(diffDays / 30);
     
     if (diffMonths < 1) return `${diffDays} days`;
     if (diffMonths === 1) return '1 month';
     return `${diffMonths} months`;
   } catch (error) {
     return 'N/A';
   }
 };

 // Card flip handler
 const handleCardClick = (e) => {
   // Don't flip if clicking on buttons, links, or interactive elements
   if (e.target.closest('.action-button') || 
       e.target.closest('.internship-link') || 
       e.target.closest('.tech-tag')) {
     return;
   }
   
   console.log('🔄 Card flip triggered for:', internship?.title);
   setIsFlipped(!isFlipped);
   
   // Add haptic feedback for mobile devices
   if (navigator.vibrate) {
     navigator.vibrate(50);
   }
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

 // Handle certificate gallery - ENHANCED with complete background isolation
 const openCertificateGallery = (e) => {
   e.stopPropagation();
   console.log('📜 Opening certificate gallery for:', internship?.title);
   setShowCertificateGallery(true);
   
   // Add haptic feedback for mobile devices
   if (navigator.vibrate) {
     navigator.vibrate(50);
   }
 };

 const closeCertificateGallery = () => {
   console.log('❌ Closing certificate gallery');
   setShowCertificateGallery(false);
 };

 // REMOVED: handleBackdropClick - Gallery should NOT close on backdrop click

 // ENHANCED: Focus trap and background interaction prevention
 useEffect(() => {
   if (showCertificateGallery) {
     const originalOverflow = document.body.style.overflow;
     const originalPosition = document.body.style.position;
     
     // ENHANCED: Disable main page scroll and fix position
     document.body.style.overflow = 'hidden';
     document.body.style.position = 'fixed';
     document.body.style.width = '100%';
     document.body.style.height = '100%';

     // ENHANCED: Prevent all background interactions
     const preventBackgroundInteraction = (e) => {
       const galleryModal = document.querySelector('.internship-gallery-modal');
       if (galleryModal && !galleryModal.contains(e.target)) {
         e.preventDefault();
         e.stopPropagation();
         return false;
       }
     };

     // ENHANCED: Block all background interactions
     document.addEventListener('click', preventBackgroundInteraction, true);
     document.addEventListener('scroll', preventBackgroundInteraction, true);
     document.addEventListener('wheel', preventBackgroundInteraction, { passive: false });
     document.addEventListener('touchmove', preventBackgroundInteraction, { passive: false });

     return () => {
       // Restore original scroll behavior
       document.body.style.overflow = originalOverflow;
       document.body.style.position = originalPosition;
       document.body.style.width = '';
       document.body.style.height = '';

       // Remove event listeners
       document.removeEventListener('click', preventBackgroundInteraction, true);
       document.removeEventListener('scroll', preventBackgroundInteraction, true);
       document.removeEventListener('wheel', preventBackgroundInteraction);
       document.removeEventListener('touchmove', preventBackgroundInteraction);
     };
   }
 }, [showCertificateGallery]);

 // Handle escape key to close gallery - ENHANCED
 useEffect(() => {
   const handleEscape = (e) => {
     if (e.key === 'Escape') {
       if (showCertificateGallery) {
         closeCertificateGallery();
       } else if (isFlipped) {
         setIsFlipped(false);
       }
     }
   };

   if (showCertificateGallery || isFlipped) {
     document.addEventListener('keydown', handleEscape);
     return () => document.removeEventListener('keydown', handleEscape);
   }
 }, [showCertificateGallery, isFlipped]);

 return (
   <>
     {/* Main Internship Card */}
     <div 
       className={`project-card-wrapper ${isFlipped ? 'flipped' : ''}`}
       onClick={handleCardClick}
       onKeyDown={handleKeyDown}
       tabIndex={0}
       role="button"
       aria-label={`Internship card for ${internship.title} at ${internship.company}. Press Enter or Space to flip and see details.`}
       aria-pressed={isFlipped}
     >
       <div className="project-card-3d">
         
         {/* =================== FRONT SIDE =================== */}
         <div className="card-side card-front">
           
           {/* Header with Company Logo */}
           <div className="card-header">
             <div className="company-logo-section">
               {internship.company_logo_url ? (
                 <img 
                   src={internship.company_logo_url}
                   alt={`${internship.company} logo`}
                   className="company-logo"
                   onError={(e) => {
                     console.warn(`Failed to load company logo for ${internship.company}`);
                     e.target.style.display = 'none';
                     e.target.nextElementSibling.style.display = 'flex';
                   }}
                 />
               ) : null}
               
               {/* Temp logo with company initials */}
               <div 
                 className="company-logo-temp"
                 style={{ display: internship.company_logo_url ? 'none' : 'flex' }}
               >
                 {generateCompanyInitials(internship.company)}
               </div>
             </div>

             {/* Certificate indicator */}
             {certificateUrls.length > 0 && (
               <div className="status-indicators">
                 <div className="status-badge certificates">
                   <span className="badge-icon">📜</span>
                   <span className="badge-text">{certificateUrls.length}</span>
                 </div>
               </div>
             )}
           </div>

           {/* Internship Title */}
           <div className="title-section">
             <h3 className="project-title">{internship.title.toUpperCase()}</h3>
             <div className="title-underline"></div>
           </div>

           {/* Organization Name */}
           <div className="organization-section">
             <h4 className="organization-name">{internship.company}</h4>
           </div>

           {/* Description */}
           <div className="description-section">
             <p className="description-text">
               {internship.description || 'No description available'}
             </p>
           </div>

           {/* Internship Meta - Compact Grid */}
           <div className="meta-section">
             <div className="meta-row">
               <div className="meta-item">
                 <span className="meta-label">Type</span>
                 <span className="meta-value">{internship.internship_type || 'N/A'}</span>
               </div>
               <div className="meta-item">
                 <span className="meta-label">Location</span>
                 <span className="meta-value">{internship.location || 'N/A'}</span>
               </div>
             </div>
             <div className="meta-row">
               <div className="meta-item">
                 <span className="meta-label">Start Date</span>
                 <span className="meta-value">{formatDate(internship.start_date)}</span>
               </div>
               <div className="meta-item">
                 <span className="meta-label">End Date</span>
                 <span className="meta-value">{formatDate(internship.end_date)}</span>
               </div>
             </div>
           </div>

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
             <h3 className="back-title">{internship.title}</h3>
             <div className="back-subtitle">{internship.company}</div>
           </div>

           {/* Scrollable Content */}
           <div className="back-content">
             
             {/* Key Responsibilities */}
             {keyResponsibilities.length > 0 && (
               <div className="detail-section">
                 <div className="detail-header">
                   <span className="detail-icon">📋</span>
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

             {/* Technologies */}
             {technologies.length > 0 && (
               <div className="detail-section">
                 <div className="detail-header">
                   <span className="detail-icon">🛠️</span>
                   <span className="detail-title">Technologies ({technologies.length})</span>
                 </div>
                 <div className="back-tech-grid">
                   {technologies.map((tech, index) => (
                     <div key={index} className="back-tech-tag">
                       <span className="back-tech-tag-text">{tech}</span>
                     </div>
                   ))}
                 </div>
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
                       <span className="feature-bullet">▸</span>
                       <span className="feature-text">{achievement}</span>
                     </li>
                   ))}
                 </ul>
               </div>
             )}

             {/* Skills Gained */}
             {skillsGained.length > 0 && (
               <div className="detail-section">
                 <div className="detail-header">
                   <span className="detail-icon">🧠</span>
                   <span className="detail-title">Skills Gained ({skillsGained.length})</span>
                 </div>
                 <div className="back-tech-grid">
                   {skillsGained.map((skill, index) => (
                     <div key={index} className="back-tech-tag">
                       <span className="back-tech-tag-text">{skill}</span>
                     </div>
                   ))}
                 </div>
               </div>
             )}

             {/* Duration Summary */}
             <div className="detail-section">
               <div className="detail-header">
                 <span className="detail-icon">⏱️</span>
                 <span className="detail-title">Duration Summary</span>
               </div>
               <p className="detail-text">
                 <strong>Duration:</strong> {calculateDuration()}<br/>
                 <strong>Period:</strong> {formatDate(internship.start_date)} - {formatDate(internship.end_date)}<br/>
                 <strong>Type:</strong> {internship.internship_type || 'N/A'}<br/>
                 <strong>Location:</strong> {internship.location || 'N/A'}
               </p>
             </div>
           </div>

           {/* Action Buttons */}
           <div className="action-section">
             
             {/* Certificates */}
             {certificateUrls.length > 0 && (
               <button 
                 className="action-btn images-btn"
                 onClick={openCertificateGallery}
               >
                 <span className="btn-icon">📜</span>
                 <span className="btn-text">Certificates ({certificateUrls.length})</span>
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

     {/* ENHANCED Certificate Gallery Modal with Complete Background Isolation */}
     {showCertificateGallery && (
       <div 
         className="internship-gallery-overlay-enhanced" 
         role="dialog"
         aria-modal="true"
         aria-labelledby="internship-gallery-title"
       >
         <div className="internship-gallery-modal">
           
           {/* Gallery Header */}
           <div className="internship-gallery-header">
             <div className="internship-gallery-title-section">
               <h3 id="internship-gallery-title" className="internship-gallery-title">{internship.title}</h3>
               <span className="internship-gallery-subtitle">Certificates ({certificateUrls.length} documents)</span>
             </div>
             <button 
               className="internship-gallery-close" 
               onClick={closeCertificateGallery}
               aria-label="Close gallery"
             >
               ✕
             </button>
           </div>

           {/* Gallery Grid */}
           <div className="internship-gallery-grid">
             {certificateUrls.map((url, index) => {
               const isImage = url.match(/\.(jpg|jpeg|png|gif|webp)$/i);
               const isPDF = url.match(/\.pdf$/i);
               
               return (
                 <div key={index} className="internship-gallery-item">
                   <div className="internship-image-container">
                     {isImage ? (
                       <img 
                         src={url} 
                         alt={`${internship.title} - Certificate ${index + 1}`}
                         className="internship-gallery-image"
                         loading="lazy"
                         onError={(e) => {
                           console.warn(`Failed to load certificate ${index + 1} for ${internship.title}`);
                           e.target.src = '/logo.png';
                         }}
                       />
                     ) : (
                       <div className="internship-certificate-preview">
                         <div className="internship-certificate-icon">
                           {isPDF ? '📄' : '📜'}
                         </div>
                         <div className="internship-certificate-type">
                           {isPDF ? 'PDF Certificate' : 'Certificate Document'}
                         </div>
                       </div>
                     )}
                     <div className="internship-image-overlay">
                       <span className="internship-image-number">{index + 1}</span>
                     </div>
                   </div>
                   <div className="internship-image-caption">
                     Certificate {index + 1} of {certificateUrls.length}
                     <a 
                       href={url} 
                       target="_blank" 
                       rel="noopener noreferrer"
                       className="internship-download-link"
                       onClick={(e) => e.stopPropagation()}
                     >
                       Download
                     </a>
                   </div>
                 </div>
               );
             })}
           </div>

           {/* Gallery Footer */}
           <div className="internship-gallery-footer">
             <span className="internship-gallery-info">Press Escape or click ✕ to close • Click download to save certificates</span>
           </div>
         </div>
       </div>
     )}
   </>
 );
};

export default InternshipCard;