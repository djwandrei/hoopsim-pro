import { actionClauses } from '@/components/playbook/playClauses';
import { COURT, ZONE_RE, clonePositions, sideAt, sideOf, zoneKey, zonePoint, clampPoint } from '@/components/playbook/playGeometry';
const MOVE = /\b(?:moves?|cuts?|sprints?|runs?|drifts?|lifts?|rises?|slides?|fills?|attacks?|drives?|clears?|exits?|relocates?|retreats?|steps?|walks?|goes?|flows?|slips?|pops?|flashes?|dribbles?|brings?|advances?|pushes?|rolls?|dives?|occupies|spaces?|settles?|establishes?|begins?|starts?|flatten|rotates?|places?)\b/i;
function destination(body) {
  const matches = [...body.matchAll(ZONE_RE)].filter(match => {
    const before = body.slice(Math.max(0, match.index - 30), match.index);
    const after = body.slice(match.index + match[0].length);
    if (/\b(?:from|through|across|over|past|along)\s+(?:the\s+)?$/i.test(before)) return false;
    if (/turns?\s+the\s*$/i.test(before) || /^\s*(?:screen|defender|help|tag|penetration)\b/i.test(after)) return false;
    return true;
  });
  // Alternatives separated by / or "or" are one menu: animate the first
  // stated destination, not whichever keyword happens to appear last.
  const directional = matches.filter(m => /\b(?:to|toward|towards|into|at|on)\s+(?:the\s+|opposite\s+|left\s+|right\s+){0,2}$/i.test(body.slice(Math.max(0, m.index - 30), m.index)));
  return directional[0] || matches[0];
}
function screenPoint(body, screener, target, positions, owner, priorScreens) {
  const receiver = positions[target] || positions[owner];
  const dir = receiver[0] >= 250 ? -1 : 1;
  if (/back[-\s]?screen|rip screen/i.test(body)) return clampPoint([receiver[0], receiver[1] - 62]);
  if (/pindown|pin-down|down screen|screen.*desired catch/i.test(body)) return clampPoint([receiver[0] + dir * 42, receiver[1] + 58]);
  if (/flare/.test(body)) return clampPoint([receiver[0] - dir * 62, receiver[1] - 24]);
  if (/cross|flex/.test(body)) return clampPoint([receiver[0] + dir * 66, Math.min(receiver[1], 126)]);
  const previous = priorScreens.find(s => s.screener !== screener && s.target === target);
  if (previous && /second|follows|stagger|double/i.test(body)) return clampPoint([previous.point[0] + dir * 64, previous.point[1] - 28]);
  // The screen is alongside the handler, not at an unrelated zone mentioned
  // as the desired angle ("angled toward the middle").
  return clampPoint([receiver[0] + dir * 64, receiver[1] - 10]);
}
export function applyActions(text, offense, ballOwner, previousScreens = []) {
  const next = clonePositions(offense);
  const moved = new Set();
  const screens = [];
  const via = {};
  const ballSide = sideAt(offense[ballOwner]);
  const place = (id, point, waypoint) => {
    next[id] = clampPoint(point); moved.add(id);
    if (waypoint) via[id] = [clampPoint(waypoint)];
  };
  for (const clause of actionClauses(text)) {
    const { actors, body, before } = clause;
    // Setter detection is actor-scoped: a reference to O5's screen never
    // moves O5. Both "O2 back-screens X5" and "O5 sets a screen" are setters.
    const setter = /\b(?:sets?|setting|back-screens?|screens?|arrives?|sprints?|walks?|moves?|follows?|steps?)\b.*\b(?:screen\w*|pindown|stagger|elevator)\b/i.test(body) || /^(?:back-)?screens?\b/i.test(body);
    const using = /\b(?:uses?|off|comes? off|through.*screen)\b/i.test(body);
    if (setter && !using && !/\b(?:receives?|passes?|reads?)\b/i.test(body)) {
      const targetMatch = /\b(?:on|for)\s+(O[1-5]|X[1-5])\b/i.exec(body) || /\b(X[1-5])\b/i.exec(body) || /\b(O[1-5])['’]s\s+defender/i.exec(body);
      const target = targetMatch ? `O${targetMatch[1][1]}` : ballOwner;
      actors.forEach(id => {
        const point = screenPoint(body, id, target, next, ballOwner, [...previousScreens, ...screens]);
        place(id, point); screens.push({ screener: id, target, point });
      });
      continue;
    }
    // Spacing maintenance does not make weak-side players switch sides.
    if (/^(?:holds?|stays?|maintains?|remains?|waits?|reads?|pivots? to face|opens? to the ball|sets? X[1-5] up)\b/i.test(body)) continue;
    const reference = /\b(O[1-5])['’]s\s+(?:[\w-]+\s+){0,2}(?:screen|pindown)/i.exec(body) || /screen\s+from\s+(O[1-5])/i.exec(body);
    const toPlayer = /\b(?:to|toward|towards)\s+(O[1-5])\b/i.exec(body);
    const usedScreens = reference
      ? [{ screener: reference[1].toUpperCase(), point: next[reference[1].toUpperCase()] }]
      : previousScreens.filter(screen => actors.includes(screen.target));
    const zone = destination(body);
    const isMove = MOVE.test(body) || /\bplace\b/i.test(before);
    if (!isMove && !using) continue;
    actors.forEach((id, index) => {
      const start = offense[id];
      const ownSide = sideAt(start);
      const side = actors.length > 1 && zone ? (index % 2 ? 'right' : 'left') : sideOf(before + body, ownSide);
      if (toPlayer && !/\b(?:passes?|hands?|feeds?|gives?|pitches?)\b/i.test(body)) {
        const target = next[toPlayer[1].toUpperCase()];
        place(id, [target[0] + (start[0] >= target[0] ? 62 : -62), target[1] - 12], usedScreens[0] ? [usedScreens[0].point[0] + (ownSide === 'right' ? -64 : 64), usedScreens[0].point[1]] : null);
      } else if (using && usedScreens.length) {
        const screen = usedScreens[usedScreens.length - 1];
        const dir = screen.point[0] >= 250 ? -1 : 1;
        const bend = [screen.point[0] + dir * 64, screen.point[1] - 12];
        const target = zone ? zonePoint(zoneKey(zone[0]), side) : [bend[0], bend[1] - 76];
        // Flex cutters cross the lane; ball-screen users go downhill, not
        // directly across the screener's token.
        place(id, /flex|baseline.*across/i.test(body) ? zonePoint('block', ownSide === 'right' ? 'left' : 'right') : target, bend);
      } else if (zone) {
        let target = zonePoint(zoneKey(zone[0]), side);
        if (/\b(?:middle|center)\b/i.test(zone[0]) && /pushes?|advances?|brings?/i.test(body)) target = [250, Math.max(270, start[1] - 90)];
        place(id, target);
      } else if (/\brolls?|dives?|backcuts?\b/i.test(body)) place(id, COURT.rim);
      else if (/\bpops?\b/i.test(body)) place(id, zonePoint('slot', ownSide));
      else if (/turns? the corner|downhill|drives?|penetrates?/i.test(body)) place(id, [250 + (ownSide === 'right' ? 46 : -46), 138]);
      else if (/\bclears?|exits?|flares?\b/i.test(body)) place(id, zonePoint('corner', ownSide === ballSide ? (ballSide === 'right' ? 'left' : 'right') : ownSide));
      else if (/rotates? one spot|replace.*vacated/i.test(body)) {
        const perimeter = [[46, 64], [72, 216], [250, 314], [428, 216], [454, 64]];
        const nearest = perimeter.reduce((best, p, i) => Math.hypot(p[0]-start[0],p[1]-start[1]) < Math.hypot(perimeter[best][0]-start[0],perimeter[best][1]-start[1]) ? i : best, 0);
        place(id, perimeter[(nearest + (ballSide === 'right' ? 1 : 4)) % perimeter.length]);
      }
    });
  }
  // Generic ordinal screener steps (Double Drag) retain the roles established
  // by earlier frames; they don't silently become frozen text.
  const ordinal = /\b(first|second) screener\b.*\b(pops?|short-rolls?|rolls?)\b/i.exec(text);
  if (ordinal && !/\b(?:if|can|depending)\b/i.test(text)) {
    const screen = previousScreens[ordinal[1].toLowerCase() === 'first' ? 0 : 1];
    if (screen) place(screen.screener, /pop/i.test(ordinal[2]) ? zonePoint('slot', sideAt(offense[screen.screener])) : COURT.rim);
  }
  return { next, moved, screens, via };
}