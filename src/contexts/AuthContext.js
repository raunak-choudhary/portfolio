// src/contexts/AuthContext.js - Supabase Auth admin context

import React, { createContext, useContext } from 'react';
import { useAuth } from '../hooks/useAuth';

const AuthContext = createContext(null);

export const useAuthContext = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }

  return context;
};

export const AuthProvider = ({ children }) => {
  const auth = useAuth();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
};

export const withAuth = (Component) => {
  return function AuthenticatedComponent(props) {
    const auth = useAuthContext();

    if (auth.isLoading || !auth.sessionChecked) {
      return null;
    }

    if (!auth.isAuthenticated) {
      if (typeof window !== 'undefined') {
        window.location.href = '/adminlogin';
      }
      return null;
    }

    return <Component {...props} />;
  };
};

export const AdminOnly = ({ children, fallback = null }) => {
  const auth = useAuthContext();

  if (auth.isLoading || !auth.sessionChecked) {
    return fallback;
  }

  return auth.isAuthenticated ? children : fallback;
};

export const AuthenticatedOnly = AdminOnly;

export const UnauthenticatedOnly = ({ children, fallback = null }) => {
  const auth = useAuthContext();

  if (auth.isLoading || !auth.sessionChecked) {
    return fallback;
  }

  return !auth.isAuthenticated ? children : fallback;
};

export default AuthContext;
