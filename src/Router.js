// src/Router.js - public portfolio router

import React, { Suspense, lazy, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Header from './components/common/Header';
import Footer from './components/common/Footer';
import { AuthProvider, useAuthContext } from './contexts/AuthContext';

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
// Rules the 2025 login stylesheet used to lend every page; kept at the same
// point in the cascade (after the pages) so nothing outside the login changes.
import './styles/legacy-login-shared.css';
// The login screens carry their own sky, font loader and stylesheet; they load as a
// small chunk of their own so the public site's main bundle does not pay for them.
const AdminLogin = lazy(() => import('./components/admin/AdminLogin/AdminLogin'));
const MfaCodeStep = lazy(() => import('./components/admin/AdminLogin/MfaCodeStep'));
// The dashboard and the sign-out film carry the sky renderer, the 3D field and their
// libraries; they load as their own chunk so the public site's bundle does not pay for them.
const loadAdminWelcome = () => import('./components/admin/AdminWelcome/AdminWelcome');
const AdminWelcome = lazy(loadAdminWelcome);
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
export const ProtectedAdminRoute = ({ view = 'voyage' }) => {
  const { assurance, isAuthenticated, isLoading, sessionChecked } = useAuthContext();
  // The address this route was first reached with, read once. <Navigate> runs
  // again whenever this component re-renders, and by the second run the
  // window is already on /adminlogin with the query gone; one stable object
  // keeps the redirect's error (and avoids a second navigation).
  const [returnState] = useState(() => ({ returnUrl: { search: window.location.search, hash: window.location.hash } }));
  // While the code step verifies and plays step 03, it holds the route. A
  // verified code fires an auth event that lifts the session to level 2 at
  // once; without the hold the route would swap to the dashboard mid-launch
  // and Suspense would hide the screen while that chunk loads.
  const [secondFactorHeld, setSecondFactorHeld] = useState(false);
  const holdSecondFactor = (held) => {
    setSecondFactorHeld(held);
    if (held) loadAdminWelcome().catch(() => {}); // warm the dashboard chunk during the hold
  };

  if (isLoading || !sessionChecked || (isAuthenticated && !assurance.checked)) {
    // Dark like the login sky: a Google return waits here for its code
    // exchange, and a white spinner page would flash between two night screens.
    return <AdminChunkFallback />;
  }

  if (!isAuthenticated) {
    // A failed Google return or email link lands here with its error in the
    // query or fragment. Hand the raw address to the login page, which turns
    // it into a fixed sentence; replacing the URL also clears it from the bar.
    return <Navigate to="/adminlogin" replace state={returnState} />;
  }

  if (assurance.needsSecondFactor || secondFactorHeld) {
    return (
      <Suspense fallback={<AdminChunkFallback />}>
        <MfaCodeStep onHoldChange={holdSecondFactor} />
      </Suspense>
    );
  }

  // Enrolling the first authenticator still happens on the classic Security
  // screen, so a session without one is sent there whatever the address.
  const shownView = assurance.needsEnrollment ? 'classic' : view;
  return (
    <Suspense fallback={<AdminChunkFallback />}>
      <AdminWelcome requireSecurityEnrollment={assurance.needsEnrollment} view={shownView} />
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
          <Route path="/adminlogin" element={<Suspense fallback={<AdminChunkFallback />}><AdminLogin /></Suspense>} />
          {/* The voyage (the admin as one sky) is the dashboard. The classic
              screens stay at /classic only until analytics and security move
              into the voyage. */}
          <Route path="/admindashboard" element={<ProtectedAdminRoute view="voyage" />} />
          <Route path="/admindashboard/voyage" element={<Navigate to="/admindashboard" replace />} />
          <Route path="/admindashboard/classic" element={<ProtectedAdminRoute view="classic" />} />
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
