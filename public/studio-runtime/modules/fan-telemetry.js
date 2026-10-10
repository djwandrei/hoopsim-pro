/* Lightweight, first-party milestones for the interactive fan tools.
 *
 * Record only bounded aggregate milestones after explicit analytics consent;
 * never add player names, roster IDs, selections, scores, or model inputs.
 */

import {
  createAggregateTelemetry,
  hasAnalyticsConsent,
} from '../../engine/replay-share-telemetry.js?v=20260927s&rev=replay-share-telemetry-v2-public-share';

const QUEUE_KEY = '__fanTelemetryQueue';
const READY_EVENT = 'dj-analytics-ready';
const MILESTONES = new Set(['game_start', 'first_interaction', 'reveal', 'completion']);

export function flushFanTelemetryQueue() {
  const queue = window.DJ?.[QUEUE_KEY];
  const tracker = window.DJ?.trackEvent;
  if (!Array.isArray(queue) || typeof tracker !== 'function') return;
  if (!hasAnalyticsConsent()) {
    queue.splice(0);
    return;
  }
  const pending = queue.splice(0);
  for (const item of pending) {
    try {
      if (tracker(item.event, item.data) === false) queue.push(item);
    } catch { queue.push(item); }
  }
}

export function createFanMilestones(experience, options = {}) {
  // Keep the legacy export safe for older callers while migrating production
  // surfaces to the explicit consent-bound name below.
  return createConsentBoundFanMilestones(experience, options);
}

/**
 * Consent-bound aggregate milestones. No event is queued before explicit
 * analytics consent, and player identities, selections, scores, and model
 * inputs never enter this channel.
 */
export function createConsentBoundFanMilestones(experience, {
  storage = null,
  tracker = (...args) => typeof window.DJ?.trackEvent === 'function'
    ? window.DJ.trackEvent(...args)
    : false,
} = {}) {
  const safeExperience = String(experience || 'unknown').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 24) || 'unknown';
  const clock = typeof globalThis.performance?.now === 'function'
    ? () => globalThis.performance.now()
    : () => Date.now();
  let consentStorage = storage;
  if (!consentStorage) {
    try { consentStorage = globalThis.localStorage || null; } catch { consentStorage = null; }
  }
  const telemetry = createAggregateTelemetry({
    consent: () => hasAnalyticsConsent(consentStorage),
    tracker,
    storage: consentStorage,
  });
  const sent = new Set();
  let consentStartedAt = telemetry.consentGranted ? clock() : null;
  const onReady = () => telemetry.flush();
  const onConsentChange = event => {
    const granted = event?.detail?.granted === true;
    telemetry.setConsent(granted);
    if (granted) {
      consentStartedAt = clock();
      telemetry.flush();
    } else {
      consentStartedAt = null;
      sent.clear();
      if (Array.isArray(window.DJ?.[QUEUE_KEY])) window.DJ[QUEUE_KEY].splice(0);
    }
  };
  const onPageHide = () => telemetry.flush();
  window.addEventListener(READY_EVENT, onReady);
  window.addEventListener('dj-analytics-consent-change', onConsentChange);
  window.addEventListener('pagehide', onPageHide);
  return {
    mark(milestone) {
      if (!MILESTONES.has(milestone)) return { accepted: false, reason: 'milestone-invalid' };
      const data = { kind: `fan-${safeExperience}`, milestone, duration: 0 };
      if (!telemetry.consentGranted) {
        consentStartedAt = null;
        return telemetry.record('web_vitals', data);
      }
      if (consentStartedAt === null) consentStartedAt = clock();
      data.duration = Math.max(0, Math.round((clock() - consentStartedAt) * 100) / 100);
      if (sent.has(milestone)) return { accepted: false, reason: 'milestone-duplicate' };
      const result = telemetry.record('web_vitals', data);
      if (result.accepted) sent.add(milestone);
      return result;
    },
    flush() { return telemetry.flush(); },
    snapshot() { return telemetry.snapshot(); },
    setConsent(value) {
      telemetry.setConsent(value);
      if (value) {
        consentStartedAt = clock();
        telemetry.flush();
      } else {
        consentStartedAt = null;
        sent.clear();
        if (Array.isArray(window.DJ?.[QUEUE_KEY])) window.DJ[QUEUE_KEY].splice(0);
      }
      return Boolean(value);
    },
    dispose() {
      window.removeEventListener(READY_EVENT, onReady);
      window.removeEventListener('dj-analytics-consent-change', onConsentChange);
      window.removeEventListener('pagehide', onPageHide);
    },
  };
}
