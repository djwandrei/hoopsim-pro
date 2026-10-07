// GA4 event-tracking bridge (client side). Sends studio events to the GA4
// property (G-RWR73HSF6J): directly through gtag when the snippet is present,
// otherwise through the ga4Track Measurement Protocol backend function.
import { base44 } from "@/api/base44Client";

const CLIENT_KEY = "swishiq-ga-client-id";
let clientId = null;
try {
  clientId = localStorage.getItem(CLIENT_KEY);
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem(CLIENT_KEY, clientId);
  }
} catch {
  clientId = crypto.randomUUID();
}

// GA4 session id: stable across the tab's 30-minute engagement window.
const SESSION_KEY = "swishiq-ga-session-id";
const SESSION_AT = "swishiq-ga-session-at";
let sessionId = null;
try {
  const last = Number(localStorage.getItem(SESSION_AT) || 0);
  sessionId = Number(localStorage.getItem(SESSION_KEY) || 0);
  if (!sessionId || Date.now() - last > 30 * 60 * 1000) {
    sessionId = Math.floor(Date.now() / 1000);
    localStorage.setItem(SESSION_KEY, String(sessionId));
  }
  localStorage.setItem(SESSION_AT, String(Date.now()));
} catch {
  sessionId = Math.floor(Date.now() / 1000);
}

// Fire-and-forget: analytics must never block or break the UI.
export function trackGa4(eventName, params = {}) {
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", eventName, { session_id: sessionId, ...params });
      return;
    }
    base44.functions
      .invoke("ga4Track", { client_id: clientId, session_id: sessionId, events: [{ name: eventName, params }] })
      .catch(() => {});
  } catch {
    /* analytics is best-effort */
  }
}

export const gaClientId = clientId;