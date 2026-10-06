import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { fail, requireGate, ensureWallet } from '../../shared/realBookCore.ts';

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
    const open = await base44.entities.RealBet.filter({ status: 'open' }, { limit: 100 });
    const items = open.items || [];
    const wallet = await ensureWallet(base44);
    let balance = Number(wallet.balance_cents) || 0;
    let refunded = 0;
    for (const bet of items) {
      refunded += Number(bet.stake_cents) || 0;
      await base44.entities.RealBet.update(bet.id, { status: 'void', settled_profit_cents: 0 });
    }
    if (refunded > 0) balance += refunded;
    await base44.asServiceRole.entities.RealMoneyProfile.update(profile.id, {
      self_excluded: true, self_excluded_at: new Date().toISOString(), self_excluded_until: until,
    });
    if (refunded > 0) {
      await base44.entities.RealWallet.update(wallet.id, { balance_cents: balance });
      await base44.entities.RealTransaction.create({
        type: 'void', amount_cents: refunded, status: 'completed',
        label: `Refund on self-exclusion: ${items.length} open bet${items.length === 1 ? '' : 's'}`,
        balance_after_cents: balance,
      });
    }
    return Response.json({ permanent, self_excluded_until: until, refunded_bets: items.length, refunded_cents: refunded });
  } catch (error) {
    return Response.json({ error: error?.message || 'Could not activate self-exclusion.' }, { status: 500 });
  }
}