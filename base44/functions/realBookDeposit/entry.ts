import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { fail, requireGate, ensureWallet, applyWalletDelta, audit, depositedTodayCents } from '../../shared/realBookCore.ts';

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
      const wallet = await ensureWallet(base44, gate.user.id);
      return Response.json({ wallet, alreadyRecorded: true });
    }
    const amountCents = Number(session.amount_total) || 0;
    if (amountCents <= 0) return fail('Stripe reported no payment amount.', 'stripe_error', 502);
    // The daily deposit limit is re-checked at verification time, so sessions
    // created before the limit was reached can't be cashed in afterwards.
    const limit = Number(gate.profile.daily_deposit_limit_cents) || 0;
    if (limit > 0) {
      const today = await depositedTodayCents(base44);
      if (today + amountCents > limit) {
        audit('denied.daily_deposit_limit', { user: gate.user.id, cents: amountCents });
        return fail(`This deposit would exceed your daily deposit limit: $${(today / 100).toFixed(2)} of $${(limit / 100).toFixed(2)} already deposited today. The payment will be refunded — contact support.`, 'daily_limit', 422);
      }
    }
    const wallet = await ensureWallet(base44, gate.user.id);
    // Idempotency is atomic, not check-then-act: the credit only applies while
    // the lifetime deposit total still matches the read. A concurrent
    // verification of the same session loses this race, re-checks the ledger
    // below, and reports the deposit as already recorded — never double-credit.
    const credit = await applyWalletDelta(base44, wallet, amountCents, {
      inc: { lifetime_deposited_cents: amountCents },
      guard: { lifetime_deposited_cents: Number(wallet.lifetime_deposited_cents) || 0 },
    });
    if (credit.error === 'guard') {
      const replay = await base44.entities.RealTransaction.filter({ ref: sessionId, type: 'deposit' });
      if ((replay.items || []).length > 0) {
        const fresh = await ensureWallet(base44, gate.user.id);
        return Response.json({ wallet: fresh, alreadyRecorded: true });
      }
      return fail('Payment verified, but crediting the wallet hit contention — retry to apply your deposit.', 'wallet_busy', 503);
    }
    if (credit.error) return fail('Payment verified, but crediting the wallet hit contention — retry to apply your deposit.', 'wallet_busy', 503);
    const balance = credit.balance;
    audit('deposit.credited', { user: gate.user.id, cents: amountCents, session: sessionId });
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