import { COURT, clonePositions, settlePositions } from '@/components/playbook/playGeometry';
import { initialPositions, initialBallOwner } from '@/components/playbook/playFormations';
import { offenseTokens } from '@/components/playbook/playClauses';
import { detectPasses } from '@/components/playbook/playPasses';
import { applyActions } from '@/components/playbook/playActions';
import { planRoutes, routeLength } from '@/components/playbook/playMotion';
import { isDefensivePlay } from '@/components/playbook/defenseGeometry';
import { buildDefenseFrames } from '@/components/playbook/defenseAnimation';
import resolveContextActions from '@/components/playbook/playContextActions';
export { COURT };

// Compile the dictionary into actor-scoped actions, stable formations and
// routed movement. Read menus stay descriptive instead of choosing a branch.
export function buildFrames(play) {
  if (isDefensivePlay(play)) return buildDefenseFrames(play);
  let offense = initialPositions(play);
  let ballOwner = initialBallOwner(play);
  let screenContext = [];
  const context = { lastPasser: null, vacated: null };
  const setup = {
    text: `Setup — ${play.name} lines up: ${play.alignment || 'standard spots'}.`,
    offense: clonePositions(offense), ballOwner, passes: [], exchanges: [],
    screens: [], involved: Object.keys(offense), routes: {}, duration: 1600,
  };
  const frames = play.steps.map(text => {
    const previous = clonePositions(offense);
    const { resolved, overrides } = resolveContextActions(play, text, offense, ballOwner, context);
    const { next, moved, screens, via } = applyActions(resolved, offense, ballOwner, screenContext);
    Object.entries(overrides).forEach(([id, point]) => { next[id] = point; moved.add(id); });
    offense = settlePositions(next, previous, moved);
    const { passes, owner } = detectPasses(resolved, ballOwner);
    if (passes.length) { context.lastPasser = passes[passes.length-1].from; context.vacated = previous[context.lastPasser]; }
    ballOwner = owner;
    const placedScreens = screens.map(screen => ({ ...screen, point: offense[screen.screener] }));
    if (placedScreens.length) screenContext = [...screenContext.filter(s => !placedScreens.some(p => p.screener === s.screener)), ...placedScreens];
    const routes = planRoutes(previous, offense, via);
    return {
      text, offense: clonePositions(offense), ballOwner,
      passes: passes.map(p => [p.from, p.to]), exchanges: passes,
      passFirst: passes.length > 0 && /\b(?:passes?|feeds?)\b.*\b(?:cuts?|clears?|exits?)\b/i.test(resolved),
      screens: placedScreens, involved: [...new Set(offenseTokens(text))], routes,
      duration: Math.max(1800, Math.min(4200, 800 + Math.max(0, ...Object.values(routes).map(routeLength)) * 7 + passes.length * 450)),
    };
  });
  return { setup, frames };
}