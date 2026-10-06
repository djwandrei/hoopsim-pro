import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { fail, requireGate, ensureWallet, applyWalletDelta, audit } from '../../shared/realBookCore.ts';

// Self-exclusion / cool-off, enforced server-side so a client flag can never
// be flipped back. Immediate effect; open wagers are voided with stakes
// refunded. Durations: 1-day and 3-day cool-offs, 7-day and 30-day
// self-exclusions, or permanent exclusion.
const DURATION_MS = { 1: 86400000, 3: 3 * 86400000, 7: 7 * 86400000, 30: 30 * 86400000 };

export default async function(req) {
  try {
    if (req.method !== 'POST') return fail('POST only.', null, 405);
    const base44 = createClientFromRequest(req);
    const gate = await requireGate(base44);
    if (gate.error) return gate.error;
    const profile = gate.profile;
    if (profile.self_excluded) return fail('Self-exclusion is already active.', 'already_excluded', 409);
    const body = await req.json().catch(() => ({}));
    const permanent = body?.days === 'permanent';
    const days = Number(body?.days ?? 7);
    if (!permanent && !DURATION_MS[days]) {
      return fail('Choose a 1, 3, 7 or 30 day cool-off, or permanent self-exclusion.', 'invalid_duration', 400);
    }
    const until = permanent ? null : new Date(Date.now() + DURATION_MS[days]).toISOString();
    // Flip the exclusion flag FIRST: a wager racing this moment then fails the
    // gate instead of being accepted while the account locks itself out.
    await base44.asServiceRole.entities.RealMoneyProfile.update(profile.id, {
      self_excluded: true, self_excluded_at: new Date().toISOString(), self_excluded_until: until,
    });
    const open = await base44.entities.RealBet.filter({ status: 'open' }, { limit: 100 });
    const wallet = await ensureWallet(base44, gate.user.id);
    let refunded = 0;
    let refundedBets = 0;
    for (const bet of (open.items || [])) {
      // Compare-and-set the void: only one exclusion run can void an open bet,
      // so two racing exclusions can never refund the same wager twice.
      const flip = await base44.asServiceRole.entities.RealBet.updateMany(
        { id: bet.id, status: 'open' },
        { $set: { status: 'void', settled_profit_cents: 0 } }
      );
      if (!(Number(flip?.updated) > 0)) continue;
      refundedBets++;
      refunded += Number(bet.stake_cents) || 0;
    }
    if (refunded > 0) {
      const credit = await applyWalletDelta(base44, wallet, refunded);
      if (credit.error) return fail('Self-exclusion is active, but the refund credit hit an error — contact support with your account details.', 'wallet_busy', 503);
      await base44.asServiceRole.entities.RealTransaction.create({
        created_by_id: gate.user.id,
        type: 'void', amount_cents: refunded, status: 'completed',
        label: `Refund on self-exclusion: ${refundedBets} open bet${refundedBets === 1 ? '' : 's'}`,
        balance_after_cents: credit.balance,
      });
    }
    audit('exclusion.activated', { user: gate.user.id, days: permanent ? 'permanent' : days, refunded_bets: refundedBets, refunded_cents: refunded });
    return Response.json({ permanent, self_excluded_until: until, refunded_bets: refundedBets, refunded_cents: refunded });
  } catch (error) {
    return Response.json({ error: error?.message || 'Could not activate self-exclusion.' }, { status: 500 });
  }
}