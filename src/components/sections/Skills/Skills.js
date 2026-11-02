import React, { useState, useEffect, useRef, useMemo } from 'react';
import SkillCard from './SkillCard';
import SkillModal from './SkillModal';
import { useSupabaseByStatus } from '../../../hooks/useSupabase';
import LoadingSpinner from '../../common/LoadingSpinner';
import './Skills.css';

const Skills = () => {
  //Database integration with useSupabase hook (returns flat array)
  const { data: flatSkills, loading, error } = useSupabaseByStatus(
    'skills', 
    'active',
    {},
    { 
      orderBy: { column: 'order_index', ascending: true }
    }
  );

  // 🔧 ADDED: Group flat skills by skill_type into categories structure
  // 🔧 UPDATED: Group flat skills by skill_type with priority sorting
  const skillCategories = useMemo(() => {
    if (!flatSkills || flatSkills.length === 0) return [];

    console.log('✅ Skills fetched successfully:', flatSkills.length, 'skills');
    
    // Group skills by skill_type
    const grouped = flatSkills.reduce((acc, skill) => {
      const category = skill.skill_type || 'Other';
      
      if (!acc[category]) {
        acc[category] = {
          category,
          skills: [],
          priority: skill.skill_type_priority || 50
        };
      }
      
      acc[category].skills.push(skill);
      return acc;
    }, {});

    // Convert to array and sort categories by priority, then skills within categories
    const sortedCategories = Object.values(grouped)
      .sort((a, b) => a.priority - b.priority) // Sort by skill_type_priority
      .map(category => ({
        ...category,
        skills: category.skills.sort((a, b) => {
          // Featured skills first, then by order_index, then by name
          if (a.is_featured && !b.is_featured) return -1;
          if (!a.is_featured && b.is_featured) return 1;
          if (a.order_index !== b.order_index) {
            return (a.order_index || 999) - (b.order_index || 999);
          }
          return a.skill_name.localeCompare(b.skill_name);
        })
      }));

    return sortedCategories;
  }, [flatSkills]);

  // Enhanced modal state management
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Refs for carousel touch handling
  const carouselRefs = useRef({});

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Enhanced skill card click handler
  const handleSkillClick = (skill) => {
    console.log('🔄 Opening enhanced skill modal for:', skill.skill_name);
    setSelectedSkill(skill);
    setIsModalOpen(true);
    
    // Add haptic feedback for mobile devices
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  // Enhanced modal close handler
  const handleModalClose = () => {
    console.log('❌ Closing enhanced skill modal');
    setIsModalOpen(false);
    setSelectedSkill(null);
  };

  // Enhanced escape key handling - now handled in modal itself
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isModalOpen) {
        handleModalClose();
      }
    };

    if (isModalOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isModalOpen]);

  // Carousel scroll function with smooth scrolling
  const scrollCarousel = (carouselId, direction) => {
    const carousel = carouselRefs.current[carouselId];
    if (!carousel) return;

    const track = carousel.querySelector('.skills-track');
    if (!track) return;

    const cardWidth = 200; // Approximate card width + gap
    const scrollAmount = cardWidth * 2; // Scroll 2 cards at a time

    if (direction === 'left') {
      track.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    } else {
      track.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Setup touch swipe for mobile carousels
  useEffect(() => {
    if (!skillCategories || skillCategories.length === 0) return;

    skillCategories.forEach((category, index) => {
      const carouselId = `carousel-${index}`;
      const carousel = carouselRefs.current[carouselId];
      
      if (!carousel) return;

      const track = carousel.querySelector('.skills-track');
      if (!track) return;

      let startX = 0;
      let scrollLeft = 0;
      let isDown = false;

      const handleTouchStart = (e) => {
        isDown = true;
        startX = e.touches[0].pageX - track.offsetLeft;
        scrollLeft = track.scrollLeft;
        track.style.cursor = 'grabbing';
      };

      const handleTouchMove = (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.touches[0].pageX - track.offsetLeft;
        const walk = (x - startX) * 2; // Scroll speed multiplier
        track.scrollLeft = scrollLeft - walk;
      };

      const handleTouchEnd = () => {
        isDown = false;
        track.style.cursor = 'grab';
      };

      // Mouse events for desktop
      const handleMouseDown = (e) => {
        isDown = true;
        startX = e.pageX - track.offsetLeft;
        scrollLeft = track.scrollLeft;
        track.style.cursor = 'grabbing';
      };

      const handleMouseMove = (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - track.offsetLeft;
        const walk = (x - startX) * 2;
        track.scrollLeft = scrollLeft - walk;
      };

      const handleMouseUp = () => {
        isDown = false;
        track.style.cursor = 'grab';
      };

      const handleMouseLeave = () => {
        isDown = false;
        track.style.cursor = 'grab';
      };

      // Add touch event listeners
      track.addEventListener('touchstart', handleTouchStart, { passive: false });
      track.addEventListener('touchmove', handleTouchMove, { passive: false });
      track.addEventListener('touchend', handleTouchEnd);

      // Add mouse event listeners for desktop
      track.addEventListener('mousedown', handleMouseDown);
      track.addEventListener('mousemove', handleMouseMove);
      track.addEventListener('mouseup', handleMouseUp);
      track.addEventListener('mouseleave', handleMouseLeave);

      // Cleanup function
      return () => {
        track.removeEventListener('touchstart', handleTouchStart);
        track.removeEventListener('touchmove', handleTouchMove);
        track.removeEventListener('touchend', handleTouchEnd);
        track.removeEventListener('mousedown', handleMouseDown);
        track.removeEventListener('mousemove', handleMouseMove);
        track.removeEventListener('mouseup', handleMouseUp);
        track.removeEventListener('mouseleave', handleMouseLeave);
      };
    });
  }, [skillCategories]);

  // Show loading spinner
  if (loading) {
    return (
      <section className="skills-section section">
        <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <LoadingSpinner size="large" message="Loading skills..." />
        </div>
      </section>
    );
  }

  return (
    <section className="skills-section section">
      <div className="container">
        {/* Header */}
        <div className="section-header">
          <h1 className="neon-title">Skills & Competencies</h1>
          <p className="neon-subtitle">Technical skills and expertise areas</p>
        </div>

        <div className="skills-content">
          {error ? (
            // Error state - 🔧 UPDATED: Enhanced error handling
            <div className="no-content-message glass-card">
              <div className="no-content-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 9v4m0 4h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="no-content-title">Error Loading Skills</h3>
              <p className="no-content-text">
                {typeof error === 'object' ? error.message : error || 'Something went wrong while loading skills. Please try again later.'}
              </p>
              <div className="no-content-decoration">
                <div className="floating-particle"></div>
                <div className="floating-particle"></div>
                <div className="floating-particle"></div>
              </div>
            </div>
          ) : !skillCategories || skillCategories.length === 0 ? (
            // No skills state
            <div className="no-content-message glass-card">
              <div className="no-content-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14.7 6.3C15.1 5.9 15.1 5.3 14.7 4.9L19.1 0.5C19.5 0.1 19.5 -0.5 19.1 -0.9C18.7 -1.3 18.1 -1.3 17.7 -0.9L13.3 3.5C12.9 3.1 12.3 3.1 11.9 3.5L4.9 10.5C4.5 10.9 4.5 11.5 4.9 11.9L6.1 13.1L2.7 16.5C2.3 16.9 2.3 17.5 2.7 17.9L6.1 21.3C6.5 21.7 7.1 21.7 7.5 21.3L10.9 17.9L12.1 19.1C12.5 19.5 13.1 19.5 13.5 19.1L20.5 12.1C20.9 11.7 20.9 11.1 20.5 10.7L14.7 6.3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M9 12L12 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="11.5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </div>
              <h3 className="no-content-title">No Skills Information Available</h3>
              <p className="no-content-text">
                No information present. Technical skills and expertise areas will be displayed here once they are added to the portfolio.
              </p>
              <div className="no-content-decoration">
                <div className="floating-particle"></div>
                <div className="floating-particle"></div>
                <div className="floating-particle"></div>
              </div>
            </div>
          ) : (
            // Skills categories with carousels
            <div className="skills-categories">
              {skillCategories.map((category, categoryIndex) => (
                <div key={category.category || categoryIndex} className="skill-category">
                  {/* Category Subheading - h2 as requested */}
                  <h2 className="category-heading">
                    <span className="category-pipe">|</span>
                    <span className="category-text">{category.category}</span>
                  </h2>
                  
                  {/* Skills Carousel */}
                  <div className="skills-carousel-wrapper">
                    <div 
                      className="skills-carousel" 
                      ref={el => carouselRefs.current[`carousel-${categoryIndex}`] = el}
                    >
                      <div className="skills-track">
                        {category.skills && category.skills.map((skill, skillIndex) => (
                          <SkillCard 
                            key={skill.id || skillIndex} 
                            skill={skill} 
                            onClick={() => handleSkillClick(skill)}
                          />
                        ))}
                      </div>
                    </div>
                    
                    {/* Always Visible Carousel Navigation */}
                    <div className="carousel-navigation">
                      <button 
                        className="carousel-btn carousel-btn-prev"
                        onClick={() => scrollCarousel(`carousel-${categoryIndex}`, 'left')}
                        aria-label="Previous skills"
                      >
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button 
                        className="carousel-btn carousel-btn-next"
                        onClick={() => scrollCarousel(`carousel-${categoryIndex}`, 'right')}
                        aria-label="Next skills"
                      >
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Enhanced Skill Modal */}
      {isModalOpen && selectedSkill && (
        <SkillModal 
          skill={selectedSkill} 
          onClose={handleModalClose}
        />
      )}
    </section>
  );
};

export default Skills;