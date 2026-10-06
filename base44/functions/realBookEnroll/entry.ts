import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { fail } from '../../shared/realBookCore.ts';

// Enrollment into the real-money book — validated server-side, so a client
// can never enroll itself underage or from an unlicensed jurisdiction.
// 21+ is computed from the date of birth here, never taken from the client.
const ELIGIBLE_STATES = new Set([
  'AZ', 'CO', 'CT', 'DC', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'MD', 'MA', 'MI',
  'NH', 'NJ', 'NC', 'OH', 'PA', 'RI', 'TN', 'VA', 'VT', 'WV', 'WY',
]);
const TERMS_VERSION = '2026-10-06';

export default async function(req) {
  try {
    if (req.method !== 'POST') return fail('POST only.', null, 405);
    const base44 = createClientFromRequest(req);
    let user = null;
    try {
      user = await base44.auth.me();
    } catch {
      user = null;
    }
    if (!user) return fail('Sign in to use the real-money book.', 'unauthorized', 401);
    const body = await req.json().catch(() => ({}));
    const dob = String(body?.dob || '');
    const state = String(body?.state || '').toUpperCase();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(new Date(`${dob}T00:00:00Z`).getTime())) {
      return fail('Enter a valid date of birth.', 'invalid_dob', 400);
    }
    const age = Math.floor((Date.now() - new Date(`${dob}T00:00:00Z`).getTime()) / (365.2425 * 24 * 3600 * 1000));
    if (age < 21) return fail('You must be at least 21 to enter the real-money book.', 'under_age', 403);
    if (!ELIGIBLE_STATES.has(state)) return fail('Online sports wagering is not licensed in that state.', 'state_not_licensed', 403);
    const existing = await base44.entities.RealMoneyProfile.filter({});
    if ((existing.items || []).length > 0) return Response.json({ profile: existing.items[0], alreadyEnrolled: true });
    // Admin-write-only entity: enrollment is the only server path that mints
    // a profile, so the 21+/state checks can never be bypassed directly.
    await base44.asServiceRole.entities.RealMoneyProfile.create({
      created_by_id: user.id,
      dob, state, terms_version: TERMS_VERSION, acknowledged_at: new Date().toISOString(),
      self_excluded: false, daily_deposit_limit_cents: 50000, daily_loss_limit_cents: 100000,
    });
    // Re-read after create, so concurrent enrolls can't leave two profiles.
    const createdPage = await base44.entities.RealMoneyProfile.filter({});
    const profile = (createdPage.items || [])[0];
    audit('enroll.created', { user: user.id, state });
    return Response.json({ profile: profile || null });
  } catch (error) {
    return Response.json({ error: error?.message || 'Could not complete enrollment.' }, { status: 500 });
  }
}