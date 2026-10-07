import { distance } from '@/components/playbook/playGeometry';
// Resolve role-based prose from possession history instead of freezing steps
// that say "passer", "cutter" or "nearest teammate" rather than an O-number.
export default function resolveContextActions(play, text, positions, owner, context) {
  let resolved = text;
  const overrides = {};
  const passer = context.lastPasser || 'O1';
  if (/^If[^,]+,.*\b(?:exits?|clears?)\b/i.test(text)) resolved = text.replace(/^If[^,]+,\s*/i, '');
  resolved = resolved.replace(/\b(?:the )?ball handler\b/gi, owner).replace(/\b(?:the )?passer\b/gi, passer).replace(/\b(?:the )?cutter\b/gi, passer);
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
  if (/Primary Fast Break|Hit-Ahead Break/.test(play.name)) {
    if (/rebounder secures/i.test(text)) resolved = 'O5 holds the ball.';
    if (/nearest guard.*outlet/i.test(text)) resolved = 'O5 passes to O1.';
    if (/two wings sprint/i.test(text)) resolved = 'O2 and O3 sprint to their wings.';
    if (/big\/rim runner sprints/i.test(text)) resolved = 'O5 sprints to the rim.';
  }
  return { resolved, overrides };
}