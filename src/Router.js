// src/Router.js - public portfolio router

import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Header from './components/common/Header';
import Footer from './components/common/Footer';
import LoadingSpinner from './components/common/LoadingSpinner';
import { AuthProvider, useAuthContext } from './contexts/AuthContext';
import { readAuthErrorFromUrl } from './services/authService';

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
import AdminLogin from './components/admin/AdminLogin/AdminLogin';
import MfaCodeStep from './components/admin/AdminLogin/MfaCodeStep';
// The dashboard and the sign-out film carry the sky renderer, the 3D field and their
// libraries; they load as their own chunk so the public site's bundle does not pay for them.
const AdminWelcome = lazy(() => import('./components/admin/AdminWelcome/AdminWelcome'));
const AdminSignOut = lazy(() => import('./components/admin/AdminSignOut/AdminSignOut'));

/** Shown while an admin chunk loads; black like the admin screens so there is no white flash. */
const AdminChunkFallback = () => <div style={{ minHeight: '100vh', background: '#04070f' }} aria-busy="true" />;

/** Admin pages are full-screen experiences: no site header or footer, as in the 2025 build. */
const isAdminPath = (pathname) => /^\/admin(login|dashboard|signout)(\/|$)/.test(pathname);

/**
 * Gate for the dashboard. In order: wait for the session and factor state;
 * no session goes to the login page; a session that has not passed the
 * authenticator code sees only the code step; everything else enters through
 * the welcome animation. With no authenticator enrolled yet, the dashboard
 * opens on the Security screen alone until the first one is confirmed.
 */
const ProtectedAdminRoute = () => {
  const { assurance, isAuthenticated, isLoading, sessionChecked } = useAuthContext();

  if (isLoading || !sessionChecked || (isAuthenticated && !assurance.checked)) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    // A failed magic link lands here with its error in the URL fragment;
    // carry it to the login page so the visitor learns why.
    return <Navigate to="/adminlogin" replace state={{ authError: readAuthErrorFromUrl(window.location.hash) }} />;
  }

  if (assurance.needsSecondFactor) {
    return <MfaCodeStep />;
  }

  return (
    <Suspense fallback={<AdminChunkFallback />}>
      <AdminWelcome requireSecurityEnrollment={assurance.needsEnrollment} />
    </Suspense>
  );
};

const NotFound = () => (
  <div
    style={{
      padding: '2rem',
      color: '#fff',
      background: '#000',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}
  >
    <h1>404 - Page Not Found</h1>
    <p>The page you're looking for doesn't exist.</p>
    <a href="/home" style={{ color: '#00ff88', marginTop: '1rem' }}>
      Return Home
    </a>
  </div>
);

const AppShell = () => {
  const { pathname } = useLocation();
  const adminPage = isAdminPath(pathname);

  return (
    <div className="app-layout">
      {!adminPage && <Header />}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<LandingPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/internships" element={<InternshipsPage />} />
          <Route path="/education" element={<EducationPage />} />
          <Route path="/work-experience" element={<WorkExperiencePage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/certifications" element={<CertificationsPage />} />
          <Route path="/recommendations" element={<RecommendationsPage />} />
          <Route path="/achievements" element={<AchievementsPage />} />
          <Route path="/leadership" element={<LeadershipPage />} />
          <Route path="/adminlogin" element={<AdminLogin />} />
          <Route path="/admindashboard" element={<ProtectedAdminRoute />} />
          <Route path="/adminsignout" element={<Suspense fallback={<AdminChunkFallback />}><AdminSignOut /></Suspense>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {!adminPage && <Footer />}
    </div>
  );
};

const AppRouter = () => (
  <AuthProvider>
    <AppShell />
  </AuthProvider>
);

export default AppRouter;
