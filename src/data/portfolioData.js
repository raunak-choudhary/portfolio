// src/data/portfolioData.js - UPDATED WITH BETTER FALLBACK STRUCTURE

export const portfolioData = {
  // Hero Section - matches database structure
  hero: {
    title: "Hi, I'm Raunak Choudhary",
    subtitle: "Full-Stack Developer & AI Enthusiast",
    description: "Passionate about creating innovative solutions that bridge technology and user experience. Currently pursuing my Master's in Computer Science with a focus on AI and machine learning applications.",
    highlights: [
      "🎓 MS in Computer Science Student",
      "💻 Full-Stack Development Expert",
      "🤖 AI & Machine Learning Enthusiast",
      "☁️ Cloud Computing Specialist",
      "🚀 Innovation & Problem Solving"
    ],
    cta_text: "View My Work",
    cta_link: "#navigation",
    is_active: true
  },

  // About Section - matches database structure
  about: {
    aboutMe: {
      title: "About Me",
      content: `I'm a passionate computer science graduate student with a deep fascination for technology and its potential to solve real-world problems. Currently pursuing my Master's degree in Computer Science, I specialize in full-stack development, artificial intelligence, and cloud computing.

My journey in technology began during my undergraduate studies, where I discovered my love for programming and software development. Since then, I've been continuously learning and adapting to new technologies, working on diverse projects that span web development, machine learning, and cloud infrastructure.

I believe in the power of clean, efficient code and user-centered design. Whether I'm building a responsive web application, training a machine learning model, or architecting cloud solutions, I always strive for excellence and innovation.

When I'm not coding, I enjoy exploring new technologies, contributing to open-source projects, and sharing knowledge with the developer community. I'm always excited about opportunities to collaborate on meaningful projects that make a positive impact.`
    },
    basicInfo: {
      title: "Basic Info",
      details: {
        "Birth Date": "17 March 1998",
        "Current Residence": "United States",
        "Permanent Residence": "India",
        "Education": "Master's in Computer Science",
        "Specialization": "AI & Full-Stack Development",
        "Languages": "English, Hindi",
        "Interests": "Technology, AI, Cloud Computing"
      }
    },
    profileImages: {
      aboutMe: null, // Will be populated from database
      basicInfo: null, // Will be populated from database  
      legacy: null // For backward compatibility
    }
  },

  // Navigation cards for the main page
  navigation: {
    title: "Explore My Portfolio",
    cards: [
      {
        id: "projects",
        title: "Projects",
        description: "Innovative software solutions and applications",
        icon: "💻",
        route: "/projects",
        gradient: "from-blue-500 to-purple-600"
      },
      {
        id: "internships", 
        title: "Internships",
        description: "Professional experience and industry exposure",
        icon: "🏢",
        route: "/internships",
        gradient: "from-green-500 to-teal-600"
      },
      {
        id: "education",
        title: "Education", 
        description: "Academic background and qualifications",
        icon: "🎓",
        route: "/education",
        gradient: "from-yellow-500 to-orange-600"
      },
      {
        id: "work-experience",
        title: "Work Experience",
        description: "Professional roles and responsibilities", 
        icon: "💼",
        route: "/work-experience",
        gradient: "from-red-500 to-pink-600"
      },
      {
        id: "skills",
        title: "Skills & Competencies",
        description: "Technical skills and expertise areas",
        icon: "⚡",
        route: "/skills", 
        gradient: "from-indigo-500 to-blue-600"
      },
      {
        id: "certifications",
        title: "Certifications & Badges",
        description: "Professional certifications and achievements",
        icon: "🏆",
        route: "/certifications",
        gradient: "from-purple-500 to-indigo-600"
      },
      {
        id: "recommendations",
        title: "LinkedIn Recommendations", 
        description: "Professional testimonials and endorsements",
        icon: "💬",
        route: "/recommendations",
        gradient: "from-teal-500 to-cyan-600"
      },
      {
        id: "achievements",
        title: "Achievements & Awards",
        description: "Recognition and accomplishments",
        icon: "🌟",
        route: "/achievements", 
        gradient: "from-amber-500 to-yellow-600"
      },
      {
        id: "leadership",
        title: "Leadership/Volunteering",
        description: "Leadership roles and community involvement",
        icon: "🤝",
        route: "/leadership",
        gradient: "from-emerald-500 to-green-600"
      }
    ]
  },

  // Contact form configuration
  contact: {
    title: "Get In Touch",
    subtitle: "Let's discuss opportunities and collaborations",
    email: "raunakchoudhary17@gmail.com",
    contactTypes: [
      { value: "hr-representative", label: "HR Representative" },
      { value: "recruiter", label: "Recruiter" }, 
      { value: "manager", label: "Manager" },
      { value: "colleague", label: "Colleague" },
      { value: "client", label: "Client" },
      { value: "vendor", label: "Vendor" },
      { value: "partner", label: "Partner" },
      { value: "investor", label: "Investor" },
      { value: "mentor", label: "Mentor" },
      { value: "student", label: "Student" },
      { value: "researcher", label: "Researcher" },
      { value: "other", label: "Other" }
    ],
    inquiryTypes: [
      { value: "job-opportunity", label: "Job Opportunity" },
      { value: "project-collaboration", label: "Project Collaboration" },
      { value: "consulting", label: "Consulting" },
      { value: "speaking-engagement", label: "Speaking Engagement" },
      { value: "mentorship", label: "Mentorship" },
      { value: "research-collaboration", label: "Research Collaboration" },
      { value: "business-proposal", label: "Business Proposal" },
      { value: "technical-question", label: "Technical Question" },
      { value: "feedback", label: "Feedback" },
      { value: "networking", label: "Networking" },
      { value: "general-inquiry", label: "General Inquiry" },
      { value: "partnership", label: "Partnership" },
      { value: "other", label: "Other" }
    ],
    successMessage: "Thank you for reaching out to me, I will reply to you as soon as possible!!",
    maxFileSize: 5, // MB
    allowedFileTypes: ['.pdf', '.doc', '.docx', '.txt', '.jpg', '.jpeg', '.png'],
    maxFiles: 5
  },

  // Fallback data for other sections (when no database content exists)
  fallbackContent: {
    projects: {
      title: "My Projects",
      subtitle: "Innovative solutions and applications I've built",
      emptyMessage: "No projects information available at the moment."
    },
    
    internships: {
      title: "Internship Experience", 
      subtitle: "Professional learning and industry exposure",
      emptyMessage: "No internship information available at the moment."
    },
    
    education: {
      title: "Educational Background",
      subtitle: "Academic journey and qualifications", 
      emptyMessage: "No education information available at the moment."
    },
    
    workExperience: {
      title: "Work Experience",
      subtitle: "Professional roles and contributions",
      emptyMessage: "No work experience information available at the moment."
    },
    
    skills: {
      title: "Skills & Competencies", 
      subtitle: "Technical expertise and capabilities",
      emptyMessage: "No skills information available at the moment."
    },
    
    certifications: {
      title: "Certifications & Badges",
      subtitle: "Professional credentials and achievements",
      emptyMessage: "No certifications information available at the moment."
    },
    
    recommendations: {
      title: "Professional Recommendations",
      subtitle: "Testimonials from colleagues and supervisors", 
      emptyMessage: "No recommendations available at the moment."
    },
    
    achievements: {
      title: "Achievements & Awards",
      subtitle: "Recognition and accomplishments",
      emptyMessage: "No achievements information available at the moment."
    },
    
    leadership: {
      title: "Leadership & Volunteering",
      subtitle: "Community involvement and leadership roles",
      emptyMessage: "No leadership information available at the moment."
    }
  },

  // Metadata
  meta: {
    siteName: "RC Portfolio",
    tagline: "Full-Stack Developer & AI Enthusiast",
    version: "2.0.0",
    lastUpdated: new Date().toISOString(),
    author: {
      name: "Raunak Choudhary",
      email: "raunakchoudhary17@gmail.com",
      linkedin: "https://linkedin.com/in/raunak-choudhary",
      github: "https://github.com/raunak-choudhary"
    }
  }
};

// Helper functions for data access
export const getHeroData = () => portfolioData.hero;
export const getAboutData = () => portfolioData.about;
export const getNavigationCards = () => portfolioData.navigation.cards;
export const getContactConfig = () => portfolioData.contact;
export const getFallbackContent = (section) => portfolioData.fallbackContent[section];

// Export individual sections for easier imports
export const {
  hero,
  about, 
  navigation,
  contact,
  fallbackContent,
  meta
} = portfolioData;

export default portfolioData;