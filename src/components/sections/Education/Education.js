import React, { useState, useEffect } from 'react';
import { useSupabaseByStatus } from '../../../hooks/useSupabase';
import LoadingSpinner from '../../common/LoadingSpinner';
import './Education.css';

const Education = () => {
  // ✅ NEW: useSupabase hook integration (replaces manual state management)
  const { data: education, loading, error } = useSupabaseByStatus(
    'education', 
    'active',
    {},
    { orderBy: { column: 'end_date', ascending: false } }
  );

  // ✅ PRESERVED: Card flip state management (unchanged)
  const [flippedCards, setFlippedCards] = useState(new Set());

  // ✅ PRESERVED: Scroll to top when component mounts (unchanged)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // ✅ PRESERVED: Handle card flip function (unchanged)
  const handleCardFlip = (cardId) => {
    setFlippedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        newSet.delete(cardId);
      } else {
        newSet.add(cardId);
      }
      return newSet;
    });
  };

  // ✅ PRESERVED: Format dates function (unchanged)
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

  // ✅ PRESERVED: Generate institution initials function (unchanged)
  const generateInstitutionInitials = (institutionName) => {
    if (!institutionName) return 'UN';
    
    const words = institutionName.split(' ').filter(word => word.length > 0);
    if (words.length === 1) {
      return words[0].substring(0, 2).toUpperCase();
    }
    return words.slice(0, 2).map(word => word.charAt(0).toUpperCase()).join('');
  };

  // ✅ PRESERVED: College/school name logic (unchanged)
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

  // ✅ PRESERVED: GPA/Percentage formatting logic (unchanged)
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

  // ✅ PRESERVED: Loading spinner display (unchanged)
  if (loading) {
    return (
      <section className="education-section section">
        <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <LoadingSpinner size="large" message="Loading education..." />
        </div>
      </section>
    );
  }

  return (
    <section className="education-section section">
      <div className="container">
        {/* ✅ PRESERVED: Header section (unchanged) */}
        <div className="section-header">
          <h1 className="neon-title">Education</h1>
          <p className="neon-subtitle">Academic journey and qualifications</p>
        </div>

        <div className="education-content">
          {error ? (
            // ✅ ENHANCED: Error state with improved error handling
            <div className="no-content-message glass-card">
              <div className="no-content-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 9v4m0 4h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="no-content-title">Error Loading Education</h3>
              <p className="no-content-text">
                {typeof error === 'string' ? error : error?.message || 'Something went wrong while loading education records. Please try again later.'}
              </p>
            </div>
          ) : !education || education.length === 0 ? (
            // ✅ PRESERVED: No education state (unchanged)
            <div className="no-content-message glass-card">
              <div className="no-content-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 3L22 9L12 15L2 9L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                  <path d="M2 9V15C2 16.1046 2.89543 17 4 17H20C21.1046 17 22 16.1046 22 15V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 21V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M16 21V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <h3 className="no-content-title">No Education Information Available</h3>
              <p className="no-content-text">
                No information present. Educational background and qualifications will be displayed here once they are added to the portfolio.
              </p>
              <div className="no-content-decoration">
                <div className="floating-particle"></div>
                <div className="floating-particle"></div>
                <div className="floating-particle"></div>
              </div>
            </div>
          ) : (
            // ✅ PRESERVED: Academic Timeline Journey with 3D Flip Cards (unchanged)
            <div className="timeline-container">
              <div className="timeline-path">
                {education.map((edu, index) => {
                  const cardId = edu.id || `edu-${index}`;
                  const isFlipped = flippedCards.has(cardId);
                  const gradeInfo = getGradeInfo(edu);
                  const collegeSchoolName = getCollegeSchoolName(edu);

                  return (
                    <div key={cardId} className="timeline-milestone">
                      
                      {/* ✅ PRESERVED: Timeline Node (unchanged) */}
                      <div className="timeline-node">
                        <div className="graduation-cap">🎓</div>
                        <div className="node-glow"></div>
                      </div>

                      {/* ✅ PRESERVED: 3D Flip Card (unchanged) */}
                      <div className={`education-flip-card ${isFlipped ? 'flipped' : ''}`}>
                        <div className="education-flip-card-inner">
                          
                          {/* ✅ PRESERVED: FRONT SIDE (unchanged) */}
                          <div className="education-flip-card-front education-milestone-card">
                            
                            {/* Top Row: Logo (Center) + Flip Icon (Right) */}
                            <div className="card-top-row">
                              <div className="institution-logo-large">
                                {edu.institution_logo_url ? (
                                  <img 
                                    src={edu.institution_logo_url}
                                    alt={`${edu.institution} logo`}
                                    className="logo-image-large"
                                    onError={(e) => {
                                      console.warn(`Failed to load logo for ${edu.institution}`);
                                      e.target.style.display = 'none';
                                      e.target.nextElementSibling.style.display = 'flex';
                                    }}
                                  />
                                ) : null}
                                
                                <div 
                                  className="logo-temp-large"
                                  style={{ display: edu.institution_logo_url ? 'none' : 'flex' }}
                                >
                                  {generateInstitutionInitials(edu.institution)}
                                </div>
                              </div>
                              
                              <button 
                                className="flip-card-btn"
                                onClick={() => handleCardFlip(cardId)}
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
                              <h3>{edu.degree}</h3>
                            </div>

                            {/* Institution Name (University) */}
                            <div className="front-institution-info">
                              <h4 className="university-name">{edu.institution}</h4>
                              
                              {/* College/School Name - CRUCIAL LOGIC */}
                              {collegeSchoolName && (
                                <h5 className="college-school-name">{collegeSchoolName}</h5>
                              )}
                            </div>

                            {/* Duration */}
                            <div className="front-duration">
                              <div className="duration-label">Duration</div>
                              <div className="duration-value">
                                {formatDate(edu.start_date)} - {formatDate(edu.end_date)}
                              </div>
                            </div>

                            {/* Status */}
                            {edu.education_status && (
                              <div className="front-status">
                                <span className="front-status-badge">
                                  📚 {edu.education_status}
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
                            {edu.major && (
                              <div className="front-major">
                                <span className="front-major-label">Major:</span>
                                <span className="front-major-value">{edu.major}</span>
                              </div>
                            )}
                          </div>

                          {/* ✅ PRESERVED: BACK SIDE (unchanged) */}
                          <div className="education-flip-card-back education-milestone-card">
                            <div className="back-content">
                              
                              {/* Back Header with Flip Button */}
                              <div className="back-header">
                                <h4 className="back-title">Education Details</h4>
                                <button 
                                  className="flip-card-btn flip-back-btn"
                                  onClick={() => handleCardFlip(cardId)}
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
                                {edu.description && (
                                  <div className="back-section">
                                    <div className="back-section-header">📝 Description</div>
                                    <div className="back-section-content">{edu.description}</div>
                                  </div>
                                )}

                                {/* Coursework */}
                                {edu.coursework && edu.coursework.length > 0 && (
                                  <div className="back-section">
                                    <div className="back-section-header">📚 Coursework</div>
                                    <div className="back-section-content">
                                      <div className="coursework-tags">
                                        {edu.coursework.map((course, idx) => (
                                          <span key={idx} className="coursework-tag">{course}</span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Achievements */}
                                {edu.achievements && edu.achievements.length > 0 && (
                                  <div className="back-section">
                                    <div className="back-section-header">🏆 Achievements</div>
                                    <div className="back-section-content">
                                      <ul className="achievements-list">
                                        {edu.achievements.map((achievement, idx) => (
                                          <li key={idx}>{achievement}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                )}

                                {/* Activities */}
                                {edu.activities && edu.activities.length > 0 && (
                                  <div className="back-section">
                                    <div className="back-section-header">🎯 Activities</div>
                                    <div className="back-section-content">
                                      <ul className="activities-list">
                                        {edu.activities.map((activity, idx) => (
                                          <li key={idx}>{activity}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                )}

                                {/* Thesis Title */}
                                {edu.thesis_title && (
                                  <div className="back-section">
                                    <div className="back-section-header">📖 Thesis</div>
                                    <div className="back-section-content">{edu.thesis_title}</div>
                                  </div>
                                )}

                                {/* Minor */}
                                {edu.minor && (
                                  <div className="back-section">
                                    <div className="back-section-header">📋 Minor</div>
                                    <div className="back-section-content">{edu.minor}</div>
                                  </div>
                                )}

                                {/* Location */}
                                {edu.location && (
                                  <div className="back-section">
                                    <div className="back-section-header">📍 Location</div>
                                    <div className="back-section-content">{edu.location}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default Education;