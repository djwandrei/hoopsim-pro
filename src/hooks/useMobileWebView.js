import { useEffect, useState } from 'react';

// True when the app runs inside an in-app iOS/Android WebView or a mobile
// browser agent (iPhone/iPad/iPod/Android). iPadOS 13+ reports a desktop
// MacIntel UA, so a touch-point check catches it too.
export function detectMobileWebView() {
  if (typeof navigator === 'undefined') return false;
  const agent = navigator.userAgent || '';
  const isMobileAgent = /iPhone|iPad|iPod|Android|Mobile|Silk/i.test(agent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isMobileAgent) return false;
  const isIosWebView = /AppleWebKit/.test(agent) && !/Version\/.*Safari/.test(agent);
  const isAndroidWebView = /; wv\)|FBAN|FBAV|FB_IAB|Instagram|Line\//i.test(agent)
    || (/Android/.test(agent) && !/Chrome\/|CriOS/.test(agent));
  return isIosWebView || isAndroidWebView || isMobileAgent;
}

// Marks <body class="webview"> so site chrome (footer, safe-area paddings)
// can react in CSS, and returns whether the session is WebView/mobile.
export default function useMobileWebView() {
  const [isWebView] = useState(() => detectMobileWebView());
  useEffect(() => {
    if (isWebView) document.body.classList.add('webview');
  }, [isWebView]);
  return isWebView;
}