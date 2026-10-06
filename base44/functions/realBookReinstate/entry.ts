import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { fail } from '../../shared/realBookCore.ts';

// Reinstatement request: honored only after the minimum self-exclusion
// period has fully elapsed; the operator may still re-verify eligibility.
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
    if (!user) return fail('Sign in first.', 'unauthorized', 401);
    const profiles = await base44.entities.RealMoneyProfile.filter({});
    const profile = (profiles.items || [])[0];
    if (!profile) return fail('No real-money profile on this account.', 'gate_required', 403);
    if (!profile.self_excluded) return fail('Self-exclusion is not active.', 'not_excluded', 409);
    const until = Date.parse(profile.self_excluded_until || '');
    if (!Number.isFinite(until)) {
      return fail('Permanent self-exclusion can only be reviewed by the operator — contact support.', 'permanent', 403);
    }
    if (until > Date.now()) {
      return fail(`Reinstatement is available after ${new Date(until).toLocaleDateString()}.`, 'cooling_off', 403);
    }
    await base44.asServiceRole.entities.RealMoneyProfile.update(profile.id, { self_excluded: false, self_excluded_until: null });
    return Response.json({ reinstated: true });
  } catch (error) {
    return Response.json({ error: error?.message || 'Could not process reinstatement.' }, { status: 500 });
  }
}