// src/Router.js - public portfolio router

import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/common/Header';
import Footer from './components/common/Footer';
import LoadingSpinner from './components/common/LoadingSpinner';
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
import AdminLogin from './components/admin/AdminLogin/AdminLogin';
import AdminDashboard from './components/admin/AdminDashboard/AdminDashboard';
import AdminSignOut from './components/admin/AdminSignOut/AdminSignOut';

const ProtectedAdminRoute = ({ children }) => {
  const { isAuthenticated, isLoading, sessionChecked } = useAuthContext();

  if (isLoading || !sessionChecked) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/adminlogin" replace />;
  }

  return children;
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

const AppRouter = () => (
  <AuthProvider>
    <div className="app-layout">
      <Header />
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
          <Route
            path="/admindashboard"
            element={(
              <ProtectedAdminRoute>
                <AdminDashboard />
              </ProtectedAdminRoute>
            )}
          />
          <Route path="/adminsignout" element={<AdminSignOut />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  </AuthProvider>
);

export default AppRouter;
