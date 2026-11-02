// src/utils/routeEncoder.js
//
// Legacy admin route encryption has been retired. Admin security now depends on
// Supabase Auth sessions plus RLS, not browser-side route secrets.

export const getEncryptedAdminRoutes = () => ({
  adminlogin: '/adminlogin',
  admindashboard: '/admindashboard',
  adminsignout: '/adminsignout'
});

export const getStoredAdminRoutes = getEncryptedAdminRoutes;

export const initializeAdminRoutes = getEncryptedAdminRoutes;

export const isValidAdminRoute = (route) => (
  ['/adminlogin', '/admindashboard', '/adminsignout'].includes(route)
);

export const decryptRoute = (route) => route;

export const encryptRoute = (route) => route;

export const clearAdminRoutes = () => {};

export const generateSessionId = () => '';

export const getCurrentSessionId = () => '';

const routeEncoder = {
  clearAdminRoutes,
  decryptRoute,
  encryptRoute,
  generateSessionId,
  getCurrentSessionId,
  getEncryptedAdminRoutes,
  getStoredAdminRoutes,
  initializeAdminRoutes,
  isValidAdminRoute,
  hasStorageIssues: false
};

export default routeEncoder;
