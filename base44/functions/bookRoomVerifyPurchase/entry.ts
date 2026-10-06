import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { fail, isRateLimited, audit } from '../../shared/realBookCore.ts';

// Verifies a completed SwishIQ Credits purchase server-side and records the
// credit grant exactly once (idempotent by Stripe session id). The credit
// grant returned here is applied to the play-money bankroll in the browser;
// the ledger id in the book store is the session id, so a re-verified
// session can never double-credit a wallet.
export default async function(req) {
  try {
    if (req.method !== 'POST') return fail('POST only.', null, 405);
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return fail('Sign in to verify your credit purchase.', 'unauthorized', 401);
    if (isRateLimited(`credits_verify:${user.id}`, 12)) return fail('Too many verification attempts — try again in a moment.', 'rate_limited', 429);
    const key = secrets.get('STRIPE_SECRET_KEY');
    if (!key) {
      return fail('Credit purchases are not connected yet: add STRIPE_SECRET_KEY on the dashboard Secrets page.', 'payments_not_configured', 503);
    }
    const body = await req.json().catch(() => ({}));
    const sessionId = String(body?.sessionId || '');
    if (!sessionId || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) return fail('Invalid checkout session.');
    // Idempotency first: a session already credited never pays twice. The
    // read is owner-scoped RLS, so a prior grant from another account can
    // never be replayed here.
    const existing = await base44.entities.BookRoomPurchase.filter({ stripe_session_id: sessionId });
    const prior = (existing.items || [])[0];
    if (prior) return Response.json({ credits: Number(prior.credits) || 0, alreadyRecorded: true });
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    const session = await response.json().catch(() => ({}));
    if (!response.ok) return fail(session?.error?.message || 'Could not verify the payment.', 'stripe_error', 502);
    if (session.client_reference_id !== user.id) return fail('This purchase belongs to a different account.', 'forbidden', 403);
    if (session.metadata?.purchase !== 'credits') return fail('This session is not a credits purchase.', 'forbidden', 403);
    if (session.payment_status !== 'paid') return fail('Payment not completed yet.', 'unpaid', 402);
    const credits = Math.floor(Number(session.metadata?.credits));
    const amountCents = Number(session.amount_total) || 0;
    if (!Number.isFinite(credits) || credits <= 0 || credits > 100000) return fail('Stripe reported no credit grant.', 'stripe_error', 502);
    if (amountCents <= 0) return fail('Stripe reported no payment amount.', 'stripe_error', 502);
    // The grant record is admin-write-only under RLS — the create goes
    // through the service role with the owner id stamped explicitly.
    await base44.asServiceRole.entities.BookRoomPurchase.create({
      created_by_id: user.id,
      stripe_session_id: sessionId,
      credits,
      amount_cents: amountCents,
      status: 'completed',
    });
    audit('credits.purchased', { user: user.id, credits, cents: amountCents });
    return Response.json({ credits, alreadyRecorded: false });
  } catch (error) {
    return Response.json({ error: error?.message || 'Could not verify the purchase.' }, { status: 500 });
  }
}