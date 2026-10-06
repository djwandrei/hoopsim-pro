// Shared server helpers for the real-money book functions: error shaping,
// eligibility-gate enforcement, wallet access and daily RG-limit aggregates.
// Every real-book function runs these before touching money.
// Money-bearing entities (wallet, bets, transactions) are admin-write-only
// under RLS, so all mutations here go through the service role after the
// user is authenticated and gated — the user token can read, never write.
import { startOfTodayUtc } from './realBetsTime.ts';

export function fail(message, code, status = 400) {
  return Response.json({ error: message, ...(code ? { code } : {}) }, { status });
}

// Pending limit increases (24h cooling-off) self-apply when their effective
// time passes; the gate resolves them lazily on the next read.
async function resolvePendingLimits(base44, profile) {
  if (profile.pending_deposit_limit_cents == null && profile.pending_loss_limit_cents == null) return profile;
  const changeAt = Date.parse(profile.limit_change_at || '');
  if (!Number.isFinite(changeAt) || changeAt > Date.now()) return profile;
  const applied = {
    daily_deposit_limit_cents: Number(profile.pending_deposit_limit_cents ?? profile.daily_deposit_limit_cents) || 0,
    daily_loss_limit_cents: Number(profile.pending_loss_limit_cents ?? profile.daily_loss_limit_cents) || 0,
    pending_deposit_limit_cents: null,
    pending_loss_limit_cents: null,
    limit_change_at: null,
  };
  try {
    await base44.asServiceRole.entities.RealMoneyProfile.update(profile.id, applied);
  } catch {
    /* resolves again on the next read */
  }
  return { ...profile, ...applied };
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
  const resolved = await resolvePendingLimits(base44, profile);
  return { user, profile: resolved };
}

// Wallet reads run user-scoped (owner RLS); the create is service-role with
// the owner id stamped explicitly, since the wallet is admin-write-only.
export async function ensureWallet(base44, userId) {
  const page = await base44.entities.RealWallet.filter({});
  const wallet = (page.items || [])[0];
  if (wallet) return wallet;
  return base44.asServiceRole.entities.RealWallet.create({
    created_by_id: userId,
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