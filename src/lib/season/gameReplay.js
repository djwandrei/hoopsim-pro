const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const TWO_SHOTS = ['a driving layup', 'a pull-up jumper', 'a floater in the lane', 'a fadeaway from the elbow', 'a contested runner'];
const THREE_SHOTS = ['a corner 3', 'a stepback 3', 'a catch-and-shoot 3', 'a transition 3'];
const clockText = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function pickPlayer(team, rng, key = 'pts', notName) {
  const rotation = team.roster.slice(0, 10);
  const available = rotation.filter(player => player.name !== notName);
  const pool = available.length ? available : rotation;
  if (!pool.length) return { name: team.code };
  const weights = pool.map(player => Math.max(0.1, player[key] || 0));
  let draw = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    draw -= weights[i];
    if (draw <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function rebound(team, opponent, side, rng) {
  const offensive = rng() < clamp((team.orb + 1 - opponent.drb) / 2, 0.1, 0.45);
  const reboundSide = offensive ? side : side === 'home' ? 'away' : 'home';
  return { rebound: pickPlayer(offensive ? team : opponent, rng, 'reb').name, reboundSide, offensiveRebound: offensive };
}

// The replay records every scoring/stat event. Watched-game box scores are
// derived from these events, rather than a second, independent random draw.
export function buildGameReplay(home, away, periods, rng) {
  const events = [];
  let homeScore = 0; let awayScore = 0;
  const push = (period, clock, side, type, text, pts = 0, stat = null) => {
    if (side === 'home') homeScore += pts;
    if (side === 'away') awayScore += pts;
    events.push({ q: period, clock: clockText(clock), side, type, text, pts, score: [homeScore, awayScore], stat });
  };
  for (const period of periods) {
    push(period.label, period.seconds, null, 'period', `${period.label} is underway`);
    const plays = [];
    let homeLeft = period.home; let awayLeft = period.away;
    while (homeLeft > 0 || awayLeft > 0) {
      const side = homeLeft <= 0 ? 'away' : awayLeft <= 0 ? 'home' : rng() < 0.5 ? 'home' : 'away';
      const team = side === 'home' ? home : away;
      const opponent = side === 'home' ? away : home;
      const remaining = side === 'home' ? homeLeft : awayLeft;
      const player = pickPlayer(team, rng);
      const turnoverChance = clamp((team.tov + opponent.oppTov) / 2, 0.08, 0.24);
      const freeThrowChance = clamp((team.ftr + opponent.oppFtr) / 4, 0.04, 0.25);
      const draw = rng();
      let pts = 0; let type; let text; let stat = { scorer: player.name };
      if (draw < turnoverChance) {
        type = 'to';
        const thief = rng() < 0.55 ? pickPlayer(opponent, rng, 'stl') : null;
        stat = { turnover: player.name, ...(thief ? { steal: thief.name } : {}) };
        text = thief ? `${player.name} turns it over — ${thief.name} jumps the lane for ${opponent.code}` : `${player.name} loses the handle — turnover, ${opponent.code} ball`;
      } else if (remaining === 1 || draw < turnoverChance + freeThrowChance) {
        type = 'ft';
        const attempts = Math.min(2, remaining);
        let lastMade = false;
        for (let i = 0; i < attempts; i++) { lastMade = rng() < 0.77; if (lastMade) pts++; }
        stat.fta = attempts;
        if (!lastMade) Object.assign(stat, rebound(team, opponent, side, rng));
        text = `${player.name} hits ${pts} of ${attempts} at the line${stat.rebound ? ` — ${stat.rebound} collects the rebound` : ''}`;
      } else {
        const shot = remaining >= 3 && rng() < 0.35 ? 3 : 2;
        stat.shot = shot;
        const description = (shot === 3 ? THREE_SHOTS : TWO_SHOTS);
        const shotText = description[Math.floor(rng() * description.length)];
        const efg = clamp((team.efg + opponent.oppEfg) / 2, 0.4, 0.68);
        if (rng() < clamp(efg * 2 / shot, 0.25, 0.68)) {
          type = 'made'; pts = shot;
          const helper = rng() < 0.6 && team.roster.length > 1 ? pickPlayer(team, rng, 'ast', player.name) : null;
          if (helper) stat.assist = helper.name;
          text = `${player.name} ${shot === 3 ? 'splashes' : 'finishes'} ${shotText}${helper ? ` (assist: ${helper.name})` : ''}`;
        } else {
          type = 'miss';
          Object.assign(stat, rebound(team, opponent, side, rng));
          const blocker = rng() < 0.08 ? pickPlayer(opponent, rng, 'blk') : null;
          if (blocker) stat.block = blocker.name;
          text = `${player.name} ${blocker ? `is blocked by ${blocker.name} on` : 'misses'} ${shotText} — ${stat.rebound} corrals the board`;
        }
      }
      plays.push({ side, type, text, pts, stat });
      if (side === 'home') homeLeft -= pts; else awayLeft -= pts;
    }
    plays.forEach((play, index) => {
      const clock = Math.max(1, Math.round(period.seconds * (1 - (index + 1) / (plays.length + 1))));
      push(period.label, clock, play.side, play.type, play.text, play.pts, play.stat);
    });
    push(period.label, 0, null, 'period', `End of ${period.label} — ${home.code} ${homeScore}, ${away.code} ${awayScore}`);
  }
  const winner = homeScore > awayScore ? home : away;
  const loser = homeScore > awayScore ? away : home;
  push('FINAL', 0, null, 'final', `FINAL — ${winner.code} ${Math.max(homeScore, awayScore)}, ${loser.code} ${Math.min(homeScore, awayScore)}`);
  return events;
}