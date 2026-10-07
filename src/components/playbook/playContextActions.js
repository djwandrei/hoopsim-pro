import { distance, sideAt } from '@/components/playbook/playGeometry';
// Resolve role-based prose from possession history instead of freezing steps
// that say "passer", "cutter", "screener" or "nearest teammate" rather than an
// O-number. Read guards ("If…", "Unless…") are no longer stripped — read
// branches stay descriptive and never execute.
export default function resolveContextActions(play, text, positions, owner, context) {
  let resolved = text;
  const overrides = {};
  const passer = context.lastPasser || 'O1';
  const screener = context.lastScreener || 'O5';
  resolved = resolved
    .replace(/(?<![\w-])(?:the )?ball handler\b/gi, owner)
    .replace(/(?<![\w-])(?:the )?handler\b/gi, owner)
    .replace(/(?<![\w-])(?:the )?passer\b/gi, passer)
    .replace(/(?<![\w-])(?:the )?cutter\b/gi, passer)
    .replace(/(?<![\w-])(?:the )?screener\b/gi, screener)
    .replace(/ghost(?:ing)? (?:shooter|screener)/gi, screener)
    // Passive ball reversals name no passer: borrow the last one.
    .replace(/\bball (?:is|gets) (?:skipped|passed|swung|reversed|thrown) to (O[1-5])/gi, (match, id) => `${passer} passes to ${id}`);
  // "Weak-side shooter lifts…" (P&R + Shake): the shooter is the perimeter
  // player away from the ball, not an unnamed bystander.
  if (/\b(?:weak-side|lifting) shooter\b/i.test(resolved)) {
    const weakSide = sideAt(positions[owner]) === 'right' ? 'left' : 'right';
    const candidates = Object.keys(positions).filter(id => id !== owner && sideAt(positions[id]) === weakSide && positions[id][1] > 150);
    candidates.sort((a, b) => distance(positions[a], positions[owner]) - distance(positions[b], positions[owner]));
    const shooter = candidates[0] || 'O3';
    resolved = resolved.replace(/\b(?:weak-side|lifting) shooter\b/gi, shooter);
  }
  if (/adjacent perimeter teammate/i.test(resolved)) {
    const options = Object.keys(positions).filter(id => id !== owner && (positions[id][1] > 200 || Math.abs(positions[id][0]-250) > 140));
    options.sort((a,b) => distance(positions[a],positions[owner])-distance(positions[b],positions[owner]));
    resolved = resolved.replace(/adjacent perimeter teammate/i, options[0] || 'O2');
  }
  if (/nearest teammate fills the vacated spot/i.test(text) && context.vacated) {
    const candidates = Object.keys(positions).filter(id => id !== passer && id !== owner);
    candidates.sort((a,b) => distance(positions[a],context.vacated)-distance(positions[b],context.vacated));
    overrides[candidates[0]] = context.vacated;
  }
  if (/Primary Fast Break|Hit-Ahead Break|Flow Into Delay/.test(play.name)) {
    if (/rebounder secures/i.test(text)) resolved = 'O5 holds the ball.';
    if (/nearest guard.*outlet/i.test(text)) resolved = 'O5 passes to O1.';
    if (/sprint beyond|two wings sprint/i.test(text)) resolved = 'O2 and O3 sprint to their wings.';
    if (/big\/rim runner sprints/i.test(text)) resolved = 'O5 sprints to the rim.';
    if (/wings fill corners/i.test(text)) resolved = 'O2 and O3 fill their corners and slots.';
    if (/receiver attacks/i.test(text)) resolved = `${context.lastReceiver || 'O2'} attacks the rim.`;
    if (/trailer fills behind/i.test(text)) resolved = 'O5 fills behind the top.';
  }
  return { resolved, overrides };
}