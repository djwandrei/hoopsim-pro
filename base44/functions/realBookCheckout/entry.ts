import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { fail, requireGate, depositedTodayCents, isRateLimited, audit } from '../../shared/realBookCore.ts';

// Real-money deposit: creates a Stripe Checkout Session (mode: payment) from
// the operator's own Stripe account. Enforces the eligibility gate, deposit
// bounds and the daily deposit limit before Stripe is ever called.
const MIN_DEPOSIT_CENTS = 1000;
const MAX_DEPOSIT_CENTS = 200000;
const FALLBACK_ORIGIN = 'https://spectral-hoop-data-deck.base44.app';

export default async function(req) {
  try {
    if (req.method !== 'POST') return fail('POST only.', null, 405);
    const base44 = createClientFromRequest(req);
    const gate = await requireGate(base44);
    if (gate.error) return gate.error;
    if (isRateLimited(`checkout:${gate.user.id}`, 10)) return fail('Too many deposit attempts — try again in a minute.', 'rate_limited', 429);
    const body = await req.json().catch(() => ({}));
    const amountCents = Math.round(Number(body?.amountCents));
    if (!Number.isFinite(amountCents) || amountCents < MIN_DEPOSIT_CENTS || amountCents > MAX_DEPOSIT_CENTS) {
      return fail('Deposits must be between $10 and $2,000.');
    }
    const key = secrets.get('STRIPE_SECRET_KEY');
    if (!key) {
      return fail('Real-money deposits are not connected yet: add STRIPE_SECRET_KEY on the dashboard Secrets page.', 'payments_not_configured', 503);
    }
    const limit = Number(gate.profile.daily_deposit_limit_cents) || 0;
    if (limit > 0) {
      const today = await depositedTodayCents(base44);
      if (today + amountCents > limit) {
        return fail(`Daily deposit limit reached: $${(today / 100).toFixed(2)} of $${(limit / 100).toFixed(2)} deposited today.`, 'daily_limit', 422);
      }
    }
    // The success/cancel redirect origin is allowlisted, never taken raw from
    // the client: it must match the serving host, a base44 host, localhost
    // (preview) — otherwise the operator's fallback origin is used.
    const rawOrigin = typeof body?.origin === 'string' ? body.origin : '';
    let origin = FALLBACK_ORIGIN;
    try {
      const parsed = new URL(rawOrigin);
      const host = req.headers.get('host') || '';
      if (parsed.protocol === 'https:' && (
        parsed.host === host ||
        parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' ||
        parsed.hostname.endsWith('.base44.app') || parsed.hostname.endsWith('.base44.dev')
      )) origin = parsed.origin;
    } catch { /* keep fallback origin */ }
    // The page path comes from the client (the app can serve the book under a
    // base path on site/custom-domain deploys, where a bare /real-book would
    // land on a 404 and the deposit would never verify). It is strictly
    // validated — root-relative, ending in /real-book, no traversal — and the
    // origin itself is allowlisted above, so the redirect can never escape.
    const rawPath = typeof body?.pagePath === 'string' ? body.pagePath : '/real-book';
    const cleanPath = rawPath.replace(/[?#].*$/, '');
    const pagePath = /^\/(?:[A-Za-z0-9._-]+\/)*real-book$/.test(cleanPath) && !cleanPath.includes('..')
      ? cleanPath : '/real-book';
    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('success_url', `${origin}${pagePath}?deposit_session={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url', `${origin}${pagePath}?deposit=cancelled`);
    params.set('customer_email', gate.user.email);
    params.set('client_reference_id', gate.user.id);
    params.set('metadata[app_user]', gate.user.id);
    params.set('line_items[0][quantity]', '1');
    params.set('line_items[0][price_data][currency]', 'usd');
    params.set('line_items[0][price_data][unit_amount]', String(amountCents));
    params.set('line_items[0][price_data][product_data][name]', 'SwishIQ Real-Money Sportsbook Deposit');
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      signal: AbortSignal.timeout(15000),
    });
    const session = await response.json().catch(() => ({}));
    if (!response.ok) return fail(session?.error?.message || 'Stripe refused the deposit.', 'stripe_error', 502);
    return Response.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    return Response.json({ error: error?.message || 'Could not start the deposit.' }, { status: 500 });
  }
}