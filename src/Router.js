// src/Router.js - PRODUCTION VERSION

import React, { useEffect, useState } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Header from './components/common/Header';
import Footer from './components/common/Footer';
import { withAuth, EncryptedRouteErrorBoundary } from './contexts/AuthContext';
import routeEncoder from './utils/routeEncoder';

// Page Components
import LandingPage from './pages/LandingPage';
import ProjectsPage from './pages/ProjectsPage';
import InternshipsPage from './pages/InternshipsPage';
import EducationPage from './pages/EducationPage';
import WorkExperiencePage from './pages/WorkExperiencePage';
import SkillsPage from './pages/SkillsPage';
import CertificationsPage from './pages/CertificationsPage';
import RecommendationsPage from './pages/RecommendationsPage';
import AchievementsPage from './pages/AchievementsPage';
import LeadershipPage from './pages/LeadershipPage';

// Admin Components
import AdminLogin from './components/admin/AdminLogin/AdminLogin';
import AdminWelcome from './components/admin/AdminWelcome/AdminWelcome';
import AdminSignOut from './components/admin/AdminSignOut/AdminSignOut';

// Protected Admin Components
const ProtectedAdminWelcome = withAuth(AdminWelcome);

// ====================================================
// ENCRYPTED ROUTE HANDLER
// ====================================================

const EncryptedRouteHandler = ({ children }) => {
  const location = useLocation();
  const [routeResolved, setRouteResolved] = useState(false);
  const [targetComponent, setTargetComponent] = useState(null);

  useEffect(() => {
    const resolveEncryptedRoute = async () => {
      try {
        const currentPath = location.pathname;
        const decryptedRoute = routeEncoder.decryptRoute(currentPath);
        
        if (decryptedRoute) {
          switch (decryptedRoute) {
            case '/adminlogin':
              setTargetComponent(<AdminLogin />);
              break;
            case '/admindashboard':
              setTargetComponent(<ProtectedAdminWelcome />);
              break;
            case '/adminsignout':
              setTargetComponent(<AdminSignOut />);
              break;
            default:
              setTargetComponent(<Navigate to="/404" replace />);
          }
        } else {
          setTargetComponent(<Navigate to="/404" replace />);
        }
      } catch (error) {
        console.error('Route resolution error:', error);
        setTargetComponent(<Navigate to="/404" replace />);
      } finally {
        setRouteResolved(true);
      }
    };

    resolveEncryptedRoute();
  }, [location.pathname]);

  if (!routeResolved) {
    return (
      <div className="route-resolving">
        <div className="loading-spinner-container">
          <div className="loading-spinner">
            <div className="spinner-ring">
              <div className="spinner-ring-inner"></div>
            </div>
          </div>
          <p>Verifying access...</p>
        </div>
      </div>
    );
  }

  return targetComponent;
};

// ====================================================
// LEGACY ROUTE REDIRECTOR
// ====================================================

const LegacyRouteRedirector = ({ route }) => {
  const [redirectTarget, setRedirectTarget] = useState(null);
  
  useEffect(() => {
    const getRedirectTarget = async () => {
      try {
        const encryptedRoutes = routeEncoder.getStoredAdminRoutes();
        
        let target;
        switch (route) {
          case '/adminlogin':
            target = encryptedRoutes.adminlogin;
            break;
          case '/admindashboard':
            target = encryptedRoutes.admindashboard;
            break;
          case '/adminsignout':
            target = encryptedRoutes.adminsignout;
            break;
          default:
            target = '/404';
        }
        
        setRedirectTarget(target);
      } catch (error) {
        console.error('Redirect resolution error:', error);
        setRedirectTarget('/404');
      }
    };

    getRedirectTarget();
  }, [route]);
  
  if (!redirectTarget) {
    return (
      <div className="redirect-loading">
        <div className="loading-spinner-container">
          <div className="loading-spinner">
            <div className="spinner-ring">
              <div className="spinner-ring-inner"></div>
            </div>
          </div>
          <p>Redirecting to secure route...</p>
        </div>
      </div>
    );
  }
  
  return <Navigate to={redirectTarget} replace />;
};

// ====================================================
// ENHANCED 404 PAGE
// ====================================================

const NotFoundPage = () => {
  const location = useLocation();
  const [isAdminRoute, setIsAdminRoute] = useState(false);
  const [suggestedRoute, setSuggestedRoute] = useState('/');
  
  useEffect(() => {
    const analyzeRoute = async () => {
      const path = location.pathname;
      
      const adminPatterns = [
        /^\/admin/,
        /^\/[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/,
        /^\/dashboard/,
        /^\/login/
      ];
      
      const looksLikeAdmin = adminPatterns.some(pattern => pattern.test(path));
      setIsAdminRoute(looksLikeAdmin);
      
      if (looksLikeAdmin) {
        try {
          const currentRoutes = routeEncoder.getStoredAdminRoutes();
          setSuggestedRoute(currentRoutes.adminlogin || '/adminlogin');
        } catch (error) {
          setSuggestedRoute('/adminlogin');
        }
      }
    };

    analyzeRoute();
  }, [location.pathname]);
  
  return (
    <div className={`not-found-page ${isAdminRoute ? 'admin-404' : 'public-404'}`}>
      <div className="container">
        <div className="not-found-content">
          <div className="not-found-animation">
            <div className="error-code shimmer-text">404</div>
            <div className="error-icon">🚀</div>
          </div>
          
          <h1 className="not-found-title">
            {isAdminRoute ? 'Secure Route Not Found' : 'Page Not Found'}
          </h1>
          
          <p className="not-found-description">
            {isAdminRoute 
              ? 'The admin route you\'re trying to access is invalid or has expired. Admin routes use dynamic encryption for security.'
              : 'The page you\'re looking for doesn\'t exist or has been moved.'
            }
          </p>
          
          <div className="not-found-actions">
            {isAdminRoute ? (
              <>
                <a href={suggestedRoute} className="neon-button primary">
                  🔐 Secure Admin Access
                </a>
                <a href="/" className="neon-button secondary">
                  🏠 Public Portfolio
                </a>
              </>
            ) : (
              <>
                <a href="/" className="neon-button primary">
                  Return Home
                </a>
                <a href="/projects" className="neon-button secondary">
                  View Projects
                </a>
              </>
            )}
          </div>
          
          {isAdminRoute && (
            <div className="security-notice">
              <div className="notice-icon">🔒</div>
              <div className="notice-content">
                <h3>Security Notice</h3>
                <p>Admin routes use dynamic encryption and change periodically for security.</p>
              </div>
            </div>
          )}
          
          <div className="helpful-links">
            <p className="helpful-title">Quick Navigation:</p>
            <div className="link-grid">
              {isAdminRoute ? (
                <>
                  <a href="/" className="helpful-link">Public Portfolio</a>
                  <a href="/projects" className="helpful-link">Projects</a>
                </>
              ) : (
                <>
                  <a href="/projects" className="helpful-link">Projects</a>
                  <a href="/work-experience" className="helpful-link">Experience</a>
                  <a href="/skills" className="helpful-link">Skills</a>
                  <a href="/#contact" className="helpful-link">Contact</a>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ====================================================
// SCROLL TO TOP COMPONENT
// ====================================================

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pathname]);

  return null;
};

// ====================================================
// MAIN APP ROUTER
// ====================================================

const AppRouter = () => {
  const location = useLocation();
  const [encryptedRoutes, setEncryptedRoutes] = useState({});
  const [routesLoaded, setRoutesLoaded] = useState(false);
  
  // Load encrypted routes on mount
  useEffect(() => {
    const loadRoutes = async () => {
      try {
        const routes = routeEncoder.getStoredAdminRoutes();
        setEncryptedRoutes(routes);
      } catch (error) {
        console.error('Failed to load encrypted routes:', error);
        setEncryptedRoutes({});
      } finally {
        setRoutesLoaded(true);
      }
    };

    loadRoutes();
  }, []);
  
  // Check if current route is admin-related
  const isAdminRoute = location.pathname.startsWith('/admin') || 
                      routeEncoder.isValidAdminRoute(location.pathname) ||
                      Object.values(encryptedRoutes).includes(location.pathname);
  
  // Show loading until routes are loaded
  if (!routesLoaded) {
    return (
      <div className="app-loading">
        <div className="loading-spinner-container">
          <div className="loading-spinner">
            <div className="spinner-ring">
              <div className="spinner-ring-inner"></div>
            </div>
          </div>
          <p>Loading secure routes...</p>
        </div>
      </div>
    );
  }
  
  return (
    <EncryptedRouteErrorBoundary>
      <div className="app-layout">
        <ScrollToTop />
        
        {/* Show Header/Footer only for public routes */}
        {!isAdminRoute && <Header />}
        
        <main className="main-content">
          <Routes>
            {/* ============================================ */}
            {/* PUBLIC PORTFOLIO ROUTES                      */}
            {/* ============================================ */}
            
            <Route path="/" element={<LandingPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/internships" element={<InternshipsPage />} />
            <Route path="/education" element={<EducationPage />} />
            <Route path="/work-experience" element={<WorkExperiencePage />} />
            <Route path="/skills" element={<SkillsPage />} />
            <Route path="/certifications" element={<CertificationsPage />} />
            <Route path="/recommendations" element={<RecommendationsPage />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            <Route path="/leadership" element={<LeadershipPage />} />
            
            {/* ============================================ */}
            {/* LEGACY ADMIN ROUTES (REDIRECT TO ENCRYPTED) */}
            {/* ============================================ */}
            
            <Route 
              path="/adminlogin" 
              element={<LegacyRouteRedirector route="/adminlogin" />} 
            />
            <Route 
              path="/admindashboard" 
              element={<LegacyRouteRedirector route="/admindashboard" />} 
            />
            <Route 
              path="/adminsignout" 
              element={<LegacyRouteRedirector route="/adminsignout" />} 
            />
            
            {/* ============================================ */}
            {/* ENCRYPTED ADMIN ROUTES (DYNAMIC)             */}
            {/* ============================================ */}
            
            {/* Dynamic Encrypted Routes */}
            {encryptedRoutes.adminlogin && (
              <Route 
                path={encryptedRoutes.adminlogin} 
                element={<AdminLogin />} 
              />
            )}
            
            {encryptedRoutes.admindashboard && (
              <Route 
                path={encryptedRoutes.admindashboard} 
                element={<ProtectedAdminWelcome />} 
              />
            )}
            
            {encryptedRoutes.adminsignout && (
              <Route 
                path={encryptedRoutes.adminsignout} 
                element={<AdminSignOut />} 
              />
            )}
            
            {/* Catch-all for potential encrypted routes */}
            <Route 
              path="/:encryptedPath" 
              element={<EncryptedRouteHandler />}
            />
            
            {/* ============================================ */}
            {/* FALLBACK ROUTES                              */}
            {/* ============================================ */}
            
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
        
        {/* Show Footer only for public routes */}
        {!isAdminRoute && <Footer />}
      </div>
    </EncryptedRouteErrorBoundary>
  );
};

export default AppRouter;