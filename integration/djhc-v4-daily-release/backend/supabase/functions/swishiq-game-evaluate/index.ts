import { createClient } from 'jsr:@supabase/supabase-js@2.105.1';
import type {
  SwishIqEdgeDatabase,
  TakePublicSubmissionSlotArgs,
} from '../_shared/swishiq-edge-rpc-types.ts';
import { createSwishIqGameEvaluateHandler } from '../_shared/swishiq-game-evaluate.mjs';
import { CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN as v4ReleasePin } from '../../../tools/swishiq-studio/engine/canonical-v4-studio-runtime-release-pin.js';

const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
let admin: ReturnType<typeof createClient<SwishIqEdgeDatabase>> | null = null;
try {
  if (/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl) && serviceRoleKey) {
    admin = createClient<SwishIqEdgeDatabase>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  }
} catch {
  admin = null;
}

const rpc = async (name: 'take_public_submission_slot', args: TakePublicSubmissionSlotArgs) => {
  if (!admin) return { error: { code: 'CONFIGURATION_UNAVAILABLE' } };
  return await admin.rpc(name, args);
};

Deno.serve(createSwishIqGameEvaluateHandler({
  rpc,
  siteUrl: Deno.env.get('SITE_URL') || '',
  v4ReleasePin,
}));
