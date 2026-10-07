// The site's reviewed canonical V4 release (v4-site-12ad90dc8710) retired the
// V3 public source: the cutover gate inside swishiq-static-projection.js now
// fails every V3 read with code 'v4-required'. The V4 release publishes
// descriptive inputs only — model execution stays separately gated on the
// site — so game and season simulation pause studio-wide until the next V4
// approval publishes. The studio mirrors that policy instead of erroring.
export const V4_POLICY_NOTICE = 'Simulation is paused under the reviewed V4 release: the site publishes V4 descriptive inputs, but model execution stays separately gated until the next V4 approval publishes.';

export function isV4RequiredError(error) {
  if (error?.code === 'v4-required') return true;
  return /canonical V4 source|V4 release pin/i.test(String(error?.message || ''));
}