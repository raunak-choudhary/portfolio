// src/utils/routeNavigation.js
//
// Legacy encrypted-route navigation has been retired. These compatibility
// helpers keep old reference components harmless while active admin routes use
// Supabase Auth and RLS.

const routes = {
  adminlogin: '/adminlogin',
  admindashboard: '/admindashboard',
  adminsignout: '/adminsignout'
};

export const getCurrentAdminRoutes = () => ({
  success: true,
  routes
});

export const initializeAdminSession = getCurrentAdminRoutes;

export const cleanupAdminSession = () => ({
  success: true
});

export const clearNavigationHistory = () => {};

export const storeNavigationHistory = () => {};

export const getNavigationHistory = () => [];

export const validateCurrentRoute = (pathname) => ({
  success: true,
  isValidAdmin: ['/adminlogin', '/admindashboard', '/adminsignout'].includes(pathname),
  needsRedirect: false,
  currentRoute: pathname
});

export const safeAdminNavigate = (navigate, route, options = {}) => {
  navigate(route, options);
  return { success: true };
};

export const navigateToAdminLogin = () => {
  window.location.href = routes.adminlogin;
  return { success: true };
};

export const navigateToAdminDashboard = () => {
  window.location.href = routes.admindashboard;
  return { success: true };
};

export const navigateToAdminSignOut = () => {
  window.location.href = routes.adminsignout;
  return { success: true };
};

const routeNavigation = {
  cleanupAdminSession,
  clearNavigationHistory,
  getCurrentAdminRoutes,
  getNavigationHistory,
  initializeAdminSession,
  navigateToAdminDashboard,
  navigateToAdminLogin,
  navigateToAdminSignOut,
  safeAdminNavigate,
  storeNavigationHistory,
  validateCurrentRoute
};

export default routeNavigation;
