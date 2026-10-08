// Studio Candidate100 pipeline: the site's owner-manual release (verified
// release bundle + per-season pregame feature snapshot) drives the vendored
// model runtime. The relay pins every byte exactly like the site adapter;
// the client then proves the release matches the vendored module before any
// prediction runs.
import { base44 } from '@/api/base44Client';
import { GAME_MODEL_MODULE, predictGameLabGames } from './gameSimEngine';
import { gameSimModule } from './gameSimSource';

let modulePromise = null;
function modelModule() {
  if (!modulePromise) {
    modulePromise = gameSimModule(GAME_MODEL_MODULE);
    modulePromise.catch(() => { modulePromise = null; });
  }
  return modulePromise;
}

const releases = new Map();
export function candidate100Season(seasonStartYear) {
  const key = Number(seasonStartYear);
  if (!releases.has(key)) {
    const task = (async () => {
      const { data } = await base44.functions.invoke('swishiqCandidate100Source', { seasonStartYear: key });
      const module = await modelModule();
      if (data.configurationSha256 !== module.CONFIGURATION_SHA256) {
        throw new Error('The Candidate100 release configuration does not match the vendored model module.');
      }
      const rowByRef = new Map((data.rows || []).map(row => [row.gameRef, row]));
      return { ...data, rowByRef };
    })();
    releases.set(key, task);
    task.catch(() => releases.delete(key));
  }
  return releases.get(key);
}

// One published pregame target through the vendored Candidate100 model. The
// release snapshot's own checkpoint hydrates the runtime (the vendored state
// pins match the release), so the prediction runs the same verified bytes the
// site's release runner executes.
export async function predictCandidate100Target(row, seasonStartYear) {
  if (!row?.features) throw new Error('Choose a verified Candidate100 pregame target.');
  const result = (await predictGameLabGames([{
    inputFeatures: row.features,
    targetGameRef: row.gameRef,
    targetDate: row.gameDateLocal,
    featureObservedThrough: row.featureObservedThrough,
    seasonStartYear: Number(seasonStartYear),
  }], { checkpointName: `checkpoint-${Number(seasonStartYear)}` })).predictions[0];
  return result;
}