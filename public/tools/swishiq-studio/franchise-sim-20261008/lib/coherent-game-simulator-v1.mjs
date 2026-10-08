import { simulateGame } from './game-simulator-v2.mjs';
import { simulateCoherentGameBox } from './coherent-box-score-v1.mjs';

/** Score-distribution simulator plus the standalone shot-coherent box candidate. */
export function simulateCoherentGame(model, input, options = {}) {
  const base = simulateGame(model, input, options);
  const home = input.home ?? {};
  const away = input.away ?? {};
  const seed = (Number(options.seed) >>> 0) || 1;
  const simulations = base.simulations.map((sample, index) => {
    const box = simulateCoherentGameBox({
      homeTeam: { ...home, teamCode: home.teamCode ?? input.homeTeamCode },
      awayTeam: { ...away, teamCode: away.teamCode ?? input.awayTeamCode },
      homeScore: sample.homeScore,
      awayScore: sample.awayScore,
      seed: (seed + Math.imul(index + 1, 104729)) >>> 0,
    });
    return {
      ...sample,
      homeScore: box.homeScore,
      awayScore: box.awayScore,
      margin: box.homeScore - box.awayScore,
      total: box.homeScore + box.awayScore,
      homeBox: box.homeBox,
      awayBox: box.awayBox,
      homeTeamStats: box.homeTeamStats,
      awayTeamStats: box.awayTeamStats,
      coherentBoxStatus: box.status,
      coherentBoxChecks: box.checks,
    };
  });
  return {
    ...base,
    simulations,
    simulatedHomeWinRate: simulations.reduce((sum, row) => sum + (row.margin > 0 ? 1 : row.margin === 0 ? 0.5 : 0), 0) / simulations.length,
    boxScoreModel: {
      modelId: 'djhc-coherent-box-score-v1',
      status: 'experimental-internal-consistency-only',
      selectedForProduction: false,
      gameOutcomeModel: model.modelId,
      disclosure: 'This experimental wrapper retains the base model score draws, then creates a shot-consistent player box. It has not been calibrated against observed joint player box distributions or play-by-play.',
    },
  };
}
