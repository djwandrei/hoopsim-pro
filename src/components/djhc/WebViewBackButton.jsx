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
  // Prominent pill: visible chevron + "Back" label so child views always
  // offer an obvious in-app way back, alongside the iOS edge-swipe gesture.
  return (
    <button type="button" onClick={() => navigate(-1)} aria-label="Go back" title="Go back" className="flex shrink-0 items-center gap-1 rounded-full border border-gold/35 bg-gold/10 px-3 py-1.5 text-gold transition-colors hover:bg-gold/20">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      <span className="text-[11px] font-semibold uppercase tracking-widest">Back</span>
    </button>
  );
}