// Reviewed animation commands. Prose remains display content, never executable.
export const move = (to, via = {}) => ({ type: 'move', to, via });
export const defend = to => ({ type: 'defend', to });
// Explicitly group independent movement. Ball exchanges and actions that
// depend on a newly set screen remain separate commands.
export const together = (...commands) => ({ type: 'together', commands });
export const expandCommands = commands => commands.flatMap(command => command.type === 'together' ? expandCommands(command.commands) : [command]);
export const pass = (to, handoff = false) => ({ type: 'pass', to, handoff });
export const screen = (actor, target, kind = 'ball', point) => ({ type: 'screen', actor, target, kind, point });
export const cutOffScreen = (actor, to, screener, track = true) => ({ type: 'use', actor, to, screener, track });
export const hold = note => ({ type: 'hold', note });
export const note = text => ({ type: 'note', text });
export const mark = key => ({ type: 'mark', key });
export const branch = (key, text) => ({ type: 'branch', key, text });
export const swap = (a, b) => ({ type: 'swap', a, b });
export const shot = () => ({ type: 'shot' });
export const sequence = (setup, steps, options = {}) => ({ setup, steps, owner: 'O1', ...options });

export const SPREAD = { O1: 'top', O2: 'right-wing', O3: 'left-wing', O4: 'left-corner', O5: 'right-block' };
export const FIVE = { ...SPREAD, O5: 'right-corner' };
export const HORNS = { O1: 'top', O2: 'right-corner', O3: 'left-corner', O4: 'left-elbow', O5: 'right-elbow' };
export const HIGH = { ...FIVE, O5: 'high_post' };
export const ZOOM = { O1: 'left-slot', O2: 'right-corner', O3: 'left-corner', O4: [380, 150], O5: [300, 280] };
export const PISTOL = { O1: [420, 330], O2: [450, 120], O3: 'left-corner', O4: 'left-wing', O5: [310, 400] };
export const BOX = { O1: 'top', O2: 'right-block', O3: 'left-elbow', O4: 'right-elbow', O5: 'left-block' };
export const DIAMOND = { O1: 'top', O2: 'restricted', O3: 'left-elbow', O4: 'right-elbow', O5: 'high_post' };
export const TRANSITION = { O1: [250, 770], O2: [425, 600], O3: [75, 610], O4: [125, 835], O5: [310, 890] };

// Common complete actions, expanded into distinct phases at runtime.
export const pickRoll = (handler = 'O1', big = 'O5', to = [305, 175]) => [
  screen(big, `X${handler[1]}`),
  cutOffScreen(handler, [to[0], Math.max(245, to[1])], big),
  // The handler clears the stationary screen before the big releases.
  // From that point the downhill dribble and roll develop together.
  together(move({ [handler]: to }), move({ [big]: 'rim' })),
];
export const zoom = (receiver = 'O2', big = 'O5', setter = 'O4', side = 'right') => [screen(setter, `X${receiver[1]}`, 'down'), cutOffScreen(receiver, `${side}-wing`, setter), move({ [big]: [side === 'right' ? 330 : 170, 265], [receiver]: [side === 'right' ? 380 : 120, 265] }), pass(receiver, true)];
