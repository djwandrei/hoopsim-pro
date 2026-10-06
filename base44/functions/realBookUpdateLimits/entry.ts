import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { fail, requireGate, isRateLimited } from '../../shared/realBookCore.ts';

// Responsible-gaming limit changes. Standard policy: decreases apply
// immediately; increases take effect after a 24-hour cooling-off period.
const MAX_LIMIT_CENTS = 100000000;
const COOLDOWN_MS = 24 * 3600 * 1000;

export default async function(req) {
  try {
    if (req.method !== 'POST') return fail('POST only.', null, 405);
    const base44 = createClientFromRequest(req);
    const gate = await requireGate(base44);
    if (gate.error) return gate.error;
    if (isRateLimited(`limits:${gate.user.id}`, 10)) return fail('Too many limit changes — try again in a minute.', 'rate_limited', 429);
    const body = await req.json().catch(() => ({}));
    const depositCents = Math.round(Number(body?.depositCents));
    const lossCents = Math.round(Number(body?.lossCents));
    if (!Number.isFinite(depositCents) || depositCents < 0 || depositCents > MAX_LIMIT_CENTS) {
      return fail('Deposit limit must be between $0 and $1,000,000.');
    }
    if (!Number.isFinite(lossCents) || lossCents < 0 || lossCents > MAX_LIMIT_CENTS) {
      return fail('Loss limit must be between $0 and $1,000,000.');
    }
    const profile = gate.profile;
    const currentDeposit = Number(profile.daily_deposit_limit_cents) || 0;
    const currentLoss = Number(profile.daily_loss_limit_cents) || 0;
    const immediateDeposit = Math.min(depositCents, currentDeposit);
    const immediateLoss = Math.min(lossCents, currentLoss);
    const pendingDeposit = Math.max(depositCents, currentDeposit);
    const pendingLoss = Math.max(lossCents, currentLoss);
    const hasPending = pendingDeposit > currentDeposit || pendingLoss > currentLoss;
    const update = {
      daily_deposit_limit_cents: immediateDeposit,
      daily_loss_limit_cents: immediateLoss,
      ...(hasPending
        ? { pending_deposit_limit_cents: pendingDeposit, pending_loss_limit_cents: pendingLoss, limit_change_at: new Date(Date.now() + COOLDOWN_MS).toISOString() }
        : { pending_deposit_limit_cents: null, pending_loss_limit_cents: null, limit_change_at: null }),
    };
    await base44.asServiceRole.entities.RealMoneyProfile.update(profile.id, update);
    return Response.json({ pending: hasPending, effective_at: hasPending ? update.limit_change_at : null });
  } catch (error) {
    return Response.json({ error: error?.message || 'Could not update limits.' }, { status: 500 });
  }
}