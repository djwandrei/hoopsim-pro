import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import useMobileWebView from '@/hooks/useMobileWebView';
import { findStudioTool, WORKBENCHES } from '@/components/studio/workbenches';
import { tabForPath } from '@/components/mobile/mobileTabs';

// In-app back control for iOS back-stack navigation. Rendered by the site
// header on every non-home route, but only inside a WebView/mobile session —
// the regular web experience keeps its own navigation untouched.
export default function WebViewBackButton() {
  const isWebView = useMobileWebView();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const path = pathname.replace(/\/+$/, '') || '/';
  if (!isWebView || path === '/' || path === '/account' || WORKBENCHES.some(tool => tool.path === path)) return null;
  const parent = findStudioTool(path)?.workbench.path || tabForPath(path)?.to || '/';
  const goBack = () => window.history.state?.idx > 0 ? navigate(-1) : navigate(parent, { replace: true });
  // Prominent pill: visible chevron + "Back" label so child views always
  // offer an obvious in-app way back, alongside the iOS edge-swipe gesture.
  return (
    <button type="button" onClick={goBack} aria-label="Go back" title="Go back" className="mobile-back flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-current/30 px-3 py-2 transition-colors">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      <span className="text-[11px] font-semibold uppercase tracking-widest">Back</span>
    </button>
  );
}