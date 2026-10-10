import { simulateForgeSeason } from './forgeTeamSim.js';
self.onmessage = event => {
  try { self.postMessage({ result: simulateForgeSeason(event.data) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
