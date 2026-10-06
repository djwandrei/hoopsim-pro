import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { parlayAmerican, teaserPrice, roundRobinCombos, TEASER_POINTS } from '../../shared/realBetsMath.ts';
import { fail, requireGate, ensureWallet, lostTodayCents } from '../../shared/realBookCore.ts';

// Real-money bet placement. The server re-prices every wager from the raw leg
// prices, enforces the gate, correlated-parlay ban, stake bounds, the daily
// loss limit and the balance check, then debits the wallet and writes
// immutable ledger entries. Client-supplied prices are never trusted.
const MIN_STAKE_CENTS = 100;
const MAX_STAKE_CENTS = 50000;
const MAX_LEGS = 8;
const MAX_ABS_PRICE = 10000;
const MAX_RR_COMBOS = 15;

function cleanLegs(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_LEGS) return null;
  const legs = [];
  for (const item of raw) {
    const leg = item || {};
    const price = Number(leg.price);
    const market = leg.market;
    if (!leg.eventKey || typeof leg.eventKey !== 'string' || leg.eventKey.length > 100) return null;
    if (market !== 'moneyline' && market !== 'spread' && market !== 'total') return null;
    if (!Number.isFinite(price) || price === 0 || Math.abs(price) > MAX_ABS_PRICE) return null;
    if ((market === 'spread' || market === 'total') && !Number.isFinite(Number(leg.line))) return null;
    if (market !== 'total' && leg.pickSide !== 'home' && leg.pickSide !== 'away') return null;
    if (market === 'total' && leg.totalPick !== 'over' && leg.totalPick !== 'under') return null;
    if (legs.some(existing => existing.eventKey === leg.eventKey)) return 'duplicate';
    legs.push({
      eventKey: leg.eventKey,
      matchup: String(leg.matchup || '').slice(0, 80),
      commenceTime: String(leg.commenceTime || ''),
      market,
      ...(market === 'total' ? { totalPick: leg.totalPick } : { pickSide: leg.pickSide }),
      ...(Number.isFinite(Number(leg.line)) ? { line: Number(leg.line) } : {}),
      label: String(leg.label || '').slice(0, 80),
      price,
      book: String(leg.book || '').slice(0, 60),
    });
  }
  return legs;
}

export default async function(req) {
  try {
    if (req.method !== 'POST') return fail('POST only.', null, 405);
    const base44 = createClientFromRequest(req);
    const gate = await requireGate(base44);
    if (gate.error) return gate.error;
    const body = await req.json().catch(() => ({}));
    const legs = cleanLegs(body?.legs);
    if (legs === null) return fail('Those legs are not valid prices from the board.');
    if (legs === 'duplicate') return fail('Correlated same-game parlays are not offered — one pick per game.');
    const mode = body?.mode === 'teaser' ? 'teaser' : body?.mode === 'roundrobin' ? 'roundrobin' : 'parlay';
    const stakeCents = Math.round(Number(body?.stakeCents));
    if (!Number.isFinite(stakeCents) || stakeCents < MIN_STAKE_CENTS || stakeCents > MAX_STAKE_CENTS) {
      return fail('Stakes must be between $1 and $500 per combo.');
    }
    const combos = mode === 'roundrobin' ? roundRobinCombos(legs, 2) : [];
    if (mode === 'teaser' && (legs.length < 2 || !legs.every(leg => leg.market === 'spread' || leg.market === 'total'))) {
      return fail('Teasers need at least two spread or total legs.');
    }
    if (mode === 'roundrobin' && (legs.length < 3 || combos.length > MAX_RR_COMBOS)) {
      return fail(`Round robins need at least three legs and are capped at ${MAX_RR_COMBOS} two-leg combos.`);
    }
    const outlay = mode === 'roundrobin' ? stakeCents * combos.length : stakeCents;
    const lossLimit = Number(gate.profile.daily_loss_limit_cents) || 0;
    if (lossLimit > 0) {
      const lostToday = await lostTodayCents(base44);
      if (lostToday + outlay > lossLimit) {
        return fail(`Daily loss limit would be exceeded: $${(lostToday / 100).toFixed(2)} lost today of a $${(lossLimit / 100).toFixed(2)} limit.`, 'daily_loss_limit', 422);
      }
    }
    const wallet = await ensureWallet(base44);
    const balance = Number(wallet.balance_cents) || 0;
    if (outlay > balance) return fail('Not enough real-money balance for this wager — deposit first.', 'insufficient_balance', 402);
    const price = mode === 'teaser' ? teaserPrice(legs.length)
      : mode === 'roundrobin' ? parlayAmerican(combos[0])
      : legs.length > 1 ? parlayAmerican(legs) : legs[0].price;
    if (!Number.isFinite(price)) return fail('Could not price this wager.');
    const matchup = [...new Set(legs.map(leg => leg.matchup))].join(' + ') || legs[0].eventKey;
    const common = {
      event_key: legs[0].eventKey, matchup, commence_time: legs[0].commenceTime,
      status: 'open', settled_profit_cents: null,
    };
    let created = [];
    if (mode === 'roundrobin') {
      const records = combos.map(combo => ({
        ...common, legs: combo, mode: 'roundrobin', round_robin: true,
        teaser: false, teaser_points: null, stake_cents: stakeCents, price_american: parlayAmerican(combo),
      }));
      created = await base44.entities.RealBet.bulkCreate(records);
    } else {
      const record = {
        ...common, legs,
        mode: mode === 'teaser' ? 'teaser' : legs.length > 1 ? 'parlay' : 'single',
        round_robin: false, teaser: mode === 'teaser', teaser_points: mode === 'teaser' ? TEASER_POINTS : null,
        stake_cents: stakeCents, price_american: price,
      };
      created = [await base44.entities.RealBet.create(record)];
    }
    const newBalance = balance - outlay;
    await base44.entities.RealWallet.update(wallet.id, { balance_cents: newBalance });
    await base44.entities.RealTransaction.create({
      type: 'bet', amount_cents: -outlay, status: 'completed',
      label: mode === 'roundrobin' ? `Round robin: ${legs.length} legs × ${combos.length} combos`
        : mode === 'teaser' ? `Teaser: ${matchup}` : `Wager: ${matchup}`,
      balance_after_cents: newBalance,
    });
    return Response.json({ bets: created, balance_cents: newBalance });
  } catch (error) {
    return Response.json({ error: error?.message || 'Could not place the wager.' }, { status: 500 });
  }
}