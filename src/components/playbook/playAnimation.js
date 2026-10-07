// Court model: 500 x 470 half court, offense attacks the top (the
// dictionary's default orientation). Zone coordinates are user units.
const RIM = [250, 44];

export const COURT = { width: 500, height: 470, rim: RIM };

// Zone map matches the PlayCourt artwork: baseline at the top (y≈0), rim at
// y=44, free-throw line / elbows at y=190, 3-point arc apex at y≈277, half
// court at y=470. Non-central zones mirror x across the midline (zonePoint).
const ZONES = {
  top: [250, 277], nail: [250, 190], slot: [140, 245], wing: [78, 198],
  corner: [38, 100], elbow: [172, 190], block: [176, 130], dunker: [196, 64],
  short_corner: [108, 50], rim: [250, 44], lane: [250, 100], high_post: [250, 218],
  free_throw: [250, 190], baseline: [120, 40], restricted: [250, 58], half_court: [250, 450],
};

const ZONE_RE = /(short[-\s]+corner|deep[-\s]+corner|dunker(?:[-\s]+spot)?|free-throw[-\s]+line|high[-\s]+post|mid-post|low[-\s]+post|middle[-\s]+post|three-point[-\s]+line|restricted[-\s]+area|half-court|opposite[-\s]+half|weak[-\s]+side|far[-\s]+side|nail|slot|wing|corner|elbow|block|rim|basket|paint|lane|middle|center|perimeter|top(?:[-\s]+of[-\s]+the[-\s]+(?:key|arc))?(?!-lock)|baseline|post|arc)(?:s|es)?\b/gi;

function zoneKey(phrase) {
  const p = phrase.toLowerCase();
  if (/short corner/.test(p)) return 'short_corner';
  if (/deep corner/.test(p)) return 'corner';
  if (/dunker/.test(p)) return 'dunker';
  if (/free-throw/.test(p)) return 'free_throw';
  if (/high post/.test(p)) return 'high_post';
  if (/(mid|low|middle) post/.test(p)) return 'block';
  if (/opposite half|weak side|far side/.test(p)) return 'wing';
  if (/nail/.test(p)) return 'nail';
  if (/slot/.test(p)) return 'slot';
  if (/wing|perimeter|three-point/.test(p)) return 'wing';
  if (/corner/.test(p)) return 'corner';
  if (/elbow/.test(p)) return 'elbow';
  if (/block/.test(p)) return 'block';
  if (/rim|basket|restricted/.test(p)) return 'rim';
  if (/paint|lane|middle/.test(p)) return 'lane';
  if (/top|arc/.test(p)) return 'top';
  if (/half-court/.test(p)) return 'half_court';
  if (/baseline/.test(p)) return 'baseline';
  return 'block'; // plain "post"
}

const CENTRAL = new Set(['top', 'nail', 'rim', 'lane', 'high_post', 'free_throw', 'restricted', 'half_court']);

function zonePoint(zone, side) {
  const [x, y] = ZONES[zone] || ZONES.wing;
  if (CENTRAL.has(zone)) return [x, y];
  return side === 'left' ? [x, y] : [500 - x, y];
}

// Side resolution from the words just before a zone phrase. Ball side is the
// default; "weak/opposite/help/backside" flips to the weak side.
function sideOf(before, ballSide) {
  if (/\bleft\b/i.test(before)) return 'left';
  if (/\bright\b/i.test(before)) return 'right';
  if (/\bweak\b|\bopposite\b|backside|\bhelp\b|\bfar\b/i.test(before)) return ballSide === 'left' ? 'right' : 'left';
  return ballSide;
}

// A phrase only counts as a destination when the clause contains real player
// movement — this keeps idioms ("turns the corner") and descriptors
// ("baseline flex screen") from teleporting the wrong player.
const MOVE_VERB_RE = /\b(moves?|moved|cut(?:s|ting)?|sprints?|runs?|drifts?|lifts?|rises?|slides?|fills?|attacks?|drives?|clears?|exits?|relocat(?:es|ing)?|retreats?|sets?|steps?|walks?|jabs?|seals?|goes?|turns?|plants?|pivots?|flows?|slips?|pops?|opens?|screens?|holds?|stays?|remains?|waits?|settles?|spaces?|widens?|flashes?|darts?|brings?|backs?|chases?|follows?|trails?|establishes?|positions?|approaches?|arrives?|advances?|pushes?|crosses?|dives?|flashes|rolls?|fans?|carries?|places?|placing|aligns?|aligned|occup(?:y|ies)|rotates?|rotating)\b/i;

// A zone phrase that describes something other than the player's destination.
function isDescriptor(zoneMatch, windowText) {
  const before = windowText.slice(Math.max(0, zoneMatch.index - 28), zoneMatch.index);
  const after = windowText.slice(zoneMatch.index + zoneMatch[0].length);
  const zone = zoneKey(zoneMatch[0]);
  if (/over\s+the\s*$/i.test(before)) return true; // pass arc, not a spot
  if (zone === 'corner' && /\bturn(?:s|ing)?\s+the?\s*$/i.test(before)) return true; // "turns the corner"
  if (zone === 'baseline' && /^\s*(flex|cross|drag|screen|skip|lob|bounce|pass)\b/i.test(after)) return true; // screen/pass name
  // Path phrases ("through/across/over/past the lane") and start locations
  // ("from the wing") describe where the player travels, not where they end.
  if (/\b(?:over|through|across|via|past)\s+(?:the\s+)?$/i.test(before)) return true;
  if (/\bfrom\s+(?:the\s+)?$/i.test(before)) return true;
  if (zone === 'block' && after.startsWith('/')) return true; // "block/rim" path pair
  if (zone === 'block' && /^post/i.test(zoneMatch[0]) && /^s?\s*(briefly|up|split|entry|touch|seals?|and|then)\b/i.test(after)) return true; // "posts up/briefly" is a verb
  return false;
}

// A destination zone is anchored by a directional preposition just before it
// ("to / toward / into / at / off the corner").
const DIR_ANCHOR_RE = /\b(?:to|toward|towards|into|at|off|onto)\b/i;

function firstDestination(windowText) {
  const zones = [...windowText.matchAll(ZONE_RE)].filter((match) => !isDescriptor(match, windowText));
  if (!zones.length) return null;
  // Steps name start locations and travel paths before the endpoint ("cuts
  // through the lane to the rim"), so the anchored destination is the LAST
  // directional zone; unanchored clauses fall back to the final zone.
  const anchored = zones.filter((match) => DIR_ANCHOR_RE.test(windowText.slice(Math.max(0, match.index - 24), match.index)));
  const pool = anchored.length ? anchored : zones;
  return pool[pool.length - 1];
}

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const clone = (obj) => Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, [...value]]));
const offenseTokens = (text) => [...text.matchAll(/\b([Oo]\d)\b/g)].map((m) => m[1].toUpperCase());

const DEFAULT_SPOTS = {
  O1: [250, 277],
  O2: zonePoint('wing', 'right'),
  O3: zonePoint('wing', 'left'),
  O4: zonePoint('elbow', 'right'),
  O5: zonePoint('block', 'left'),
};

// Plural zone words ("elbows", "corners") describe a shared destination for
// several players — handled by the group assignment, not one player's clause.
const isPluralZone = (phrase) => /^(elbow|wing|corner|slot|block|dunker|post)s$/i.test(phrase.trim());

// Initial offensive placement, read from the play's "Starting alignment".
// Each player first gets a destination from its own clause; players left
// without one share the group's trailing zone (spread wide if it is central
// or held by three or more players).
function initialPositions(play) {
  const pos = clone(DEFAULT_SPOTS);
  for (const segment of (play.alignment || '').split(/[;,]/)) {
    const players = offenseTokens(segment);
    if (!players.length) continue;
    const unassigned = [];
    let cursor = 0;
    players.forEach((player) => {
      const rel = segment.slice(cursor).search(new RegExp(`\\b${player}\\b`, 'i'));
      if (rel < 0) { unassigned.push(player); return; }
      const abs = cursor + rel;
      const ahead = segment.slice(abs + player.length, abs + player.length + 60);
      const stop = ahead.search(/\b[OX]\d\b/i);
      const window = stop >= 0 ? ahead.slice(0, stop) : ahead;
      let zoneMatch = null;
      for (const match of window.matchAll(ZONE_RE)) {
        if (!isPluralZone(match[0]) && !/^posts$/i.test(match[0])) { zoneMatch = match; break; }
      }
      if (zoneMatch) {
        pos[player] = zonePoint(zoneKey(zoneMatch[0]), sideOf(window.slice(0, zoneMatch.index), 'right'));
        cursor = abs + player.length + (stop >= 0 ? stop : 0);
      } else {
        unassigned.push(player);
        cursor = abs + player.length;
      }
    });
    const lastToken = players[players.length - 1];
    const tail = segment.slice(segment.lastIndexOf(lastToken) + lastToken.length);
    const tailZone = [...tail.matchAll(ZONE_RE)][0];
    if (!tailZone || !unassigned.length) continue;
    const zone = zoneKey(tailZone[0]);
    if (CENTRAL.has(zone) && players.length > 1) {
      players.forEach((player, i) => {
        const t = i / (players.length - 1);
        pos[player] = [250 + (t - 0.5) * 300, ZONES[zone][1]];
      });
      continue;
    }
    const hasLeft = /\bleft\b/i.test(tail);
    const hasRight = /\bright\b/i.test(tail);
    unassigned.forEach((player, i) => {
      let side;
      if (hasLeft && !hasRight) side = 'left';
      else if (hasRight && !hasLeft) side = 'right';
      else if (unassigned.length > 2) side = null;
      else side = i % 2 === 0 ? 'left' : 'right';
      if (side !== null) {
        // Don't stack onto a teammate already parked at this spot.
        const target = zonePoint(zone, side);
        const crowded = players.some((other) => other !== player && Math.hypot(pos[other][0] - target[0], pos[other][1] - target[1]) < 30);
        if (crowded) side = target[0] <= 250 ? 'right' : 'left';
      }
      pos[player] = side === null
        ? [86 + (unassigned.length === 1 ? 0.5 : i / (unassigned.length - 1)) * 328, ZONES[zone][1]]
        : zonePoint(zone, side);
    });
  }
  // Overlap pass: an explicit assignment can land on another player's default
  // spot ("O5 top" while O1 defaults to top) — nudge the default-holder away.
  const ids = Object.keys(pos);
  const spotOpen = (p, self) => !ids.some((other) => other !== self && Math.hypot(pos[other][0] - p[0], pos[other][1] - p[1]) < 30);
  for (const id of ids) {
    const isDefault = pos[id][0] === DEFAULT_SPOTS[id][0] && pos[id][1] === DEFAULT_SPOTS[id][1];
    const clash = ids.find((other) => other !== id && Math.hypot(pos[other][0] - pos[id][0], pos[other][1] - pos[id][1]) < 30);
    if (!isDefault || !clash) continue;
    pos[id] = [
      [pos[id][0] + 40, pos[id][1]], [pos[id][0] - 40, pos[id][1]],
      [pos[id][0], pos[id][1] + 34], [pos[id][0], pos[id][1] - 34],
      [pos[id][0] + 40, pos[id][1] + 34], [pos[id][0] - 40, pos[id][1] - 34],
    ].find(spotOpen) || pos[id];
  }
  return pos;
}

// Defenders shadow their matchup: offset toward the rim, shaded toward ball.
function defenseShadow(offense, ballPos) {
  const pos = {};
  for (let i = 1; i <= 5; i++) {
    let spot = lerp(offense[`O${i}`], RIM, 0.24);
    spot = lerp(spot, ballPos, 0.12);
    pos[`X${i}`] = spot;
  }
  return pos;
}

// Detect ball movement in one step: explicit arrows ("O1 → O5"), pass verbs,
// handoffs and catches. Returns the pass list and the final ball owner.
function detectPasses(stepText, startOwner) {
  const passes = [];
  let owner = startOwner;
  const push = (to) => {
    if (to && to !== owner) { passes.push([owner, to]); owner = to; }
  };
  for (const arrow of stepText.matchAll(/\b([Oo]\d)\s*(?:→|->)\s*([Oo]\d)/g)) {
    passes.push([arrow[1].toUpperCase(), arrow[2].toUpperCase()]);
    owner = arrow[2].toUpperCase();
  }
  const verbRe = /\b(pass(?:es|ed)?|feeds?|pitch(?:es)?|deliver(?:s)?|throw(?:s)?|hit(?:s)?|gives?|hands?|enters?|inbounds?|skips?|reverses?)\b/gi;
  for (const verb of stepText.matchAll(verbRe)) {
    const ahead = stepText.slice(verb.index, verb.index + 55);
    const match = ahead.match(/\b(?:to|into|for)\b[^.]{0,14}?\b([Oo]\d)\b/i)
      || ahead.match(/\bthe\s+(?:ball|pass)\b[^.]{0,14}?\b([Oo]\d)\b/i)
      || ahead.match(/\b([Oo]\d)\b/i);
    if (match) push(match[1].toUpperCase());
  }
  // "takes the handoff/ball": the receiver is named just before the verb.
  const takeIndex = stepText.search(/takes?\s+(?:the\s+)?(?:ball|handoff|hand-to-hand|exchange|pass)/i);
  if (takeIndex >= 0) {
    const giver = [...stepText.slice(Math.max(0, takeIndex - 40), takeIndex).matchAll(/\b([Oo]\d)\b/gi)].pop();
    if (giver) push(giver[1].toUpperCase());
  }
  // Handoff/DHO: the receiver usually approaches before the exchange word.
  const exchangeIndex = stepText.search(/handoff|hand-off|hand-to-hand|dho/i);
  if (exchangeIndex >= 0) {
    const before = [...stepText.slice(Math.max(0, exchangeIndex - 80), exchangeIndex).matchAll(/\b([Oo]\d)\b/gi)].pop();
    const after = /\b([Oo]\d)/i.exec(stepText.slice(exchangeIndex, exchangeIndex + 60));
    const receiver = (before && before[1].toUpperCase() !== owner ? before[1] : after ? after[1] : before ? before[1] : null);
    if (receiver) push(receiver.toUpperCase());
  }
  const receiveMatch = stepText.match(/receives?\s+(?:the\s+)?(?:ball|pass|entry|catch|feed|post|return|outlet|handoff|lob|pitch)?\s*(?:from\s+)?\b([Oo]\d)\b/i);
  if (receiveMatch) push(receiveMatch[1].toUpperCase());
  return { passes, owner };
}

// Offensive movement: each (grouped) player token looks ahead within its own
// clause for a court-zone destination. Connectors like "behind X4 toward the
// corner" extend the search past the intervening player.
// The sentence containing a text offset — for finding a step's subject.
function sentenceAt(text, index) {
  for (const sentence of text.matchAll(/[^.!?]+[.!?]?/g)) {
    if (index >= sentence.index && index < sentence.index + sentence[0].length) return sentence[0];
  }
  return text;
}

function offenseMovement(stepText, offense, ballSide) {
  const next = clone(offense);
  const moved = new Set();
  const groupRe = /\b([Oo]\d)\b((?:\s*(?:[/,&]|\b(?:and|or)\b)\s*[Oo]\d)*)/g;
  for (const group of stepText.matchAll(groupRe)) {
    const players = offenseTokens(group[0]);
    const ahead = stepText.slice(group.index + group[0].length, group.index + group[0].length + 120);
    // A token referenced as a waypoint ("cuts tightly off O5…") only marks
    // the screen the mover uses — it does not move itself.
    const lead = stepText.slice(Math.max(0, group.index - 12), group.index);
    if (/\b(?:off|past|around|behind|by)\s*(?:of)?\s*$/i.test(lead)) continue;
    const stop = ahead.search(/\b[OX]\d\b/i);
    const window = stop >= 0 ? ahead.slice(0, stop) : ahead;
    let zoneMatch = firstDestination(window);
    let clause = window;
    if (!zoneMatch && stop >= 0 && /\b(behind|around|past|across|through|off)\b/i.test(window)) {
      const rest = ahead.slice(stop).replace(/^\s*[OX]\d\b/i, '');
      const nextStop = rest.search(/\b[OX]\d\b/i);
      clause = window + rest.slice(0, nextStop >= 0 ? nextStop : rest.length);
      zoneMatch = firstDestination(clause);
    }
    if (!zoneMatch) continue;
    // "O5 uses O1's down screen and rises to the top": the possessive token
    // merely owns the screen — the sentence's subject is the one who moves.
    let actors = players;
    if (/^\s*'?s\b[\w\s-]{0,24}?\bscreen/i.test(ahead)) {
      const subject = ((sentenceAt(stepText, group.index).match(/\b[Oo]\d\b/i) || [])[0] || '').toUpperCase();
      if (!subject || subject === players[0] || moved.has(subject)) continue;
      actors = [subject];
    }
    const before = clause.slice(Math.max(0, zoneMatch.index - 28), zoneMatch.index);
    // The action verb may sit before the token list ("Place O2 and O3 at…").
    const beforeText = stepText.slice(Math.max(0, group.index - 40), group.index);
    if (!MOVE_VERB_RE.test(beforeText + clause)) continue;
    const zone = zoneKey(zoneMatch[0]);
    actors.forEach((player, i) => {
      // Plural zones ("the two elbows") split the group across mirrored sides.
      const side = isPluralZone(zoneMatch[0]) ? (i % 2 === 0 ? 'left' : 'right') : sideOf(before, ballSide);
      let target = zonePoint(zone, side);
      // Nudge off any teammate already parked on the same spot, trying side
      // and depth offsets until the landing spot is genuinely open.
      const occupied = (p) => Object.entries(next).some(([other, spot]) => other !== player && Math.hypot(spot[0] - p[0], spot[1] - p[1]) < 26);
      if (occupied(target)) {
        target = [
          [target[0] + 34, target[1]], [target[0] - 34, target[1]],
          [target[0], target[1] + 30], [target[0], target[1] - 30],
          [target[0] + 34, target[1] + 30], [target[0] - 34, target[1] - 30],
        ].find((p) => !occupied(p)) || target;
      }
      next[player] = target;
      moved.add(player);
    });
  }
  return { next, moved };
}

// Screen actions: screener = the offensive token before a screen word
// (screens, pindowns, staggers, elevators, wedges); target = the first token
// after it. Screen points sit between the screener and the action.
function screenActions(stepText, offense, ballOwner) {
  const actions = [];
  const screenRe = /\b(?:screen(?:s|ing|er)?s?|pindowns?|pin-downs?|stagger(?:s|ed)?|elevators?|wedges?)\b/gi;
  for (const screen of stepText.matchAll(screenRe)) {
    const before = stepText.slice(Math.max(0, screen.index - 40), screen.index);
    const candidates = [...before.matchAll(/\b([Oo]\d)\b/gi)];
    if (!candidates.length) continue;
    const last = candidates[candidates.length - 1];
    // The token must be setting the screen, not merely using or reading it.
    const between = stepText.slice(last.index + last[0].length, screen.index);
    // "comes off / uses the screen" is a usage phrase, not a setter lead-in.
    if (/\boff\b/i.test(between)) continue;
    const isSetter = /\bsets?\b|setting\b|approach(?:es)?|sprints?|walks?|steps?|arrives?|comes?|moves?|slides?|positions?|establishes?|follows?|trails?|backs?|turns?|exits?|repositions?\b/i.test(between);
    if (!isSetter) continue;
    const after = stepText.slice(screen.index + screen[0].length, screen.index + screen[0].length + 34);
    const defenderTarget = after.match(/\b([Oo]\d)(?:'s)?\s+defender/i);
    const target = defenderTarget ? `X${defenderTarget[1][1]}` : (after.match(/\b([OoXx]\d)\b/i) || [])[1];
    let point;
    if (target && target[0].toUpperCase() === 'X') {
      const mate = offense[`O${target[1]}`];
      // A back screen sits rim-side of the defender; P&R and down screens
      // angle in from the middle side just below the matchup.
      point = /\bback\s+$/i.test(stepText.slice(Math.max(0, screen.index - 24), screen.index))
        ? [mate[0], mate[1] - 26]
        : [mate[0] + (mate[0] <= 250 ? 30 : -30), mate[1] + 12];
    } else if (target && target[0].toUpperCase() === 'O') {
      const receiver = offense[target.toUpperCase()];
      point = [receiver[0], receiver[1] - 26];
    } else {
      const handler = offense[ballOwner] || offense.O1;
      point = [handler[0], handler[1] + 28];
    }
    actions.push({ screener: last[1].toUpperCase(), target: target ? target.toUpperCase() : null, point });
  }
  // Screen usage with a named screener: "O3 uses a flex screen from O5" or
  // "O2 comes off O5's screen" — the token after from/off sets the screen and
  // the token before the verb cuts, ending on the mirrored side of the floor.
  const useFromRe = /\b([Oo]\d)\b\s+(?:uses?|runs?|follows?)\s+(?:a\s+|the\s+)?(?:[\w-]+\s+){0,2}screen(?:s)?\s+from\s+([Oo]\d)/gi;
  const comeOffRe = /\b([Oo]\d)\b\s+comes?\s+off(?:\s+of)?\s+(?:a\s+|the\s+)?(?:([Oo]\d)'?s?\s+)?[\w-]*\s*screen(?:s)?(?:\s+(?:toward|to)\s+([Oo]\d))?/gi;
  for (const usage of [...stepText.matchAll(useFromRe), ...stepText.matchAll(comeOffRe)]) {
    const cutter = usage[1].toUpperCase();
    const screener = (usage[2] || usage[3] || usage[4] || '').toUpperCase();
    if (!screener) continue;
    const spot = offense[screener];
    if (!spot || !offense[cutter]) continue;
    actions.push({ screener, target: cutter, cutter, point: [spot[0], spot[1] - 24] });
  }
  return actions;
}

// Defensive movement for one step: explicit keywords (drop / trap / deny /
// screen contact) move that defender; everyone else keeps shadowing.
function defenseMovement(stepText, offense, ballPos, screens) {
  const pos = defenseShadow(offense, ballPos);
  for (const match of stepText.matchAll(/\b([Xx]\d)\b/g)) {
    const x = match[1].toUpperCase();
    const o = offense[`O${x[1]}`];
    const ctx = stepText.slice(Math.max(0, match.index - 34), match.index + 60).toLowerCase();
    if (/drop|retreat|sinks?\b|deep|below|pack line/.test(ctx)) pos[x] = lerp(o, RIM, 0.5);
    else if (/trap|blitz|jump|double|hedge|show|steps? up|attack|deny|denies|pressure|fronts?|steal|intercept|stunt|chase/.test(ctx)) pos[x] = lerp(o, ballPos, 0.72);
    else if (/screen/.test(ctx)) {
      const on = screens.find((action) => action.target === x);
      pos[x] = on ? lerp(pos[x], on.point, 0.6) : lerp(o, ballPos, 0.35);
    } else pos[x] = lerp(o, ballPos, 0.32);
  }
  return pos;
}

const involvedTokens = (text) => [...new Set([...text.matchAll(/\b([OX]\d)\b/gi)].map((m) => m[1].toUpperCase()))];

// Build the full animation for one play: a setup frame (starting formation)
// plus one frame per numbered step. Each frame carries player positions,
// ball owner, passes, screen markers and the involved players.
export function buildFrames(play) {
  const offense = initialPositions(play);
  let ballOwner = 'O1';
  const ballPosFor = (owner) => {
    const spot = offense[owner] || offense.O1;
    return [spot[0] - 12, spot[1] - 20];
  };
  const setup = {
    text: `Setup — ${play.name} lines up: ${play.alignment || 'standard spots'}.`,
    offense: clone(offense),
    defense: defenseShadow(offense, ballPosFor('O1')),
    ballOwner: 'O1',
    passes: [],
    screens: [],
    involved: Object.keys(offense),
  };
  // Step movers may land on a stationary teammate's spot (a cross-lane cut
  // into an occupied wing, two screeners converging on the same gap). Nudge
  // anyone that ends on top of someone else into the nearest open spot.
  const resolveOverlaps = (pos) => {
    const ids = Object.keys(pos);
    const spotOpen = (p, self) => !ids.some((other) => other !== self && Math.hypot(pos[other][0] - p[0], pos[other][1] - p[1]) < 22);
    for (const id of ids) {
      if (spotOpen(pos[id], id)) continue;
      pos[id] = [
        [pos[id][0] + 40, pos[id][1]], [pos[id][0] - 40, pos[id][1]],
        [pos[id][0], pos[id][1] + 34], [pos[id][0], pos[id][1] - 34],
        [pos[id][0] + 40, pos[id][1] + 34], [pos[id][0] - 40, pos[id][1] - 34],
      ].find(spotOpen) || pos[id];
    }
    return pos;
  };
  const frames = play.steps.map((stepText) => {
    const ballSide = offense[ballOwner][0] <= 250 ? 'left' : 'right';
    const { passes, owner } = detectPasses(stepText, ballOwner);
    const { next, moved } = offenseMovement(stepText, offense, ballSide);
    const screens = screenActions(stepText, next, ballOwner).filter((action) => !moved.has(action.screener));
    for (const action of screens) {
      next[action.screener] = [...action.point];
      // A named screen usage also sends the cutter across to the far side.
      if (action.cutter && !moved.has(action.cutter)) {
        const start = offense[action.cutter] || next[action.cutter];
        next[action.cutter] = [COURT.width - start[0], start[1]];
        moved.add(action.cutter);
      }
    }
    resolveOverlaps(next);
    Object.assign(offense, next);
    if (owner && offense[owner]) ballOwner = owner;
    const ballPos = ballPosFor(ballOwner);
    return {
      text: stepText,
      offense: clone(offense),
      defense: defenseMovement(stepText, offense, ballPos, screens),
      ballOwner,
      passes,
      screens,
      involved: involvedTokens(stepText),
    };
  });
  return { setup, frames };
}