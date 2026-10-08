import { useEffect, useState } from 'react';

// True when the app runs inside an in-app iOS/Android WebView or a mobile
// browser agent (iPhone/iPad/iPod/Android). iPadOS 13+ reports a desktop
// MacIntel UA, so a touch-point check catches it too.
export function detectMobileWebView() {
  if (typeof navigator === 'undefined') return false;
  const agent = navigator.userAgent || '';
  const isMobileAgent = /iPhone|iPad|iPod|Android|Mobile|Silk/i.test(agent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isMobileAgent) return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  const isIosWebView = /AppleWebKit/.test(agent) && !/Version\/.*Safari/.test(agent);
  const isAndroidWebView = /; wv\)|FBAN|FBAV|FB_IAB|Instagram|Line\//i.test(agent)
    || (/Android/.test(agent) && !/Chrome\/|CriOS/.test(agent));
  return isIosWebView || isAndroidWebView || isMobileAgent;
}

// Marks <body class="webview"> so site chrome (footer, safe-area paddings)
// can react in CSS, and returns whether the session is WebView/mobile.
export default function useMobileWebView() {
  const [isWebView, setIsWebView] = useState(() => detectMobileWebView());
  useEffect(() => {
    const update = () => setIsWebView(detectMobileWebView());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  useEffect(() => {
    document.body.classList.toggle('webview', isWebView);
  }, [isWebView]);
  return isWebView;
}