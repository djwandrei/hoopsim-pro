import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext(null);

// The studio is public: the platform auth shell is retained for the app
// contract, but there is no login gate and no auth redirects.
export const AuthProvider = ({ children }) => {
  const [value] = useState({
    isAuthenticated: true,
    isLoadingAuth: false,
    isLoadingPublicSettings: false,
    authChecked: true,
    authError: null,
    navigateToLogin: () => {},
    checkUserAuth: async () => true,
    logout: () => {},
  });
  useEffect(() => {
    // Touch the auth service once so the shell contract stays live; the
    // result is ignored because the studio is public.
    base44?.auth?.me?.().catch(() => {});
  }, []);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};