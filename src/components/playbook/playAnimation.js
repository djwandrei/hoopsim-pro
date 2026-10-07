import { COURT, clonePositions, settlePositions } from '@/components/playbook/playGeometry';
import { initialPositions, initialBallOwner } from '@/components/playbook/playFormations';
import { offenseTokens } from '@/components/playbook/playClauses';
import { detectPasses } from '@/components/playbook/playPasses';
import { applyActions } from '@/components/playbook/playActions';
import { planRoutes } from '@/components/playbook/playMotion';
export { COURT };

// Compile the dictionary into actor-scoped actions, stable formations and
// routed movement. Read menus stay descriptive instead of choosing a branch.
export function buildFrames(play) {
  let offense = initialPositions(play);
  let ballOwner = initialBallOwner(play);
  let screenContext = [];
  const setup = {
    text: `Setup — ${play.name} lines up: ${play.alignment || 'standard spots'}.`,
    offense: clonePositions(offense), ballOwner, passes: [], exchanges: [],
    screens: [], involved: Object.keys(offense), routes: {}, duration: 1600,
  };
  const frames = play.steps.map(text => {
    const previous = clonePositions(offense);
    const { next, moved, screens, via } = applyActions(text, offense, ballOwner, screenContext);
    offense = settlePositions(next, previous, moved);
    const { passes, owner } = detectPasses(text, ballOwner);
    ballOwner = owner;
    const placedScreens = screens.map(screen => ({ ...screen, point: offense[screen.screener] }));
    if (placedScreens.length) screenContext = [...screenContext.filter(s => !placedScreens.some(p => p.screener === s.screener)), ...placedScreens];
    const routes = planRoutes(previous, offense, via);
    return {
      text, offense: clonePositions(offense), ballOwner,
      passes: passes.map(p => [p.from, p.to]), exchanges: passes,
      screens: placedScreens, involved: [...new Set(offenseTokens(text))], routes,
      duration: 1800 + (moved.size > 2 ? 500 : 0) + (passes.length ? 400 : 0),
    };
  });
  return { setup, frames };
}