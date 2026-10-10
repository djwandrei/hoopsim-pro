import { ZONES, distance } from '@/components/playbook/playGeometry';

const LABELS = {
  top: 'the top of the key', slot: 'the slot', wing: 'the wing', corner: 'the corner',
  elbow: 'the elbow', block: 'the block', dunker: 'the dunker spot', short_corner: 'the short corner',
  rim: 'the rim', lane: 'the middle of the lane', nail: 'the nail', high_post: 'the high post',
  free_throw: 'the free-throw line', restricted: 'the restricted area', baseline: 'the baseline',
  half_court: 'mid court',
};
const LATERAL = new Set(['slot', 'wing', 'corner', 'elbow', 'block', 'short_corner', 'dunker']);
const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
export function roleLabel(id) {
  const match = /^([OX])([1-5])$/.exec(id);
  return match ? `${POSITIONS[Number(match[2]) - 1]}${match[1] === 'X' ? ' defender' : ''}` : id;
}
// Keep actor keys stable for the engine. Every user-facing sentence uses the
// same position labels printed below the players on the diagram.
export function positionText(text = '') {
  return text.replace(/\b[OX][1-5](?:\/[OX][1-5])+\b/g, list => joinPlayers(list.split('/').map(roleLabel)))
    .replace(/\b([OX])([1-5])\s*[–-]\s*\1?([1-5])\b/g, (range, side, first, last) => {
    if (Number(last) < Number(first)) return range;
    const labels = POSITIONS.slice(Number(first) - 1, Number(last)).map(role => `${role}${side === 'X' ? ' defender' : ''}`);
    return joinPlayers(labels);
  }).replace(/\b[OX][1-5]\b/g, roleLabel)
    .replace(/\b(PG|SG|SF|PF|C)\/(PG|SG|SF|PF|C)\b/g, '$1 and $2');
}
const joinPlayers = parts => parts.length < 3 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
const sentence = text => text.replace(/[.;\s]+$/, '') + '.';
const SCREEN_KINDS = { ball: 'ball screen', back: 'back screen', down: 'down screen', flare: 'flare screen', cross: 'cross screen', flat: 'flat ball screen', 'step-up': 'step-up ball screen', handoff: 'handoff screen', pin: 'pin-in screen' };

// Nearest known court zone for a point, with left/right side where it matters.
export function zoneNameOf(point) {
  if (point[1] > 540) return `${point[0] < 170 ? 'the left lane in' : point[0] > 330 ? 'the right lane in' : 'the middle of'} the backcourt`;
  let best = null;
  let bestDist = Infinity;
  for (const [key, spot] of Object.entries(ZONES)) {
    const d = Math.min(distance(point, spot), LATERAL.has(key) ? distance(point, [500 - spot[0], spot[1]]) : Infinity);
    if (d < bestDist) { bestDist = d; best = key; }
  }
  const base = LABELS[best] || best.replace(/_/g, ' ');
  return LATERAL.has(best) ? `the ${point[0] < 250 ? 'left' : 'right'} ${base.replace(/^the /, '')}` : base;
}

function movementClauses(command, before, after) {
  if (command.type === 'together') return command.commands.flatMap(item => movementClauses(item, before, after));
  if (command.type === 'screen') {
    const beneficiary = before.matchups[command.target];
    return [`${command.actor} gets set for a ${SCREEN_KINDS[command.kind] || 'screen'} on ${command.target}${beneficiary ? ` to free ${beneficiary}` : ''}`];
  }
  if (command.type === 'use') {
    const screen = before.screens.find(item => item.screener === command.screener);
    const kind = SCREEN_KINDS[screen?.kind] || 'screen';
    return [`${command.actor} ${before.ballOwner === command.actor ? 'dribbles' : 'cuts'} off ${command.screener}'s ${kind} to ${zoneNameOf(after.offense[command.actor])}`];
  }
  const clauses = [];
  for (const [id, value] of Object.entries(command.to || {})) {
    const origin = (id[0] === 'O' ? before.offense : before.defense)[id], target = (id[0] === 'O' ? after.offense : after.defense)[id];
    if (!origin || distance(origin, target) <= 6) continue;
    const destination = zoneNameOf(target);
    if (id[0] === 'X') {
      const guarded = after.matchups[id];
      clauses.push(value === 'guard' && guarded ? `${id} stays with ${guarded} at ${destination}`
        : value === 'gap' || value === 'pack' ? `${id} takes a help position at ${destination}` : `${id} rotates to ${destination}`);
    } else {
      const released = before.screens.find(screen => screen.screener === id && screen.used);
      const towardLane = target[1] < 180 && target[0] > 125 && target[0] < 375;
      const ballScreen = ['ball', 'flat', 'step-up', 'handoff'].includes(released?.kind);
      const action = before.ballOwner === id ? 'dribbles' : released ? towardLane ? ballScreen ? 'rolls' : 'dives' : ballScreen ? 'pops out' : 'opens out'
        : target[1] < origin[1] - 40 && target[1] < 205 ? 'cuts' : 'moves';
      const source = zoneNameOf(origin);
      clauses.push(source !== destination ? `${id} ${action} from ${source} to ${destination}`
        : distance(origin, target) > 40 && target[1] < origin[1] - 25 ? `${id} ${before.ballOwner === id ? 'dribbles' : 'cuts'} toward the basket from ${source}`
          : `${id} adjusts ${before.ballOwner === id ? 'the dribble position' : 'spacing'} at ${destination}`);
    }
  }
  return clauses;
}
// Describe the authored intent, not small automatic clearance/recovery paths.
// Defensive tracking still appears in the detailed movement list below it.
export function describeCommand(command, before, after) {
  if (['move', 'defend', 'use', 'screen', 'together'].includes(command.type)) {
    const clauses = movementClauses(command, before, after);
    return clauses.length > 1 ? sentence(`${clauses[0]}, while ${joinPlayers(clauses.slice(1))}`) : clauses.length ? sentence(clauses[0]) : '';
  }
  if (command.type === 'pass') return command.handoff
    ? `${before.ballOwner} hands the ball to ${after.ballOwner} at ${zoneNameOf(after.offense[after.ballOwner])}. ${after.ballOwner} takes over as the ballhandler.`
    : `${before.ballOwner} passes to ${after.ballOwner} at ${zoneNameOf(after.offense[after.ballOwner])}.`;
  if (command.type === 'shot') return `${before.ballOwner} releases a shot from ${zoneNameOf(before.offense[before.ballOwner])}.`;
  if (command.type === 'swap') return `${command.a} switches onto ${after.matchups[command.a]}, while ${command.b} takes ${after.matchups[command.b]}.`;
  return command.note ? sentence(command.note) : '';
}
export function describeStep(phases, notes, original) {
  const branch = notes.filter(text => /^Alternate read:/.test(text));
  const descriptions = phases.map(phase => phase.description).filter(Boolean);
  const context = notes.filter(text => !branch.includes(text) && !descriptions.some(description => description.includes(text)));
  const ordered = descriptions.map((description, index) => index === 0 ? description : `Then ${/^[OX][1-5]\b/.test(description) ? description : description[0].toLowerCase() + description.slice(1)}`);
  return positionText([...branch, ...ordered, ...context].join(' ') || original);
}

export function mirrorText(text, mirrored) {
  if (!mirrored) return text;
  return text.replace(/\b(left|right)\b/gi, word => {
    const opposite = word.toLowerCase() === 'left' ? 'right' : 'left';
    return word === word.toUpperCase() ? opposite.toUpperCase() : word[0] === word[0].toUpperCase() ? opposite[0].toUpperCase() + opposite.slice(1) : opposite;
  });
}

// Plain-language record of what a frame actually moved, for the narration panel.
export function describeFrame(previous, next, passes = [], screens = []) {
  const lines = [];
  for (const id of Object.keys(next).sort()) {
    const from = previous[id];
    const to = next[id];
    if (!from || distance(from, to) <= 6) continue;
    const source = zoneNameOf(from), destination = zoneNameOf(to);
    lines.push(source === destination ? `${id} adjusts position at ${destination}.` : `${id} moves from ${source} to ${destination}.`);
  }
  for (const screen of screens) lines.push(`${screen.screener} sets a ${SCREEN_KINDS[screen.kind] || 'screen'} on ${screen.target}.`);
  for (const pass of passes) lines.push(`${pass.handoff ? 'Handoff' : 'Pass'}: ${pass.from} → ${pass.to}.`);
  return lines;
}
