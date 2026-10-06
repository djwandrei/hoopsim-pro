import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { fail, requireGate, ensureWallet } from '../../shared/realBookCore.ts';

// Withdrawal request: moves funds from the available balance into a pending
// payout queue with an immutable ledger entry. Standard policy: one pending
// payout at a time, and funds in open wagers can't be withdrawn until the
// bets settle. The operator processes payouts out of band.
const MIN_WITHDRAWAL_CENTS = 2000;

export default async function(req) {
  try {
    if (req.method !== 'POST') return fail('POST only.', null, 405);
    const base44 = createClientFromRequest(req);
    const gate = await requireGate(base44);
    if (gate.error) return gate.error;
    const body = await req.json().catch(() => ({}));
    const amountCents = Math.round(Number(body?.amountCents));
    if (!Number.isFinite(amountCents) || amountCents < MIN_WITHDRAWAL_CENTS) return fail('Withdrawals start at $20.');
    const wallet = await ensureWallet(base44, gate.user.id);
    const balance = Number(wallet.balance_cents) || 0;
    if (Number(wallet.pending_withdrawal_cents) > 0) {
      return fail('A withdrawal is already pending review — one request at a time.', 'withdrawal_pending', 409);
    }
    const open = await base44.entities.RealBet.filter({ status: 'open' }, { limit: 1 });
    if ((open.items || []).length > 0) {
      return fail('You have open wagers — unsettled funds can\'t be withdrawn until your bets settle.', 'open_bets', 409);
    }
    if (amountCents > balance) return fail('Withdrawal exceeds your available balance.', 'insufficient_balance', 402);
    const pending = (Number(wallet.pending_withdrawal_cents) || 0) + amountCents;
    const newBalance = balance - amountCents;
    await base44.asServiceRole.entities.RealWallet.update(wallet.id, { balance_cents: newBalance, pending_withdrawal_cents: pending });
    await base44.asServiceRole.entities.RealTransaction.create({
      created_by_id: gate.user.id,
      type: 'withdrawal', amount_cents: amountCents, status: 'requested',
      label: 'Withdrawal request — payout pending', balance_after_cents: newBalance,
    });
    return Response.json({ wallet: { ...wallet, balance_cents: newBalance, pending_withdrawal_cents: pending } });
  } catch (error) {
    return Response.json({ error: error?.message || 'Could not request the withdrawal.' }, { status: 500 });
  }
}