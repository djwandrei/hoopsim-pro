import franchiseScheduleCompatibility from '@/components/season/franchise/franchiseScheduleCompatibility';

// Retain the two original responses while the release loader verifies them.
// This avoids refetches and never rewrites a pinned artifact or bypasses a hash.
export default async function loadFranchiseIntake(api, scheduleApi, options = {}) {
  const evidence = new Map();
  const fetchSource = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const fetchImpl = async (input, init) => {
    const response = await fetchSource(input, init);
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
    const kind = path.endsWith('/parts/team-games.json') ? 'teamGames'
      : path.endsWith('/data/nba-actual-schedules-v1.json') ? 'schedule' : null;
    if (!kind || !response.ok) return response;
    const bytes = await response.arrayBuffer();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const sha256 = [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
    evidence.set(kind, { sha256, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) });
    return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
  const intake = await api.loadV4FranchiseIntakeV1({ ...options, fetchImpl });
  if (intake.status !== 'blocked-schedule-crosswalk') return intake;
  const schedule = evidence.get('schedule'), teamGames = evidence.get('teamGames');
  if (!schedule || !teamGames) throw new Error('Verified schedule comparison evidence is unavailable.');
  if (schedule.sha256 !== api.V4_FRANCHISE_SOURCE_PINS.scheduleArtifact.sha256
    || teamGames.sha256 !== intake.schedule?.source?.teamGamesPart?.sha256) {
    throw new Error('Schedule comparison evidence differs from the verified source receipts.');
  }
  const reconciled = franchiseScheduleCompatibility(intake, scheduleApi, schedule.value, teamGames.value);
  if (reconciled === intake) return intake;
  return api.applyV4FranchiseRosterChoicesV1(reconciled, { rosterChoicesByName: options.rosterChoicesByName ?? {} });
}