import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import useMobileWebView from '@/hooks/useMobileWebView';

// In-app back control for iOS back-stack navigation. Rendered by the site
// header on every non-home route, but only inside a WebView/mobile session —
// the regular web experience keeps its own navigation untouched.
export default function WebViewBackButton() {
  const isWebView = useMobileWebView();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (!isWebView || pathname === '/' || typeof window === 'undefined' || window.history.length < 2) return null;
  return (
    <button type="button" onClick={() => navigate(-1)} aria-label="Go back" title="Go back" className="home-header-utility__icon" style={{ display: 'grid', placeItems: 'center' }}>
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}