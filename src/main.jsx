import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// ResizeObserver fires its callback after layout, so a resize triggered inside
// the callback completes on the next frame and Chrome/Safari log an
// "undelivered notifications" error. It is a browser-level artifact, not an
// app failure — filter just that message so it never surfaces.
const RESIZE_OBSERVER_LOOP = /^ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;
const filterResizeObserverLoopError = (event) => {
  if (RESIZE_OBSERVER_LOOP.test(event?.message || '')) {
    event.stopImmediatePropagation();
  }
};
window.addEventListener('error', filterResizeObserverLoopError);

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)