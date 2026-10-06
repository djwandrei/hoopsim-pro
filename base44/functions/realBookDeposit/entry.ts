import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { fail, requireGate, ensureWallet } from '../../shared/realBookCore.ts';

// Verifies a completed Stripe Checkout Session server-side and credits the
// real-money wallet exactly once (idempotent by session id), so the balance
// can never be inflated by replayed or client-claimed payments.
export default async function(req) {
  try {
    if (req.method !== 'POST') return fail('POST only.', null, 405);
    const base44 = createClientFromRequest(req);
    const gate = await requireGate(base44);
    if (gate.error) return gate.error;
    const key = secrets.get('STRIPE_SECRET_KEY');
    if (!key) {
      return fail('Real-money deposits are not connected yet: add STRIPE_SECRET_KEY on the dashboard Secrets page.', 'payments_not_configured', 503);
    }
    const body = await req.json().catch(() => ({}));
    const sessionId = String(body?.sessionId || '');
    if (!sessionId || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) return fail('Invalid checkout session.');
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    const session = await response.json().catch(() => ({}));
    if (!response.ok) return fail(session?.error?.message || 'Could not verify the payment.', 'stripe_error', 502);
    if (session.client_reference_id !== gate.user.id) return fail('This deposit belongs to a different account.', 'forbidden', 403);
    if (session.payment_status !== 'paid') return fail('Payment not completed yet.', 'unpaid', 402);
    const existing = await base44.entities.RealTransaction.filter({ ref: sessionId, type: 'deposit' });
    if ((existing.items || []).length > 0) {
      const wallet = await ensureWallet(base44);
      return Response.json({ wallet, alreadyRecorded: true });
    }
    const amountCents = Number(session.amount_total) || 0;
    if (amountCents <= 0) return fail('Stripe reported no payment amount.', 'stripe_error', 502);
    const wallet = await ensureWallet(base44, gate.user.id);
    const balance = (Number(wallet.balance_cents) || 0) + amountCents;
    await base44.asServiceRole.entities.RealWallet.update(wallet.id, {
      balance_cents: balance,
      lifetime_deposited_cents: (Number(wallet.lifetime_deposited_cents) || 0) + amountCents,
    });
    await base44.asServiceRole.entities.RealTransaction.create({
      created_by_id: gate.user.id,
      type: 'deposit', amount_cents: amountCents, status: 'completed', ref: sessionId,
      label: 'Stripe deposit', balance_after_cents: balance,
    });
    return Response.json({ wallet: { ...wallet, balance_cents: balance, lifetime_deposited_cents: (Number(wallet.lifetime_deposited_cents) || 0) + amountCents } });
  } catch (error) {
    return Response.json({ error: error?.message || 'Could not verify the deposit.' }, { status: 500 });
  }
}