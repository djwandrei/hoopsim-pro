// Coach-film links: curated public YouTube breakdowns for each major play
// family. Matched against a play's name and dictionary type, most specific
// families first, generic fallbacks last.
export const FILM_LINKS = [
  { match: /spain/i, url: 'https://www.youtube.com/watch?v=omU4uEV7F_Y', label: 'Spain pick-and-roll breakdown' },
  { match: /floppy/i, url: 'https://www.youtube.com/watch?v=QzrAWxWYQ_g', label: 'Floppy action breakdown' },
  { match: /zoom|dho|handoff|pistol|chicago/i, url: 'https://www.youtube.com/watch?v=VRudpp9m1LE', label: 'Zoom / handoff action breakdown' },
  { match: /ucla/i, url: 'https://www.youtube.com/watch?v=M9aHx83T6Ws', label: 'UCLA cut breakdown' },
  { match: /princeton/i, url: 'https://www.youtube.com/watch?v=YBW1T5Pl3Sw', label: 'Princeton offense breakdown' },
  { match: /triangle/i, url: 'https://www.youtube.com/watch?v=OM3luVS4gG8', label: 'Triangle offense breakdown' },
  { match: /horns/i, url: 'https://www.youtube.com/watch?v=FD08YxtV4q8', label: 'Horns set breakdown' },
  { match: /\bblob\b|baseline out/i, url: 'https://www.youtube.com/watch?v=UKlC9RZ-rCA', label: 'BLOB set breakdown' },
  { match: /\bslob\b|sideline out/i, url: 'https://www.youtube.com/watch?v=5iD1R-9fnTo', label: 'SLOB set breakdown' },
  { match: /press|trap|full-court/i, url: 'https://www.youtube.com/watch?v=Ut5bawgQMYY', label: 'Press break breakdown' },
  { match: /zone/i, url: 'https://www.youtube.com/watch?v=2OSpPN9_-cI', label: 'Zone offense breakdown' },
  { match: /pindown|pin-down|flare|elevator|stagger|off-ball/i, url: 'https://www.youtube.com/watch?v=EslHfkE5ANk', label: 'Off-ball movement breakdown' },
  { match: /pick-and-roll|ball-screen/i, url: 'https://www.youtube.com/watch?v=7vL-ZozMpNU', label: 'Pick-and-roll breakdown' },
  { match: /\bpost\b/i, url: 'https://www.youtube.com/watch?v=AZ0n0N3yLSo', label: 'Post play breakdown' },
  { match: /isolation/i, url: 'https://www.youtube.com/watch?v=vOTZvQy4TuA', label: 'Isolation breakdown' },
  { match: /flex/i, url: 'https://www.youtube.com/watch?v=6cz_LDwC7j4', label: 'Flex offense breakdown' },
  { match: /swing/i, url: 'https://www.youtube.com/watch?v=cP43qgUL9BY', label: 'Swing offense breakdown' },
  { match: /zipper/i, url: 'https://www.youtube.com/watch?v=nOMOBjxm-FE', label: 'Zipper action breakdown' },
  { match: /iverson/i, url: 'https://www.youtube.com/watch?v=jmuIGPi-9t0', label: 'Iverson cut breakdown' },
  { match: /backdoor/i, url: 'https://www.youtube.com/playlist?list=PLO5DgInYakGa5kdxXZbUA3saO7gaOk1Vy', label: 'Backdoor cut breakdown' },
  { match: /screen-the-screener/i, url: 'https://www.youtube.com/watch?v=ySbe4g-NwGE', label: 'Screen-the-screener breakdown' },
  // Ball-screen detail actions: drags, ghosts, keep/short-roll extensions
  { match: /drag|pick-and-pop|pick-and-slip|short roll|re-screen|twist|reject|ghost|\bram\b|p&r|give-and-get|\bkeep\b|miami/i, url: 'https://www.youtube.com/watch?v=7vL-ZozMpNU', label: 'Pick-and-roll breakdown' },
  // Transition finishing: early tags, rim runs and skips
  { match: /primary fast break|hit-ahead|rim run|baseline runner|skip-and-drive/i, url: 'https://www.youtube.com/watch?v=_vvHUH94v4s', label: 'Transition offense breakdown' },
  // Generic movement actions: cuts, screens and split decisions
  { match: /cross screen|rip screen|wiper|elbow|curl|45 cut|give-and-go|duck-in|\bdive\b|\bhammer\b|short-corner/i, url: 'https://www.youtube.com/watch?v=EslHfkE5ANk', label: 'Movement action breakdown' },
  { match: /shuffle|blocker-mover|delay/i, url: 'https://www.youtube.com/watch?v=rHht1_oH_ps', label: 'Motion offense breakdown' },
  { match: /transition|early[-\s]offense|primary break|secondary break|flow/i, url: 'https://www.youtube.com/watch?v=_vvHUH94v4s', label: 'Transition offense breakdown' },
  { match: /motion|continuity|read-and-react/i, url: 'https://www.youtube.com/watch?v=rHht1_oH_ps', label: 'Motion offense breakdown' },
  // Formation fallbacks: out-of-bounds formations vs floor alignments
  { match: /\bbox\b|diamond|stack|\bline\b|four across/i, url: 'https://www.youtube.com/watch?v=UKlC9RZ-rCA', label: 'Out-of-bounds formation breakdown' },
  { match: /\b5[-\s]?out\b|\b4[-\s]?out\b|\b3[-\s]?out\b|1-4|double high|double low|high[-\s]?low|dunker|empty|spread|overload/i, url: 'https://www.youtube.com/watch?v=rHht1_oH_ps', label: 'Spacing formation breakdown' },
  { match: /defense|defensive|coverage|drop|switch|deny|\bice\b|hedge|\bshow\b|\bunder\b|at-level|man-to-man|gap man|run-and-jump/i, url: 'https://www.youtube.com/watch?v=7vL-ZozMpNU', label: 'Defensive scheme breakdown' },
];

export function filmLinkForPlay(play) {
  if (!play) return null;
  const haystack = `${play.name} ${play.type || ''}`;
  const found = FILM_LINKS.find((link) => link.match.test(haystack));
  return found ? { url: found.url, label: found.label } : null;
}