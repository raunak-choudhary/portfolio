// src/utils/constants.js

// Application Information
export const APP_INFO = {
    name: 'RC Portfolio',
    fullName: 'Raunak Choudhary Portfolio',
    description: 'Full Stack Developer & AWS Cloud Specialist',
    version: '1.0.0',
    author: 'Raunak Choudhary'
  };
  
  // Contact Information
  export const CONTACT_INFO = {
    email: 'raunakchoudhary17@gmail.com',
    phone: '+1 (929) 289-4648',
    location: 'New York, USA',
    linkedin: 'https://www.linkedin.com/in/raunak-choudhary',
    github: 'https://github.com/raunak-choudhary'
  };
  
  // Navigation Items
  export const NAV_ITEMS = [
    { name: 'Home', path: '/' },
    { name: 'About', path: '/#about' },
    { name: 'Projects', path: '/projects' },
    { name: 'Experience', path: '/work-experience' },
    { name: 'Contact', path: '/#contact' }
  ];
  
  // Portfolio Section Cards
  export const PORTFOLIO_SECTIONS = [
    {
      id: 'projects',
      title: 'Projects',
      description: 'Showcase of my technical projects and applications',
      path: '/projects',
      icon: '💻'
    },
    {
      id: 'internships',
      title: 'Internships',
      description: 'Professional internship experiences and learning',
      path: '/internships',
      icon: '🎯'
    },
    {
      id: 'education',
      title: 'Education',
      description: 'Academic background and qualifications',
      path: '/education',
      icon: '🎓'
    },
    {
      id: 'work-experience',
      title: 'Work Experience',
      description: 'Professional work history and achievements',
      path: '/work-experience',
      icon: '💼'
    },
    {
      id: 'skills',
      title: 'Skills & Competencies',
      description: 'Technical skills and expertise areas',
      path: '/skills',
      icon: '🛠️'
    },
    {
      id: 'certifications',
      title: 'Certifications & Badges',
      description: 'Professional certifications and credentials',
      path: '/certifications',
      icon: '🏆'
    },
    {
      id: 'recommendations',
      title: 'LinkedIn Recommendations',
      description: 'Professional recommendations and testimonials',
      path: '/recommendations',
      icon: '💬'
    },
    {
      id: 'achievements',
      title: 'Achievements & Awards',
      description: 'Recognition and accomplishments',
      path: '/achievements',
      icon: '🌟'
    },
    {
      id: 'leadership',
      title: 'Leadership/Volunteering',
      description: 'Leadership roles and volunteer experiences',
      path: '/leadership',
      icon: '🤝'
    }
  ];
  
  // Contact Form Options
  export const CONTACT_TYPES = [
    { value: 'hr-representative', label: 'HR Representative' },
    { value: 'recruiter', label: 'Recruiter' },
    { value: 'manager', label: 'Manager' },
    { value: 'other', label: 'Other' }
  ];
  
  // Theme Options
  export const THEMES = {
    DARK: 'dark',
    LIGHT: 'light'
  };
  
  // Animation Durations
  export const ANIMATION_DURATION = {
    FAST: 200,
    NORMAL: 300,
    SLOW: 500
  };
  
  // Breakpoints
  export const BREAKPOINTS = {
    MOBILE: 480,
    TABLET: 768,
    DESKTOP: 1024,
    LARGE: 1280
  };
  
  // Success Messages
  export const MESSAGES = {
    CONTACT_SUCCESS: 'Thank you for reaching out to me, I will reply to you as soon as possible!!',
    LOADING: 'Loading...',
    NO_DATA: 'No information present'
  };
  
  // File Upload Limits
  export const FILE_UPLOAD = {
    MAX_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
  };