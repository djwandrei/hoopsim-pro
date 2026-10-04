import { statNumber } from '@/lib/dailyGames/boardHydration';

const ROLE_ORDER = { G: 0, F: 1, C: 2 };
export const roleOf = player => {
  const positions = (player.positions || []).map(position => String(position).toUpperCase());
  if (positions.some(p => p === 'C' || p === 'CENTER')) return 'C';
  if (positions.some(p => ['F', 'PF', 'SF', 'FORWARD'].includes(p))) return 'F';
  return 'G';
};
export const roleLabelFor = role => ({ G: 'Backcourt guard', F: 'Wing forward', C: 'Frontcourt anchor' }[role] || 'Rotation piece');

// Qualitative role detection: flags the stat category a player leads among
// the other lineup members (shared by the depth chart and swap briefing).
export const primaryRoles = (player, lineup = []) => {
  const others = lineup.filter(entry => entry.playerRef !== player.playerRef);
  const leads = key => {
    const mine = statNumber(player, key);
    if (mine === null || mine <= 0) return false;
    return others.every(other => {
      const value = statNumber(other, key);
      return value === null || mine >= value;
    });
  };
  const labels = [];
  if (leads('points')) labels.push('Primary scorer');
  if (leads('assists')) labels.push('Primary playmaker');
  if (leads('rebounds')) labels.push('Primary rebounder');
  if (!labels.length) labels.push(roleLabelFor(roleOf(player)));
  return labels;
};

export const sortLineup = (lineup = []) =>
  [...lineup].sort((a, b) => ROLE_ORDER[roleOf(a)] - ROLE_ORDER[roleOf(b)]);