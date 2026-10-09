import { createContext, useContext } from 'react';
import { siteUrl } from '@/lib/deployConfig';

export const DJHC_ACCOUNT_URL = siteUrl('/account.html');

const AuthContext = createContext(null);

const openSiteAccount = () => {
  if (typeof window !== 'undefined') window.location.assign(DJHC_ACCOUNT_URL);
};

// Studio routes are public. Identity and customer actions belong to the
// existing DJHC storefront account page, so this context always stays guest.
const guestContext = Object.freeze({
  user: null,
  isAuthenticated: false,
  isLoadingAuth: false,
  isLoadingPublicSettings: false,
  authChecked: true,
  authError: null,
  navigateToLogin: openSiteAccount,
  manageAccount: openSiteAccount,
  checkUserAuth: async () => false,
  logout: openSiteAccount,
});

export function AuthProvider({ children }) {
  return <AuthContext.Provider value={guestContext}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
