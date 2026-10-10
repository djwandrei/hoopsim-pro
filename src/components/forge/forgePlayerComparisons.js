import { SKILLS } from './bapSkills.js';

// Keep the comparison pool recognizable. Ratings still come from the selected
// season; these names do not supply canned ratings or a career-peak profile.
const RECOGNIZABLE = new Set(['LeBron James', 'Stephen Curry', 'Kevin Durant', 'Giannis Antetokounmpo', 'Nikola Jokic', 'Joel Embiid', 'Luka Doncic', 'Jayson Tatum', 'Damian Lillard', 'James Harden', 'Kyrie Irving', 'Jimmy Butler', 'Kawhi Leonard', 'Anthony Davis', 'Chris Paul', 'Russell Westbrook', 'Shai Gilgeous-Alexander', 'Devin Booker', 'Donovan Mitchell', 'Anthony Edwards', 'Jalen Brunson', 'Bam Adebayo', 'Victor Wembanyama', 'Trae Young', 'Tyrese Haliburton', "De'Aaron Fox", 'Paul George', 'Klay Thompson', 'Draymond Green', 'DeMar DeRozan', 'LaMarcus Aldridge', 'Kemba Walker', 'Blake Griffin', 'DeMarcus Cousins', 'Rudy Gobert', 'Karl-Anthony Towns', 'Jaylen Brown', 'Pascal Siakam', 'Ja Morant', 'Zion Williamson', 'Darius Garland', 'Jrue Holiday', 'Kevin Love', 'Khris Middleton', 'Bradley Beal', 'Kristaps Porzingis'].map(normalize));
function normalize(name) { return String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").toLowerCase(); }
export function forgeShadesOf(picks, pool) {
  const assigned = SKILLS.filter(skill => Number.isFinite(picks[skill.key]?.value));
  if (assigned.length < 5) return [];
  // Physical size is shown separately; the banner compares skill profiles.
  const skills = assigned.filter(skill => skill.key !== 'body');
  const weight = skills.reduce((sum, skill) => sum + skill.weight, 0);
  const seen = new Set();
  return pool.filter(player => {
    const name = normalize(player.name);
    if (!RECOGNIZABLE.has(name) || seen.has(name) || player.minutes < 600 || !skills.every(skill => Number.isFinite(player[skill.key]))) return false;
    seen.add(name); return true;
  }).map(player => {
    const difference = skills.map(skill => ({ skill, gap: Math.abs(picks[skill.key].value - player[skill.key]) }));
    return { player, distance: Math.sqrt(difference.reduce((sum, { skill, gap }) => sum + skill.weight * gap * gap, 0) / weight), traits: difference.sort((a, b) => a.gap - b.gap || b.skill.weight - a.skill.weight).slice(0, 2).map(item => item.skill.label) };
  }).sort((a, b) => a.distance - b.distance || a.player.name.localeCompare(b.player.name)).slice(0, 3);
}
