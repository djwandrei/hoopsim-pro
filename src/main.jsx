import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// ResizeObserver fires its callback after layout, so a resize triggered inside
// the callback (chart sizing, the 3D forge scene, resizable panels) completes
// on the next frame and the browser logs an "undelivered notifications" error.
// Two-part fix: debounce every observer callback to one run per animation
// frame so the loop error is never generated, and filter the message in case
// anything else still trips it.
const RESIZE_OBSERVER_LOOP = /^ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;
const filterResizeObserverLoopError = (event) => {
  if (RESIZE_OBSERVER_LOOP.test(event?.message || '')) {
    event.stopImmediatePropagation();
  }
};
window.addEventListener('error', filterResizeObserverLoopError);

const OriginalResizeObserver = window.ResizeObserver;
if (OriginalResizeObserver) {
  window.ResizeObserver = class extends OriginalResizeObserver {
    constructor(callback) {
      let frame = 0;
      super((...args) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          frame = 0;
          callback(...args);
        });
      });
    }
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)