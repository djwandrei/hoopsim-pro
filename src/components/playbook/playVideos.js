import { NBA_FILM } from '@/components/playbook/nbaFilmCatalog';
// Specific action names first. Related sets are never labelled exact matches.
export const FILM_LINKS = [
  { match: /^horns/i, sources: ['horns'], exact: ['horns'] },
  { match: /spain/i, sources: ['spain'], exact: ['spain-pick-and-roll'] },
  { match: /\b(?:blob|slob)\b|^box|^diamond|stack|^line$|four across/i, sources: ['inbound'] },
  { match: /backdoor|backcut/i, sources: ['backdoor'], exact: ['backdoor-cut'] },
  { match: /inverted/i, sources: ['inverted', 'pnr'], exact: ['inverted-pick-and-roll'] },
  { match: /empty|pistol|21/i, sources: ['empty'] },
  { match: /zoom|chicago|miami action/i, sources: ['zoom', 'dho'] },
  { match: /dho|handoff|give-and-get|^get|^keep|delay/i, sources: ['dho', 'nuggets'], exact: ['basic-dribble-handoff'] },
  { match: /zone|overload|high-post flash|short-corner flash|baseline runner|skip-and-drive/i, sources: ['zone'], exact: ['2-3-zone', 'ball-screen-vs-zone', 'high-low-vs-zone'] },
  { match: /drop/i, sources: ['drop'], exact: ['drop-coverage'] },
  { match: /switch|man-to-man|gap man|pack line|hedge|blitz|trap|ice|under|at-level/i, sources: ['switch', 'pnr'] },
  { match: /press|run-and-jump|transition|fast break|hit-ahead|rim run|early|flow into/i, sources: ['transition'] },
  { match: /double drag|stagger/i, sources: ['drag', 'pnr'] },
  { match: /pick-and|ball-screen|ghost|re-screen|reject|ram|^p&r|^drag|short roll/i, sources: ['pnr', 'drop'], exact: ['basic-pick-and-roll'] },
  { match: /post|punch|wedge|high-low|dunker|short-corner/i, sources: ['post', 'zone'] },
  { match: /give-and-go|^dive$|duck-in|elbow split|cut|screen|pindown|floppy|elevator|hammer|wiper|flex|ucla|iverson|zipper/i, sources: ['offball', 'backdoor'] },
  { match: /isolation/i, sources: ['switch', 'post'] },
  { match: /motion|princeton|triangle|shuffle|swing|blocker|continuity|read-and-react|5-out|4-out|3-out|1-4|spread|double high|double low/i, sources: ['nuggets'] },
];
export function filmLinksForPlay(play) {
  if (!play) return [];
  const found = FILM_LINKS.find(rule => rule.match.test(play.name));
  if (!found) return [];
  return found.sources.map((source, index) => ({
    ...NBA_FILM[source], source,
    relation: index === 0 && found.exact?.includes(play.id) ? 'Same action' : 'Related game film',
  }));
}