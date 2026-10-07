import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackGa4 } from '@/lib/gaBridge';

// SPA page-view tracker: gtag only fires page_view on the initial document
// load, so route changes inside the studio are invisible to GA4 without this.
// The first render is skipped when gtag is present — its config call already
// reported that initial page_view.
let firstRoute = true;

export default function GaPageView() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (firstRoute) {
      firstRoute = false;
      if (typeof window !== 'undefined' && typeof window.gtag === 'function') return;
    }
    trackGa4('page_view', { page_path: pathname, page_title: document.title || undefined });
  }, [pathname]);
  return null;
}