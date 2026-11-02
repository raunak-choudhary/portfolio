// =====================================================
// SkillCard.js - Small Carousel Card Component
// Red/Coral Theme with Creative Featured Indicator
// =====================================================

import React, { useState } from 'react';

const SkillCard = ({ skill, onClick }) => {
  console.log('🎨 Rendering SkillCard:', skill?.skill_name);

  const [imageError, setImageError] = useState(false);

  // Handle image error - fallback to default tech icon
  const handleImageError = () => {
    console.warn(`Failed to load icon for skill: ${skill.skill_name}`);
    setImageError(true);
  };

  // Get default tech icon URL based on skill name
  const getDefaultTechIcon = (skillName) => {
    const skill = skillName.toLowerCase();
    const iconMap = {
      'python': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg',
      'javascript': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg',
      'react': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg',
      'nodejs': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg',
      'node.js': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg',
      'java': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg',
      'typescript': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg',
      'aws': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/amazonwebservices/amazonwebservices-plain-wordmark.svg',
      'docker': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/docker/docker-original.svg',
      'kubernetes': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/kubernetes/kubernetes-plain.svg',
      'mongodb': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mongodb/mongodb-original.svg',
      'postgresql': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/postgresql/postgresql-original.svg',
      'mysql': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg',
      'git': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/git/git-original.svg',
      'github': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/github/github-original.svg',
      'html': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg',
      'html5': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg',
      'css': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg',
      'css3': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg',
      'vue': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vuejs/vuejs-original.svg',
      'angular': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/angularjs/angularjs-original.svg',
      'express': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/express/express-original.svg',
      'flask': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/flask/flask-original.svg',
      'django': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/django/django-plain.svg',
      'tensorflow': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/tensorflow/tensorflow-original.svg',
      'pytorch': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/pytorch/pytorch-original.svg',
      'pandas': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/pandas/pandas-original.svg',
      'numpy': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/numpy/numpy-original.svg',
      'redis': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/redis/redis-original.svg',
      'nginx': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nginx/nginx-original.svg',
      'linux': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/linux/linux-original.svg',
      'ubuntu': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/ubuntu/ubuntu-plain.svg',
      'bash': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bash/bash-original.svg',
      'vim': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vim/vim-original.svg',
      'vscode': 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vscode/vscode-original.svg'
    };

    // Try exact match first
    if (iconMap[skill]) {
      return iconMap[skill];
    }

    // Try partial matches
    for (const [key, url] of Object.entries(iconMap)) {
      if (skill.includes(key) || key.includes(skill)) {
        return url;
      }
    }

    // Default fallback icon
    return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/devicon/devicon-original.svg';
  };

  // Generate skill name initials for ultimate fallback
  const generateSkillInitials = (name) => {
    if (!name) return 'SK';
    
    const words = name.split(' ').filter(word => word.length > 0);
    if (words.length === 1) {
      return words[0].substring(0, 2).toUpperCase();
    }
    return words.slice(0, 2).map(word => word.charAt(0).toUpperCase()).join('');
  };

  // Handle card click
  const handleCardClick = () => {
    if (onClick) {
      onClick(skill);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick();
    }
  };

  // Get skill icon source
  const getSkillIconSrc = () => {
    if (skill.icon_url && !imageError) {
      return skill.icon_url;
    }
    return getDefaultTechIcon(skill.skill_name);
  };

  return (
    <div 
      className={`skill-card ${skill.is_featured ? 'featured-skill' : ''}`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`View details for ${skill.skill_name} skill`}
    >
      {/* Featured Badge - Creative floating badge */}
      {skill.is_featured && (
        <div className="featured-badge">
          <div className="featured-star">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <div className="featured-pulse"></div>
        </div>
      )}

      {/* Skill Icon */}
      <div className="skill-icon-container">
        {!imageError ? (
          <img 
            src={getSkillIconSrc()}
            alt={`${skill.skill_name} icon`}
            className="skill-icon"
            onError={handleImageError}
          />
        ) : (
          <div className="skill-icon-fallback">
            {generateSkillInitials(skill.skill_name)}
          </div>
        )}
      </div>

      {/* Skill Name */}
      <div className="skill-name">
        {skill.skill_name}
      </div>

      {/* Proficiency Preview */}
      {skill.proficiency_level && (
        <div className="skill-proficiency-preview">
          <div className="proficiency-dots">
            {[...Array(10)].map((_, index) => (
              <div 
                key={index}
                className={`proficiency-dot ${index < skill.proficiency_level ? 'filled' : 'empty'}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Hover Effect Overlay */}
      <div className="skill-card-overlay">
        <div className="overlay-content">
          <span className="click-hint">Click for details</span>
          <svg viewBox="0 0 24 24" fill="none" className="expand-icon">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* Card Background Glow Effect */}
      <div className="card-background-glow"></div>
    </div>
  );
};

export default SkillCard;