// GA4 event bridge — forwards events to the Measurement Protocol so
// server-side tooling sees the same signals the browser gtag snippet sends.
// Secrets: GA4_MEASUREMENT_ID (web stream id), GA4_API_SECRET (MP secret on
// the SwishIQ Studio 'Base44 Bridge' stream).
import { secrets } from "base44:runtime";

const NAME_RE = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_EVENTS = 25;
const MAX_PARAMS = 10;

function sanitizeEvents(input) {
  if (!Array.isArray(input)) return null;
  const events = input.slice(0, MAX_EVENTS).map((event) => {
    if (!event || typeof event.name !== "string" || !NAME_RE.test(event.name)) return null;
    const params = {};
    if (event.params && typeof event.params === "object") {
      let count = 0;
      for (const [key, value] of Object.entries(event.params)) {
        if (count >= MAX_PARAMS) break;
        if (NAME_RE.test(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
          params[key] = value;
          count += 1;
        }
      }
    }
    return { name: event.name, params };
  });
  const valid = events.filter(Boolean);
  return valid.length ? valid : null;
}

export default async function(req) {
  try {
    const measurementId = secrets.get("GA4_MEASUREMENT_ID");
    const apiSecret = secrets.get("GA4_API_SECRET");
    if (!measurementId || !apiSecret) {
      return Response.json({ error: "GA4 secrets not configured" }, { status: 500 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const events = sanitizeEvents(body && body.events);
    if (!events) {
      return Response.json({ error: "No valid events supplied" }, { status: 400 });
    }

    // Stable per-visitor client id from the browser; fall back to a random one.
    const clientId =
      typeof (body && body.client_id) === "string" && /^[A-Za-z0-9.\-]{8,64}$/.test(body.client_id)
        ? body.client_id
        : crypto.randomUUID();

    const payload = { client_id: clientId, events };
    const sessionId = body && Number(body.session_id);
    if (Number.isFinite(sessionId) && sessionId > 0) {
      payload.events = payload.events.map((event) => ({ ...event, params: { session_id: sessionId, ...event.params } }));
    }

    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    // GA4 answers 204 on success with no body.
    return Response.json({ ok: res.ok, status: res.status, accepted: events.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}