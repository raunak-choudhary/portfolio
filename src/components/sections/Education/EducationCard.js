import React, { useState } from 'react';

const EducationCard = ({ education, index }) => {
  console.log('🎓 Rendering EducationCard:', education?.degree);

  // State for card flip
  const [isFlipped, setIsFlipped] = useState(false);

  // Handle card flip
  const handleCardFlip = () => {
    setIsFlipped(prev => !prev);
  };

  // Generate institution initials for temp logo
  const generateInstitutionInitials = (institutionName) => {
    if (!institutionName) return 'UN';
    
    const words = institutionName.split(' ').filter(word => word.length > 0);
    if (words.length === 1) {
      return words[0].substring(0, 2).toUpperCase();
    }
    return words.slice(0, 2).map(word => word.charAt(0).toUpperCase()).join('');
  };

  // Format dates with fallback
  const formatDate = (dateString) => {
    if (!dateString) return 'Present';
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

  // CRUCIAL: Determine college/school name based on education level
  const getCollegeSchoolName = (education) => {
    const degree = education.degree?.toLowerCase() || '';
    const educationLevel = education.education_level?.toLowerCase() || '';
    
    // Check if it's 10th or 12th standard (school level)
    if (degree.includes('10th') || degree.includes('12th') || 
        degree.includes('tenth') || degree.includes('twelfth') ||
        educationLevel.includes('secondary') || 
        educationLevel.includes('higher secondary') ||
        educationLevel.includes('high school')) {
      
      // For school level, show school name (could be from a separate field or parsed from institution)
      return education.school_name || education.college || 'School Name Not Available';
    }
    
    // For Bachelor's and above, show college/department name
    if (educationLevel.includes('bachelor') || 
        educationLevel.includes('master') || 
        educationLevel.includes('doctoral') ||
        educationLevel.includes('phd') ||
        degree.includes('bachelor') ||
        degree.includes('master') ||
        degree.includes('ms ') ||
        degree.includes('bs ') ||
        degree.includes('phd')) {
      
      // Show college/school within university
      return education.college || education.department || 'College Name Not Available';
    }
    
    // Default case
    return education.college || education.department || null;
  };

  // Format GPA/Percentage display - SEPARATE VALUES
  const getGradeInfo = (education) => {
    if (!education.gpa_received || !education.max_gpa_scale) {
      return { received: null, max: null, isPercentage: false };
    }
    
    const maxScale = parseFloat(education.max_gpa_scale);
    const received = parseFloat(education.gpa_received);
    
    // If max scale is 100, it's percentage
    const isPercentage = maxScale === 100;
    
    return {
      received: received.toString(),
      max: maxScale.toString(),
      isPercentage: isPercentage
    };
  };

  const gradeInfo = getGradeInfo(education);
  const collegeSchoolName = getCollegeSchoolName(education);

  return (
    <div className="timeline-milestone">
      
      {/* Timeline Node */}
      <div className="timeline-node">
        <div className="graduation-cap">🎓</div>
        <div className="node-glow"></div>
      </div>

      {/* 3D Flip Card */}
      <div className={`education-flip-card ${isFlipped ? 'flipped' : ''}`}>
        <div className="education-flip-card-inner">
          
          {/* FRONT SIDE */}
          <div className="education-flip-card-front education-milestone-card">
            
            {/* Top Row: Logo (Center) + Flip Icon (Right) */}
            <div className="card-top-row">
              <div className="institution-logo-large">
                {education.institution_logo_url ? (
                  <img 
                    src={education.institution_logo_url}
                    alt={`${education.institution} logo`}
                    className="logo-image-large"
                    onError={(e) => {
                      console.warn(`Failed to load logo for ${education.institution}`);
                      e.target.style.display = 'none';
                      e.target.nextElementSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                
                <div 
                  className="logo-temp-large"
                  style={{ display: education.institution_logo_url ? 'none' : 'flex' }}
                >
                  {generateInstitutionInitials(education.institution)}
                </div>
              </div>
              
              <button 
                className="flip-card-btn"
                onClick={handleCardFlip}
                aria-label="Flip card to see more details"
              >
                {/* Proper Flip Icon */}
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M16 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* Degree Title */}
            <div className="front-degree-title">
              <h3>{education.degree}</h3>
            </div>

            {/* Institution Name (University) */}
            <div className="front-institution-info">
              <h4 className="university-name">{education.institution}</h4>
              
              {/* College/School Name - CRUCIAL LOGIC */}
              {collegeSchoolName && (
                <h5 className="college-school-name">{collegeSchoolName}</h5>
              )}
            </div>

            {/* Duration */}
            <div className="front-duration">
              <div className="duration-label">Duration</div>
              <div className="duration-value">
                {formatDate(education.start_date)} - {formatDate(education.end_date)}
              </div>
            </div>

            {/* Status */}
            {education.education_status && (
              <div className="front-status">
                <span className="front-status-badge">
                  📚 {education.education_status}
                </span>
              </div>
            )}

            {/* GPA/Percentage - SEPARATE BOXES */}
            {gradeInfo.received && gradeInfo.max && (
              <div className="front-grade-container">
                <div className="front-grade-received">
                  <span className="front-grade-label">
                    {gradeInfo.isPercentage ? 'Percentage Received' : 'GPA Received'}
                  </span>
                  <span className="front-grade-value">
                    {gradeInfo.received}{gradeInfo.isPercentage ? '%' : ''}
                  </span>
                </div>
                
                <div className="front-grade-max">
                  <span className="front-grade-label">
                    {gradeInfo.isPercentage ? 'Max Percentage' : 'Max GPA'}
                  </span>
                  <span className="front-grade-value">
                    {gradeInfo.max}{gradeInfo.isPercentage ? '%' : ''}
                  </span>
                </div>
              </div>
            )}

            {/* Major */}
            {education.major && (
              <div className="front-major">
                <span className="front-major-label">Major:</span>
                <span className="front-major-value">{education.major}</span>
              </div>
            )}
          </div>

          {/* BACK SIDE */}
          <div className="education-flip-card-back education-milestone-card">
            <div className="back-content">
              
              {/* Back Header with Flip Button */}
              <div className="back-header">
                <h4 className="back-title">Education Details</h4>
                <button 
                  className="flip-card-btn flip-back-btn"
                  onClick={handleCardFlip}
                  aria-label="Flip card back to main view"
                >
                  {/* Proper Back Flip Icon */}
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 12H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M16 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M8 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>

              {/* Scrollable Back Details */}
              <div className="back-details">
                {/* Description */}
                {education.description && (
                  <div className="back-section">
                    <div className="back-section-header">📝 Description</div>
                    <div className="back-section-content">{education.description}</div>
                  </div>
                )}

                {/* Coursework */}
                {education.coursework && education.coursework.length > 0 && (
                  <div className="back-section">
                    <div className="back-section-header">📚 Coursework</div>
                    <div className="back-section-content">
                      <div className="coursework-tags">
                        {education.coursework.map((course, idx) => (
                          <span key={idx} className="coursework-tag">{course}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Achievements */}
                {education.achievements && education.achievements.length > 0 && (
                  <div className="back-section">
                    <div className="back-section-header">🏆 Achievements</div>
                    <div className="back-section-content">
                      <ul className="achievements-list">
                        {education.achievements.map((achievement, idx) => (
                          <li key={idx}>{achievement}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Activities */}
                {education.activities && education.activities.length > 0 && (
                  <div className="back-section">
                    <div className="back-section-header">🎯 Activities</div>
                    <div className="back-section-content">
                      <ul className="activities-list">
                        {education.activities.map((activity, idx) => (
                          <li key={idx}>{activity}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Thesis Title */}
                {education.thesis_title && (
                  <div className="back-section">
                    <div className="back-section-header">📖 Thesis</div>
                    <div className="back-section-content">{education.thesis_title}</div>
                  </div>
                )}

                {/* Minor */}
                {education.minor && (
                  <div className="back-section">
                    <div className="back-section-header">📋 Minor</div>
                    <div className="back-section-content">{education.minor}</div>
                  </div>
                )}

                {/* Location */}
                {education.location && (
                  <div className="back-section">
                    <div className="back-section-header">📍 Location</div>
                    <div className="back-section-content">{education.location}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EducationCard;