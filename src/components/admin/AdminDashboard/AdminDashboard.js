// src/components/admin/AdminDashboard/AdminDashboard.js - PRODUCTION VERSION

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { getPortfolioStats } from '../../../services/dataService';
import LoadingSpinner from '../../common/LoadingSpinner';
import ThemeToggle from '../../common/ThemeToggle';
import logoImage from '../../../assets/images/logo.png';
import analyticsService from '../../../services/analyticsService';
import routeNavigation from '../../../utils/routeNavigation'; // 🔐 NEW IMPORT
import './AdminDashboard.css';

import HeroContentManager from './sections/HeroContentManager';
import AboutSectionManager from './sections/AboutSectionManager';
import ProjectsManager from './sections/ProjectsManager';
import InternshipsManager from './sections/InternshipsManager';
import EducationManager from './sections/EducationManager';
import WorkExperienceManager from './sections/WorkExperienceManager';
import SkillsManager from './sections/SkillsManager';
import CertificationsManager from './sections/CertificationsManager';
import RecommendationsManager from './sections/RecommendationsManager';
import AchievementsManager from './sections/AchievementsManager';
import LeadershipManager from './sections/LeadershipManager';
import ContactMessagesManager from './sections/ContactMessagesManager';
import AnalyticsDashboard from '../Analytics/AnalyticsDashboard';

const AdminDashboard = () => {
  const { signOut } = useAuth();
  
  // Core dashboard state
  const [activeSection, setActiveSection] = useState('dashboard');
  const [showPreview, setShowPreview] = useState(false);
  const [portfolioStats, setPortfolioStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  
  // Navigation and state management
  const [sectionLoading, setSectionLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [sectionHistory, setSectionHistory] = useState(['dashboard']);

  // Enhanced Preview State
  const [previewMode, setPreviewMode] = useState('desktop');
  const [previewUrl, setPreviewUrl] = useState('/');

  // 🔐 NEW: Encrypted navigation state
  const [encryptedRoutes, setEncryptedRoutes] = useState({});
  const [navigationReady, setNavigationReady] = useState(false);

  // Dashboard sections configuration
  const dashboardSections = [
    { id: 'dashboard', name: 'Dashboard Overview', icon: '📊', color: 'cyan', shortcut: '1' },
    { id: 'hero', name: 'Hero Content', icon: '🚀', color: 'purple', shortcut: 'h' },
    { id: 'about', name: 'About Section', icon: '👤', color: 'pink', shortcut: 'a' },
    { id: 'projects', name: 'Projects', icon: '💻', color: 'blue', shortcut: '2' },
    { id: 'internships', name: 'Internships', icon: '🏢', color: 'green', shortcut: 'i' },
    { id: 'education', name: 'Education', icon: '🎓', color: 'orange', shortcut: 'e' },
    { id: 'work', name: 'Work Experience', icon: '💼', color: 'red', shortcut: 'w' },
    { id: 'skills', name: 'Skills', icon: '⚡', color: 'yellow', shortcut: 's' },
    { id: 'certifications', name: 'Certifications', icon: '🏆', color: 'indigo', shortcut: 'c' },
    { id: 'recommendations', name: 'Recommendations', icon: '⭐', color: 'teal', shortcut: 'r' },
    { id: 'achievements', name: 'Achievements', icon: '🥇', color: 'lime', shortcut: 'm' },
    { id: 'leadership', name: 'Leadership', icon: '👑', color: 'violet', shortcut: 'l' },
    { id: 'contact', name: 'Contact Messages', icon: '📧', color: 'rose', shortcut: '3' },
    { id: 'analytics', name: 'Analytics', icon: '📈', color: 'emerald', shortcut: 'b' }
  ];

  // Section-specific state management
  const [sectionStates, setSectionStates] = useState(() => {
    const initialStates = {};
    dashboardSections.forEach(section => {
      initialStates[section.id] = {
        loaded: section.id === 'dashboard',
        data: null,
        hasChanges: false
      };
    });
    return initialStates;
  });

  // 🔐 NEW: Initialize encrypted navigation on mount
  useEffect(() => {
    const setupEncryptedNavigation = async () => {
      try {
        console.log('🔐 Setting up encrypted navigation for dashboard...');
        
        const routeResult = routeNavigation.getCurrentAdminRoutes();
        
        if (routeResult.success) {
          setEncryptedRoutes(routeResult.routes);
          console.log('✅ Encrypted routes loaded for dashboard');
        } else {
          console.warn('⚠️ Using fallback routes for dashboard');
          setEncryptedRoutes({
            adminlogin: '/adminlogin',
            admindashboard: '/admindashboard',
            adminsignout: '/adminsignout'
          });
        }
        
        setNavigationReady(true);
      } catch (error) {
        console.error('❌ Failed to setup encrypted navigation:', error);
        setNavigationReady(true);
      }
    };

    setupEncryptedNavigation();
  }, []);

  // Load section data function
  const loadSectionData = useCallback(async (sectionId) => {
    console.log(`Loading data for section: ${sectionId}`);
    setSectionStates(prev => ({
      ...prev,
      [sectionId]: { ...prev[sectionId], loaded: true, data: { message: `Data for ${sectionId}` } }
    }));
  }, []);

  // Enhanced section change handler with navigation tracking
  const handleSectionChange = useCallback(async (sectionId) => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to leave this section?'
      );
      if (!confirmed) return;
    }

    try {
      setSectionLoading(true);
      setActiveSection(sectionId);

      // Track section navigation
      routeNavigation.storeNavigationHistory('/admindashboard', sectionId);

      // Analytics tracking
      try {
        const analyticsSession = JSON.parse(localStorage.getItem('admin_analytics_session') || '{}');
        if (analyticsSession.sessionId) {
          await analyticsService.trackEvent(
            'section_visit',
            'admin',
            'visit_section',
            sectionId,
            1,
            { 
              fromSection: activeSection,
              timestamp: new Date().toISOString(),
              sessionDuration: Date.now() - new Date(analyticsSession.startTime).getTime()
            },
            'admin',
            analyticsSession.sessionId
          );

          const updatedSession = {
            ...analyticsSession,
            sectionsVisited: [...new Set([...(analyticsSession.sectionsVisited || []), sectionId])],
            actionsPerformed: (analyticsSession.actionsPerformed || 0) + 1
          };
          localStorage.setItem('admin_analytics_session', JSON.stringify(updatedSession));
        }
      } catch (analyticsError) {
        console.warn('Analytics tracking failed:', analyticsError);
      }

      if (!sectionStates[sectionId]?.loaded && sectionId !== 'dashboard') {
        await loadSectionData(sectionId);
      }
      
      setHasUnsavedChanges(false);
      
      const newUrl = sectionId === 'dashboard' 
        ? encryptedRoutes.admindashboard || '/admindashboard'
        : `${encryptedRoutes.admindashboard || '/admindashboard'}?section=${sectionId}`;
      
      window.history.pushState({ section: sectionId }, '', newUrl);
      
      setSectionHistory(prev => {
        const newHistory = prev.filter(s => s !== sectionId);
        return [sectionId, ...newHistory].slice(0, 10);
      });
      
    } catch (error) {
      console.error('Error switching section:', error);
    } finally {
      setSectionLoading(false);
    }
  }, [hasUnsavedChanges, sectionStates, loadSectionData, encryptedRoutes]);

  // Enhanced quick save handler
  const handleQuickSave = useCallback(() => {
    if (hasUnsavedChanges) {
      try {
        const analyticsSession = JSON.parse(localStorage.getItem('admin_analytics_session') || '{}');
        if (analyticsSession.sessionId) {
          analyticsService.trackEvent(
            'admin_action',
            'admin',
            'quick_save',
            activeSection,
            1,
            { 
              section: activeSection,
              timestamp: new Date().toISOString()
            },
            'admin',
            analyticsSession.sessionId
          );

          const updatedSession = {
            ...analyticsSession,
            actionsPerformed: (analyticsSession.actionsPerformed || 0) + 1
          };
          localStorage.setItem('admin_analytics_session', JSON.stringify(updatedSession));
        }
      } catch (analyticsError) {
        console.warn('Analytics save tracking failed:', analyticsError);
      }
      
      console.log('Changes saved for section:', activeSection);
      setHasUnsavedChanges(false);
      setSectionStates(prev => ({
        ...prev,
        [activeSection]: { ...prev[activeSection], hasChanges: false }
      }));
    }
  }, [hasUnsavedChanges, activeSection]);

  // Enhanced auto-save handler
  const handleAutoSave = useCallback(() => {
    if (hasUnsavedChanges) {
      console.log('Auto-saved for section:', activeSection);
      handleQuickSave(); 
    }
  }, [hasUnsavedChanges, activeSection, handleQuickSave]);

  // Enhanced preview toggle
  const togglePreview = () => {
    setShowPreview(prevShowPreview => !prevShowPreview);
    if (!showPreview) {
      setPreviewUrl(`/?preview=${Date.now()}`);
    }
  };

  // Enhanced preview mode handlers
  const handlePreviewModeChange = (mode) => {
    setPreviewMode(mode);
  };

  // 🔐 UPDATED: Enhanced sign out with encrypted navigation
  const handleSignOut = async () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to sign out?'
      );
      if (!confirmed) return;
    }

    // Track admin session analytics
    try {
      const analyticsSession = JSON.parse(localStorage.getItem('admin_analytics_session') || '{}');
      
      if (analyticsSession.sessionId && analyticsSession.startTime) {
        const endTime = new Date();
        const startTime = new Date(analyticsSession.startTime);
        const sectionsVisited = analyticsSession.sectionsVisited || ['dashboard'];
        const actionsPerformed = analyticsSession.actionsPerformed || 1;

        await analyticsService.trackAdminSession(
          startTime,
          endTime,
          sectionsVisited,
          actionsPerformed
        );

        localStorage.removeItem('admin_analytics_session');
      }
    } catch (analyticsError) {
      console.warn('Analytics session tracking failed:', analyticsError);
    }
    
    setHasUnsavedChanges(false);
    
    try {
      await signOut();
      
      // Use encrypted navigation for sign out
      const navResult = routeNavigation.navigateToAdminSignOut({ replace: true });
      
      if (!navResult.success) {
        // Fallback navigation
        window.location.href = '/adminsignout';
      }
    } catch (error) {
      console.error('Error during sign out:', error);
      window.location.href = '/adminsignout';
    }
  };

  // Enhanced go back functionality
  const goBack = () => {
    if (sectionHistory.length > 1) {
      const previousSection = sectionHistory[1];
      handleSectionChange(previousSection);
    }
  };

  // Enhanced refresh section functionality
  const refreshSection = async () => {
    setSectionLoading(true);
    try {
      if (activeSection === 'dashboard') {
        const stats = await getPortfolioStats();
        setPortfolioStats(stats);
        setLastUpdated(new Date().toLocaleString());
        setSectionStates(prev => ({
          ...prev,
          dashboard: { ...prev.dashboard, data: stats, loaded: true }
        }));
      } else {
        await loadSectionData(activeSection);
      }
    } catch (error) {
      console.error(`Error refreshing section ${activeSection}:`, error);
    } finally {
      setSectionLoading(false);
    }
  };

  // Return to dashboard handler
  const returnToDashboard = () => {
    handleSectionChange('dashboard');
  };

  // Load portfolio statistics on initial mount
  useEffect(() => {
    const loadDashboardData = async () => {
      setIsLoading(true);
      try {
        const stats = await getPortfolioStats();
        setPortfolioStats(stats);
        setLastUpdated(new Date().toLocaleString());
        setSectionStates(prev => ({
          ...prev,
          dashboard: { ...prev.dashboard, data: stats, loaded: true }
        }));
      } catch (error) {
        console.error('Error loading initial dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadDashboardData();
  }, []);

  // Handle URL changes (browser back/forward)
  useEffect(() => {
    const handlePopState = (event) => {
      const sectionFromUrl = event.state?.section || 
                             new URLSearchParams(window.location.search).get('section') || 
                             'dashboard';
      if (sectionFromUrl !== activeSection) {
        setActiveSection(sectionFromUrl);
        if (!sectionStates[sectionFromUrl]?.loaded && sectionFromUrl !== 'dashboard') {
          loadSectionData(sectionFromUrl);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    const urlParams = new URLSearchParams(window.location.search);
    const initialSectionFromUrl = urlParams.get('section');
    if (initialSectionFromUrl && initialSectionFromUrl !== activeSection) {
      setActiveSection(initialSectionFromUrl);
      if (!sectionStates[initialSectionFromUrl]?.loaded && initialSectionFromUrl !== 'dashboard') {
        loadSectionData(initialSectionFromUrl);
      }
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeSection, sectionStates, loadSectionData]);

  // Enhanced keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case '1': e.preventDefault(); handleSectionChange('dashboard'); break;
          case '2': e.preventDefault(); handleSectionChange('projects'); break;
          case '3': e.preventDefault(); handleSectionChange('contact'); break;
          case 'h': e.preventDefault(); handleSectionChange('hero'); break;
          case 'a': e.preventDefault(); handleSectionChange('about'); break;
          case 'i': e.preventDefault(); handleSectionChange('internships'); break;
          case 'e': e.preventDefault(); handleSectionChange('education'); break;
          case 'w': e.preventDefault(); handleSectionChange('work'); break;
          case 'b': e.preventDefault(); handleSectionChange('analytics'); break;
          case 's':
            e.preventDefault();
            if (e.shiftKey) {
              handleSectionChange('skills');
            } else {
              handleQuickSave();
            }
            break;
          case 'c': e.preventDefault(); handleSectionChange('certifications'); break;
          case 'r': e.preventDefault(); handleSectionChange('recommendations'); break;
          case 'm': e.preventDefault(); handleSectionChange('achievements'); break;
          case 'l': e.preventDefault(); handleSectionChange('leadership'); break;
          case 'p': e.preventDefault(); togglePreview(); break;
          default: break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleSectionChange, handleQuickSave, togglePreview]);

  // Auto-save functionality
  useEffect(() => {
    let autoSaveInterval;
    if (hasUnsavedChanges) {
      autoSaveInterval = setInterval(() => {
        handleAutoSave();
      }, 30000); // 30 seconds
    }
    return () => clearInterval(autoSaveInterval);
  }, [hasUnsavedChanges, handleAutoSave]);

  // Show loading if navigation not ready
  if (!navigationReady) {
    return (
      <div className="admin-loading">
        <LoadingSpinner />
        <p>Setting up secure dashboard...</p>
      </div>
    );
  }

  // Render enhanced dashboard overview
  const renderDashboardOverview = () => (
    <div className="dashboard-overview">
      <div className="overview-header">
        <h2 className="overview-title">
          <span className="gradient-text">Welcome back, RC! 🎯</span>
        </h2>
        <p className="overview-subtitle">Your portfolio command center</p>
      </div>

      <div className="stats-grid">
        {isLoading && !portfolioStats ? (
          <div className="loading-stats" style={{ gridColumn: '1 / -1' }}>
            <LoadingSpinner />
            <p>Loading portfolio statistics...</p>
          </div>
        ) : portfolioStats ? (
          <>
            {/* Stats cards with click handlers */}
            <div 
              className="stat-card cyan-glow" 
              onClick={() => handleSectionChange('projects')}
              style={{ cursor: 'pointer' }}
              title="Click to manage projects"
            >
              <div className="stat-icon">💻</div>
              <div className="stat-content">
                <h3>{portfolioStats.projects || 0}</h3>
                <p>Active Projects</p>
              </div>
            </div>

            <div 
              className="stat-card purple-glow"
              onClick={() => handleSectionChange('internships')}
              style={{ cursor: 'pointer' }}
              title="Click to manage internships"
            >
              <div className="stat-icon">🏢</div>
              <div className="stat-content">
                <h3>{portfolioStats.internships || 0}</h3>
                <p>Internships</p>
              </div>
            </div>

            <div 
              className="stat-card orange-glow"
              onClick={() => handleSectionChange('education')}
              style={{ cursor: 'pointer' }}
              title="Click to manage education"
            >
              <div className="stat-icon">🎓</div>
              <div className="stat-content">
                <h3>{portfolioStats.education || 0}</h3>
                <p>Education Entries</p>
              </div>
            </div>

            <div 
              className="stat-card red-glow"
              onClick={() => handleSectionChange('work')}
              style={{ cursor: 'pointer' }}
              title="Click to manage work experience"
            >
              <div className="stat-icon">💼</div>
              <div className="stat-content">
                <h3>{portfolioStats.workExperience || 0}</h3>
                <p>Work Experiences</p>
              </div>
            </div>

            <div 
              className="stat-card yellow-glow"
              onClick={() => handleSectionChange('skills')}
              style={{ cursor: 'pointer' }}
              title="Click to manage skills"
            >
              <div className="stat-icon">⚡</div>
              <div className="stat-content">
                <h3>{portfolioStats.skills || 0}</h3>
                <p>Skills Listed</p>
              </div>
            </div>

            <div 
              className="stat-card indigo-glow"
              onClick={() => handleSectionChange('certifications')}
              style={{ cursor: 'pointer' }}
              title="Click to manage certifications"
            >
              <div className="stat-icon">🏆</div>
              <div className="stat-content">
                <h3>{portfolioStats.certifications || 0}</h3>
                <p>Certifications</p>
              </div>
            </div>

            <div 
              className="stat-card teal-glow"
              onClick={() => handleSectionChange('recommendations')}
              style={{ cursor: 'pointer' }}
              title="Click to manage recommendations"
            >
              <div className="stat-icon">⭐</div>
              <div className="stat-content">
                <h3>{portfolioStats.recommendations || 0}</h3>
                <p>Recommendations</p>
              </div>
            </div>

            <div 
              className="stat-card lime-glow"
              onClick={() => handleSectionChange('achievements')}
              style={{ cursor: 'pointer' }}
              title="Click to manage achievements"
            >
              <div className="stat-icon">🥇</div>
              <div className="stat-content">
                <h3>{portfolioStats.achievements || 0}</h3>
                <p>Achievements</p>
              </div>
            </div>

            <div 
              className="stat-card violet-glow"
              onClick={() => handleSectionChange('leadership')}
              style={{ cursor: 'pointer' }}
              title="Click to manage leadership"
            >
              <div className="stat-icon">👑</div>
              <div className="stat-content">
                <h3>{portfolioStats.leadership || 0}</h3>
                <p>Leadership Roles</p>
              </div>
            </div>

            <div 
              className="stat-card rose-glow"
              onClick={() => handleSectionChange('contact')}
              style={{ cursor: 'pointer' }}
              title="Click to view contact messages"
            >
              <div className="stat-icon">📧</div>
              <div className="stat-content">
                <h3>{portfolioStats.messages || 0}</h3>
                <p>New Messages</p>
              </div>
            </div>

            <div 
              className="stat-card emerald-glow" 
              onClick={() => handleSectionChange('analytics')}
              style={{ cursor: 'pointer' }}
              title="Click to view analytics dashboard"
            >
              <div className="stat-icon">📈</div>
              <div className="stat-content">
                <h3>Analytics</h3>
                <p>Performance Insights</p>
              </div>
            </div>
          </>
        ) : (
          <div className="loading-stats" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>
            <p>Could not load statistics.</p>
          </div>
        )}
      </div>

      <div className="quick-actions">
        <h3 className="quick-actions-title">Quick Actions</h3>
        <div className="action-buttons">
          <button 
            className="action-btn primary-action"
            onClick={() => handleSectionChange('projects')}
          >
            <span className="btn-icon">➕</span>
            Add New Project
          </button>
          <button 
            className="action-btn secondary-action"
            onClick={() => handleSectionChange('contact')}
          >
            <span className="btn-icon">📧</span>
            Check Messages
          </button>
          <button 
            className="action-btn tertiary-action"
            onClick={togglePreview}
          >
            <span className="btn-icon">👁️</span>
            Preview Portfolio
          </button>
          <button 
            className="action-btn primary-action"
            onClick={() => handleSectionChange('analytics')}
          >
            <span className="btn-icon">📈</span>
            View Analytics
          </button>
        </div>
      </div>

      {lastUpdated && (
        <div className="last-updated">
          <p>Dashboard last updated: {lastUpdated}</p>
        </div>
      )}
    </div>
  );

  // Render section content
  const renderSectionContent = () => {
    if (activeSection === 'dashboard') {
      return renderDashboardOverview();
    }

    const currentSection = dashboardSections.find(s => s.id === activeSection);
    const currentSectionData = sectionStates[activeSection]?.data;

    if (sectionLoading && !currentSectionData) {
      return (
        <div className="admin-section-content" style={{textAlign: 'center', paddingTop: '50px'}}>
          <LoadingSpinner />
          <p>Loading {currentSection?.name}...</p>
        </div>
      );
    }

    // Handle specific sections with dedicated managers
    switch (activeSection) {
      case 'hero':
        return <HeroContentManager />;
      case 'about':
        return <AboutSectionManager />;
      case 'projects':
        return <ProjectsManager />;
      case 'internships':
        return <InternshipsManager />;
      case 'education':
        return <EducationManager />;
      case 'work':
        return <WorkExperienceManager />;
      case 'skills':
        return <SkillsManager />;
      case 'certifications':
        return <CertificationsManager />;
      case 'recommendations':
        return <RecommendationsManager />;
      case 'achievements':
        return <AchievementsManager />;
      case 'leadership':
        return <LeadershipManager />;
      case 'contact':
        return <ContactMessagesManager />;
      case 'analytics':
        return <AnalyticsDashboard />;
      default:
        return (
          <div className="admin-section-content">
            <div className="admin-section-header">
              <h2 className="admin-section-title">
                <span className="admin-section-icon">{currentSection?.icon}</span>
                {currentSection?.name}
              </h2>
              <p className="admin-section-subtitle">
                Manage your {currentSection?.name.toLowerCase()} content here.
              </p>
            </div>
            
            <div className="section-placeholder">
              <div className="placeholder-content">
                <div className="placeholder-icon">🚧</div>
                <h3>Content Management for "{currentSection?.name}"</h3>
                <p>
                  The interface for managing {currentSection?.name.toLowerCase()} will be implemented here.
                </p>
                <button className="placeholder-btn" onClick={returnToDashboard}>
                  Return to Dashboard
                </button>
              </div>
            </div>
          </div>
        );
    }
  };

  // Loading state for the entire dashboard
  if (isLoading && activeSection === 'dashboard' && !portfolioStats) {
    return (
      <div className="admin-loading">
        <LoadingSpinner />
        <p>Loading RC's Admin Dashboard...</p>
      </div>
    );
  }

  // Main render
  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <div className="header-left">
          <button className="sidebar-toggle-btn" onClick={() => {
            const sidebar = document.querySelector('.admin-sidebar');
            const overlay = document.querySelector('.admin-sidebar-overlay');
            sidebar?.classList.toggle('mobile-open');
            overlay?.classList.toggle('active');
          }}>
            ☰ 
          </button>
          <div className="admin-logo" onClick={returnToDashboard} style={{cursor: 'pointer'}}>
            <div className="logo-image">
              <img src={logoImage} alt="RC Logo" />
            </div>
            <div className="logo-content">
              <span className="logo-subtitle">ADMIN PORTAL</span>
            </div>
          </div>
          
          <div className="navigation-controls">
            <button 
              className="nav-control-btn"
              onClick={goBack}
              disabled={sectionHistory.length <= 1}
              title="Go Back"
            >
              <span>←</span>
            </button>
            
            <div className="breadcrumb">
              <span 
                className="breadcrumb-home"
                onClick={returnToDashboard}
                style={{ cursor: 'pointer' }}
              >
                Dashboard
              </span>
              {activeSection !== 'dashboard' && (
                <>
                  <span className="breadcrumb-separator">→</span>
                  <span className="breadcrumb-current">
                    {dashboardSections.find(s => s.id === activeSection)?.name || 'Current Section'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="header-right">
          <div className="header-actions">
            <ThemeToggle />
            <button 
              className="preview-btn"
              onClick={togglePreview}
              title="Preview Portfolio (Ctrl/Cmd + P)"
            >
              <span className="btn-icon">👁️</span>
              Preview
            </button>
            <button 
              className="refresh-btn"
              onClick={refreshSection}
              title="Refresh Section"
              disabled={sectionLoading}
            >
              <span className="btn-icon">🔄</span>
              {sectionLoading && activeSection !== 'dashboard' ? 'Loading...' : 'Refresh'}
            </button>
            {hasUnsavedChanges && (
              <button 
                className="save-btn"
                onClick={handleQuickSave}
                title="Quick Save (Ctrl/Cmd + S)"
              >
                <span className="btn-icon">💾</span>
                Save
              </button>
            )}
          </div>
          
          <div className="admin-profile">
            <div className="profile-info">
              <span className="profile-name">RC</span>
              <span className="profile-role">Administrator</span>
            </div>
            <button 
              className="signout-btn"
              onClick={handleSignOut}
              title="Sign Out"
            >
              <span className="btn-icon">🚪</span>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="dashboard-body">
        <div className="admin-sidebar-overlay" onClick={() => {
          const sidebar = document.querySelector('.admin-sidebar');
          const overlay = document.querySelector('.admin-sidebar-overlay');
          sidebar?.classList.remove('mobile-open');
          overlay?.classList.remove('active');
        }}></div>
        
        <aside className="admin-sidebar">
          <nav className="sidebar-nav">
            {dashboardSections.map(section => (
              <button
                key={section.id}
                className={`nav-item ${activeSection === section.id ? 'active' : ''}`}
                data-section={section.id}
                onClick={() => handleSectionChange(section.id)}
                disabled={sectionLoading && activeSection !== section.id}
                title={section.name + (section.shortcut ? ` (Ctrl/Cmd + ${section.shortcut.toUpperCase()})` : '')}
              >
                <span className="nav-icon">{section.icon}</span>
                <span className="nav-text">{section.name}</span>
                {sectionStates[section.id]?.hasChanges && (
                  <span className="nav-changes-indicator" title="Unsaved changes">●</span>
                )}
                {section.id === 'contact' && portfolioStats?.messages > 0 && (
                  <span className="nav-badge">{portfolioStats.messages}</span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        <main className="admin-main">
          {sectionLoading && activeSection !== 'dashboard' ? (
            <div style={{textAlign: 'center', paddingTop: '50px'}}>
              <LoadingSpinner />
              <p>Loading {dashboardSections.find(s => s.id === activeSection)?.name}...</p>
            </div>
          ) : renderSectionContent()}
        </main>
      </div>

      {showPreview && (
        <div className="preview-modal">
          <div className="preview-backdrop" onClick={togglePreview}></div>
          <div className="preview-container">
            <div className="preview-header">
              <div className="preview-title">
                <span className="preview-icon">👁️</span>
                Portfolio Preview
              </div>

              <div className="preview-controls">
                <div className="preview-device-controls">
                  <button 
                    className={`preview-control-btn ${previewMode === 'desktop' ? 'active' : ''}`}
                    onClick={() => handlePreviewModeChange('desktop')}
                    title="Desktop Mode"
                  >
                    <span>🖥️</span>
                  </button>
                  <button 
                    className={`preview-control-btn ${previewMode === 'tablet' ? 'active' : ''}`}
                    onClick={() => handlePreviewModeChange('tablet')}
                    title="Tablet Mode"
                  >
                    <span>📱</span>
                  </button>
                  <button 
                    className={`preview-control-btn ${previewMode === 'mobile' ? 'active' : ''}`}
                    onClick={() => handlePreviewModeChange('mobile')}
                    title="Mobile Mode"
                  >
                    <span>📲</span>
                  </button>
                </div>

                <button className="preview-close-btn" onClick={togglePreview} title="Close Preview">
                  <span>✕</span>
                </button>
              </div>
            </div>
            
            <div className="preview-content">
              <div className={`preview-iframe-container ${previewMode}`}>
                <iframe
                  src={previewUrl}
                  title="Portfolio Preview"
                  className={`preview-iframe ${previewMode}`}
                  frameBorder="0"
                  key={previewUrl}
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
              
              <div className="preview-stats-bar">
                <div className="preview-stats-left">
                  <div className="preview-stat-item">
                    <span className="preview-stat-icon">📐</span>
                    <span className="preview-mode-indicator">
                      {previewMode === 'desktop' && 'Desktop View'}
                      {previewMode === 'tablet' && 'Tablet View'}
                      {previewMode === 'mobile' && 'Mobile View'}
                    </span>
                  </div>
                  <div className="preview-stat-item">
                    <span className="preview-stat-icon">↔️</span>
                    <span className="preview-device-info">
                      {previewMode === 'desktop' && 'Full Width'}
                      {previewMode === 'tablet' && '~768px Wide'}
                      {previewMode === 'mobile' && '~375px Wide'}
                    </span>
                  </div>
                </div>
                <div className="preview-stats-right">
                  <div className="preview-stat-item">
                    <span className="preview-stat-icon">⚡</span>
                    <span className="preview-performance-indicator">Live Preview</span>
                  </div>
                  <div className="preview-stat-item">
                    <span className="preview-stat-icon">🕒</span>
                    <span className="preview-last-updated">
                      {lastUpdated ? `Updated: ${typeof lastUpdated === 'string' ? (lastUpdated.split(',')[1]?.trim() || lastUpdated) : new Date(lastUpdated).toLocaleTimeString()}` : 'Recently Updated'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;