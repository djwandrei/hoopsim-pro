// Route Studio events through the storefront's consent-aware first-party
// analytics bridge when it is already present. Standalone/dev pages without
// that bridge stay quiet; analytics never blocks product behavior.
export function trackGa4(eventName, params = {}) {
  try {
    const trackEvent = globalThis.DJ?.trackEvent;
    if (typeof trackEvent !== 'function' || !eventName) return false;
    return trackEvent(eventName, params) === true;
  } catch {
    return false;
  }
}
