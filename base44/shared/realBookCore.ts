// Shared server helpers for the real-money book functions: error shaping,
// eligibility-gate enforcement, wallet access and daily RG-limit aggregates.
// Every real-book function runs these before touching money.
import { startOfTodayUtc } from './realBetsTime.ts';

export function fail(message, code, status = 400) {
  return Response.json({ error: message, ...(code ? { code } : {}) }, { status });
}

export async function requireGate(base44) {
  let user = null;
  try {
    user = await base44.auth.me();
  } catch {
    user = null;
  }
  if (!user) return { error: fail('Sign in to use the real-money book.', 'unauthorized', 401) };
  const profiles = await base44.entities.RealMoneyProfile.filter({});
  const profile = (profiles.items || [])[0] || null;
  if (!profile) return { error: fail('Complete the eligibility gate first.', 'gate_required', 403) };
  if (profile.self_excluded) return { error: fail('Your account is self-excluded from real-money wagering.', 'self_excluded', 403) };
  return { user, profile };
}

export async function ensureWallet(base44) {
  const page = await base44.entities.RealWallet.filter({});
  const wallet = (page.items || [])[0];
  if (wallet) return wallet;
  return base44.entities.RealWallet.create({
    balance_cents: 0, pending_withdrawal_cents: 0, lifetime_deposited_cents: 0, lifetime_withdrawn_cents: 0,
  });
}

export async function depositedTodayCents(base44) {
  const rows = await base44.entities.RealTransaction.aggregate({
    query: { type: 'deposit', status: 'completed', created_date: { $gte: startOfTodayUtc() } },
    sum: 'amount_cents',
  });
  return rows.rows?.[0]?.sum_amount_cents || 0;
}

export async function lostTodayCents(base44) {
  const rows = await base44.entities.RealBet.aggregate({
    query: { status: 'lost', updated_date: { $gte: startOfTodayUtc() } },
    sum: 'settled_profit_cents',
  });
  return -(rows.rows?.[0]?.sum_settled_profit_cents || 0);
}