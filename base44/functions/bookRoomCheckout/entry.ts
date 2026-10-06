import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { fail, isRateLimited, audit } from '../../shared/realBookCore.ts';
import { CREDIT_PACKS, resolveRedirect } from '../../shared/creditsCheckout.ts';

// SwishIQ Credits purchase (play-money book): creates a Stripe Checkout
// Session from the operator's own Stripe account for a fixed credits pack.
// The pack table is server-side — a caller sends only a pack id — and the
// redirect origin/path are allowlisted, never taken raw from the client.
const FALLBACK_ORIGIN = 'https://spectral-hoop-data-deck.base44.app';

export default async function(req) {
  try {
    if (req.method !== 'POST') return fail('POST only.', null, 405);
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return fail('Sign in to buy credits.', 'unauthorized', 401);
    if (isRateLimited(`credits_checkout:${user.id}`, 8)) return fail('Too many checkout attempts — try again in a minute.', 'rate_limited', 429);
    const body = await req.json().catch(() => ({}));
    const pack = CREDIT_PACKS[body?.packId];
    if (!pack) return fail('Choose a credits pack from the menu.');
    const key = secrets.get('STRIPE_SECRET_KEY');
    if (!key) {
      return fail('Credit purchases are not connected yet: add STRIPE_SECRET_KEY on the dashboard Secrets page.', 'payments_not_configured', 503);
    }
    const { origin, pagePath } = resolveRedirect(body?.origin, req.headers.get('host') || '', body?.pagePath, FALLBACK_ORIGIN, 'book');
    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('success_url', `${origin}${pagePath}?credits_session={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url', `${origin}${pagePath}?credits_purchase=cancelled`);
    params.set('customer_email', user.email);
    params.set('client_reference_id', user.id);
    params.set('metadata[purchase]', 'credits');
    params.set('metadata[credits]', String(pack.credits));
    params.set('line_items[0][quantity]', '1');
    params.set('line_items[0][price_data][currency]', 'usd');
    params.set('line_items[0][price_data][unit_amount]', String(pack.amountCents));
    params.set('line_items[0][price_data][product_data][name]', `SwishIQ Credits — ${pack.label}`);
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      signal: AbortSignal.timeout(15000),
    });
    const session = await response.json().catch(() => ({}));
    if (!response.ok) return fail(session?.error?.message || 'The payment provider refused the checkout.', 'stripe_error', 502);
    audit('credits.checkout_created', { user: user.id, pack: body.packId, cents: pack.amountCents });
    return Response.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    return Response.json({ error: error?.message || 'Could not start the checkout.' }, { status: 500 });
  }
}