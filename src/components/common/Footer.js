// src/components/common/Footer.js

import React from 'react';
import visitorTracking from '../../services/visitorTrackingService';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './Footer.css';

// Import the PNG icons
import linkedinIcon from '../../assets/icons/linkedin.png';
import githubIcon from '../../assets/icons/github.png';
import instagramIcon from '../../assets/icons/instagram.png';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const location = useLocation();
  const navigate = useNavigate();

  const quickLinks = [
    { name: 'Home', path: '/', section: 'hero' },
    { name: 'Projects', path: '/projects' },
    { name: 'Experience', path: '/work-experience' },
    { name: 'Skills', path: '/skills' },
    { name: 'Contact', path: '/#contact', section: 'contact' }
  ];

  const portfolioSections = [
    { name: 'Education', path: '/education' },
    { name: 'Internships', path: '/internships' },
    { name: 'Certifications', path: '/certifications' },
    { name: 'Achievements', path: '/achievements' },
    { name: 'Leadership', path: '/leadership' }
  ];

  const socialLinks = [
    {
      name: 'LinkedIn',
      url: 'https://www.linkedin.com/in/raunak-choudhary/',
      icon: linkedinIcon
    },
    {
      name: 'GitHub',
      url: 'https://github.com/raunak-choudhary',
      icon: githubIcon
    },
    {
      name: 'Instagram',
      url: 'https://www.instagram.com/r_a_u_n_a_k.17/',
      icon: instagramIcon
    }
  ];

  const handleSocialClick = (platform, url) => {
    visitorTracking.trackClick('social_media', platform, url);
  };

  const handleFooterLinkClick = (linkName, linkPath) => {
    visitorTracking.trackClick('footer_navigation', linkName, linkPath);
  };

  const handleEmailClick = () => {
    visitorTracking.trackClick('contact_email', 'footer_email', 'mailto:raunakchoudhary17@gmail.com');
  };

  const handleQuickLinkClick = (link) => {
    handleFooterLinkClick(link.name, link.path);
    
    if (link.path === '/') {
      // Navigate to home and scroll to top
      navigate('/');
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    } else if (link.path.includes('#')) {
      const sectionId = link.section;
      
      if (location.pathname === '/') {
        // Already on landing page, just scroll to section
        const element = document.getElementById(sectionId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
          window.history.pushState(null, '', `/#${sectionId}`);
        }
      } else {
        // Navigate to landing page then scroll to section
        navigate('/');
        setTimeout(() => {
          const element = document.getElementById(sectionId);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
            window.history.pushState(null, '', `/#${sectionId}`);
          }
        }, 300);
      }
    }
  };

  const handleBrandClick = () => {
    visitorTracking.trackClick('footer_brand', 'logo_click', '/');
    navigate('/');
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  return (
    <footer className="footer glass-footer">
      <div className="footer-container container">
        <div className="footer-content">
          {/* Brand Section - UPDATED with tracking */}
          <div className="footer-brand">
            <div className="footer-logo-section">
              <img 
                src="/logo.png" 
                alt="RC Portfolio Logo" 
                className="footer-logo"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
              <button onClick={handleBrandClick} className="footer-brand-text shimmer-text">
                RC Portfolio
              </button>
            </div>
            <p className="footer-description">
              Full Stack Developer & AWS Cloud Specialist focused on building innovative solutions 
              with cutting-edge technologies. Currently pursuing MS in Computer Science at NYU.
            </p>
            
            {/* Social Links - UPDATED with tracking */}
            <div className="footer-social">
              {socialLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-link"
                  aria-label={link.name}
                  title={link.name}
                  onClick={() => handleSocialClick(link.name.toLowerCase(), link.url)}
                >
                  <img 
                    src={link.icon} 
                    alt={`${link.name} icon`}
                    className="social-icon-img"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      console.error(`Failed to load ${link.name} icon`);
                    }}
                  />
                </a>
              ))}
            </div>
          </div>

          {/* Quick Links - UPDATED with tracking */}
          <div className="footer-links">
            <h4 className="footer-section-title">Quick Links</h4>
            <ul className="footer-link-list">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  {link.path.includes('#') || link.path === '/' ? (
                    <button
                      onClick={() => handleQuickLinkClick(link)}
                      className="footer-link"
                    >
                      {link.name}
                    </button>
                  ) : (
                    <Link 
                      to={link.path} 
                      className="footer-link"
                      onClick={() => handleFooterLinkClick(link.name, link.path)}
                    >
                      {link.name}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Portfolio Sections - UPDATED with tracking */}
          <div className="footer-links">
            <h4 className="footer-section-title">Portfolio</h4>
            <ul className="footer-link-list">
              {portfolioSections.map((link) => (
                <li key={link.name}>
                  <Link 
                    to={link.path} 
                    className="footer-link"
                    onClick={() => handleFooterLinkClick(link.name, link.path)}
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Info - UPDATED with tracking */}
          <div className="footer-contact">
            <h4 className="footer-section-title">Get In Touch</h4>
            <div className="contact-info">
              <p className="contact-item">
                <span className="contact-label">Email:</span>
                <a 
                  href="mailto:raunakchoudhary17@gmail.com" 
                  className="contact-link"
                  onClick={handleEmailClick}
                >
                  raunakchoudhary17@gmail.com
                </a>
              </p>
              <p className="contact-item">
                <span className="contact-label">Location:</span>
                <span>New York, USA</span>
              </p>
              <p className="contact-item">
                <span className="contact-label">Status:</span>
                <span className="status-available">&nbsp;Available for opportunities</span>
              </p>
            </div>
          </div>
        </div>

        {/* Footer Bottom */}
        <div className="footer-bottom">
          <div className="footer-bottom-content">
            <p className="copyright">
              © {currentYear} | Raunak Choudhary | All rights reserved
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;