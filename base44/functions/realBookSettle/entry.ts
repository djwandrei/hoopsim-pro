import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { gradeBet, profitCents } from '../../shared/realBetsMath.ts';
import { fail, requireGate, ensureWallet, applyWalletDelta, isRateLimited, audit } from '../../shared/realBookCore.ts';

// Server-side settlement against official finals (via the existing
// swishiqOddsFeed relay, so scores never come from the client). Credits
// winners and pushes to the wallet and writes immutable ledger entries —
// all through the service role; the open-bet read stays user-scoped so a
// user can only ever settle their own wagers.
export default async function(req) {
  try {
    if (req.method !== 'POST') return fail('POST only.', null, 405);
    const base44 = createClientFromRequest(req);
    const gate = await requireGate(base44);
    if (gate.error) return gate.error;
    if (isRateLimited(`settle:${gate.user.id}`, 10)) return fail('Too many settlement checks — try again in a moment.', 'rate_limited', 429);
    const open = await base44.entities.RealBet.filter({ status: 'open' }, { limit: 100 });
    if (!(open.items || []).length) return Response.json({ settled: 0 });
    let finals = [];
    try {
      const feed = await base44.functions.invoke('swishiqOddsFeed', { kind: 'scores' });
      finals = feed.data?.finals || [];
    } catch (error) {
      const code = error?.response?.data?.code;
      if (code === 'odds_feed_not_configured') {
        return fail('Settlement feed not connected: add ODDS_API_KEY on the dashboard Secrets page.', 'odds_feed_not_configured', 503);
      }
      return fail(error?.response?.data?.error || 'Could not fetch official finals.', 'odds_feed_error', 502);
    }
    const finalsFor = key => finals.find(item => item.eventKey === key) || null;
    const wallet = await ensureWallet(base44, gate.user.id);
    let settled = 0;
    let totalReturned = 0;
    for (const bet of open.items) {
      const result = gradeBet(bet, finalsFor);
      if (!result) continue;
      const returned = result.status === 'won' ? bet.stake_cents + profitCents(bet.stake_cents, result.price)
        : result.status === 'push' ? bet.stake_cents : 0;
      // Compare-and-set the status flip: only one settlement run can move a
      // bet out of 'open', so two concurrent runs can never grade and credit
      // the same wager twice.
      const flip = await base44.asServiceRole.entities.RealBet.updateMany(
        { id: bet.id, status: 'open' },
        { $set: { status: result.status, price_american: result.price, settled_profit_cents: returned - bet.stake_cents } }
      );
      if (!(Number(flip?.updated) > 0)) continue;
      if (returned > 0) {
        // Credit immediately, per bet — if the credit fails, roll the bet
        // back to open so the stake is never stranded in a settled-but-unpaid
        // state, and stop the batch.
        const credit = await applyWalletDelta(base44, wallet, returned);
        if (credit.error) {
          await base44.asServiceRole.entities.RealBet.updateMany(
            { id: bet.id, status: result.status },
            { $set: { status: 'open', settled_profit_cents: null } }
          );
          return fail('Settlement hit wallet contention — try again in a moment.', 'wallet_busy', 503);
        }
        totalReturned += returned;
        try {
          await base44.asServiceRole.entities.RealTransaction.create({
            created_by_id: gate.user.id,
            type: result.status === 'push' ? 'void' : 'payout', amount_cents: returned, status: 'completed',
            bet_id: bet.id, label: `${result.status === 'won' ? 'Won' : 'Push'}: ${bet.matchup}`,
            balance_after_cents: credit.balance,
          });
        } catch {
          // The bet is settled and the money credited — a failed ledger line
          // must not surface as an error (a retry settles nothing and can
          // never double-credit; the bet is no longer open).
          audit('settlement.ledger_write_failed', { user: gate.user.id, bet: bet.id, cents: returned });
        }
      }
      settled++;
    }
    if (settled > 0) audit('settlement.batch', { user: gate.user.id, settled, credited_cents: totalReturned });
    return Response.json({ settled });
  } catch (error) {
    return Response.json({ error: error?.message || 'Settlement failed.' }, { status: 500 });
  }
}