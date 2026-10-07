// Coach-film links: curated public YouTube breakdowns for each major play
// family. Matched against a play's name and dictionary type, most specific
// families first, generic fallbacks last. Each family carries 2-3 examples —
// its own breakdown plus complementary film (counters, defense, related sets).
export const FILM_LINKS = [
  { match: /spain/i, links: [
    { url: 'https://www.youtube.com/watch?v=omU4uEV7F_Y', label: 'Spain pick-and-roll breakdown' },
    { url: 'https://www.youtube.com/watch?v=7vL-ZozMpNU', label: 'Pick-and-roll defense breakdown' },
  ] },
  { match: /floppy/i, links: [
    { url: 'https://www.youtube.com/watch?v=QzrAWxWYQ_g', label: 'Floppy action breakdown' },
    { url: 'https://www.youtube.com/watch?v=EslHfkE5ANk', label: 'Off-ball movement breakdown' },
  ] },
  { match: /zoom|dho|handoff|pistol|chicago/i, links: [
    { url: 'https://www.youtube.com/watch?v=VRudpp9m1LE', label: 'Zoom / handoff action breakdown' },
    { url: 'https://www.youtube.com/watch?v=EslHfkE5ANk', label: 'Off-ball movement breakdown' },
  ] },
  { match: /ucla/i, links: [
    { url: 'https://www.youtube.com/watch?v=M9aHx83T6Ws', label: 'UCLA cut breakdown' },
    { url: 'https://www.youtube.com/watch?v=EslHfkE5ANk', label: 'Off-ball movement breakdown' },
  ] },
  { match: /princeton/i, links: [
    { url: 'https://www.youtube.com/watch?v=YBW1T5Pl3Sw', label: 'Princeton offense breakdown' },
    { url: 'https://www.youtube.com/watch?v=rHht1_oH_ps', label: 'Motion offense breakdown' },
  ] },
  { match: /triangle/i, links: [
    { url: 'https://www.youtube.com/watch?v=OM3luVS4gG8', label: 'Triangle offense breakdown' },
    { url: 'https://www.youtube.com/watch?v=AZ0n0N3yLSo', label: 'Post play breakdown' },
  ] },
  { match: /horns/i, links: [
    { url: 'https://www.youtube.com/watch?v=FD08YxtV4q8', label: 'Horns set breakdown' },
    { url: 'https://www.youtube.com/watch?v=7vL-ZozMpNU', label: 'Pick-and-roll breakdown' },
  ] },
  { match: /\bblob\b|baseline out/i, links: [
    { url: 'https://www.youtube.com/watch?v=UKlC9RZ-rCA', label: 'BLOB set breakdown' },
    { url: 'https://www.youtube.com/watch?v=5iD1R-9fnTo', label: 'SLOB set breakdown' },
  ] },
  { match: /\bslob\b|sideline out/i, links: [
    { url: 'https://www.youtube.com/watch?v=5iD1R-9fnTo', label: 'SLOB set breakdown' },
    { url: 'https://www.youtube.com/watch?v=UKlC9RZ-rCA', label: 'BLOB set breakdown' },
  ] },
  { match: /press|trap|full-court/i, links: [
    { url: 'https://www.youtube.com/watch?v=Ut5bawgQMYY', label: 'Press break breakdown' },
    { url: 'https://www.youtube.com/watch?v=2OSpPN9_-cI', label: 'Zone offense breakdown' },
  ] },
  { match: /zone/i, links: [
    { url: 'https://www.youtube.com/watch?v=2OSpPN9_-cI', label: 'Zone offense breakdown' },
    { url: 'https://www.youtube.com/watch?v=rHht1_oH_ps', label: 'Motion offense breakdown' },
  ] },
  { match: /pindown|pin-down|flare|elevator|stagger|off-ball/i, links: [
    { url: 'https://www.youtube.com/watch?v=EslHfkE5ANk', label: 'Off-ball movement breakdown' },
    { url: 'https://www.youtube.com/watch?v=ySbe4g-NwGE', label: 'Screen-the-screener breakdown' },
  ] },
  { match: /pick-and-roll|ball-screen/i, links: [
    { url: 'https://www.youtube.com/watch?v=7vL-ZozMpNU', label: 'Pick-and-roll breakdown' },
    { url: 'https://www.youtube.com/watch?v=RZt6WQ51Hwc', label: 'Drop coverage breakdown' },
    { url: 'https://www.youtube.com/watch?v=pBxufBUi360', label: 'Attacking drop coverage' },
  ] },
  { match: /\bpost\b/i, links: [
    { url: 'https://www.youtube.com/watch?v=AZ0n0N3yLSo', label: 'Post play breakdown' },
    { url: 'https://www.youtube.com/watch?v=EslHfkE5ANk', label: 'Off-ball movement breakdown' },
  ] },
  { match: /isolation/i, links: [
    { url: 'https://www.youtube.com/watch?v=vOTZvQy4TuA', label: 'Isolation breakdown' },
    { url: 'https://www.youtube.com/watch?v=7vL-ZozMpNU', label: 'Pick-and-roll breakdown' },
  ] },
  { match: /flex/i, links: [
    { url: 'https://www.youtube.com/watch?v=6cz_LDwC7j4', label: 'Flex offense breakdown' },
    { url: 'https://www.youtube.com/watch?v=2zPwx2ogXMU', label: 'Flex motion system breakdown' },
  ] },
  { match: /swing/i, links: [
    { url: 'https://www.youtube.com/watch?v=cP43qgUL9BY', label: 'Swing offense breakdown' },
    { url: 'https://www.youtube.com/watch?v=rHht1_oH_ps', label: 'Motion offense breakdown' },
  ] },
  { match: /zipper/i, links: [
    { url: 'https://www.youtube.com/watch?v=nOMOBjxm-FE', label: 'Zipper action breakdown' },
    { url: 'https://www.youtube.com/watch?v=EslHfkE5ANk', label: 'Off-ball movement breakdown' },
  ] },
  { match: /iverson/i, links: [
    { url: 'https://www.youtube.com/watch?v=jmuIGPi-9t0', label: 'Iverson cut breakdown' },
    { url: 'https://www.youtube.com/watch?v=2ngd6GLVef8', label: 'Iverson cut plays breakdown' },
  ] },
  { match: /backdoor/i, links: [
    { url: 'https://www.youtube.com/playlist?list=PLO5DgInYakGa5kdxXZbUA3saO7gaOk1Vy', label: 'Backdoor cut breakdowns' },
    { url: 'https://www.youtube.com/watch?v=EslHfkE5ANk', label: 'Off-ball movement breakdown' },
  ] },
  { match: /screen-the-screener/i, links: [
    { url: 'https://www.youtube.com/watch?v=ySbe4g-NwGE', label: 'Screen-the-screener breakdown' },
    { url: 'https://www.youtube.com/watch?v=EslHfkE5ANk', label: 'Off-ball movement breakdown' },
  ] },
  // Ball-screen detail actions: drags, ghosts, keep/short-roll extensions
  { match: /drag|pick-and-pop|pick-and-slip|short roll|re-screen|twist|reject|ghost|\bram\b|p&r|give-and-get|\bkeep\b|miami/i, links: [
    { url: 'https://www.youtube.com/watch?v=7vL-ZozMpNU', label: 'Pick-and-roll breakdown' },
    { url: 'https://www.youtube.com/watch?v=RZt6WQ51Hwc', label: 'Drop coverage breakdown' },
  ] },
  // Transition finishing: early tags, rim runs and skips
  { match: /primary fast break|hit-ahead|rim run|baseline runner|skip-and-drive/i, links: [
    { url: 'https://www.youtube.com/watch?v=_vvHUH94v4s', label: 'Transition offense breakdown' },
    { url: 'https://www.youtube.com/watch?v=rHht1_oH_ps', label: 'Motion offense breakdown' },
  ] },
  // Generic movement actions: cuts, screens and split decisions
  { match: /cross screen|rip screen|wiper|elbow|curl|45 cut|give-and-go|duck-in|\bdive\b|\bhammer\b|short-corner/i, links: [
    { url: 'https://www.youtube.com/watch?v=EslHfkE5ANk', label: 'Movement action breakdown' },
    { url: 'https://www.youtube.com/watch?v=ySbe4g-NwGE', label: 'Screen-the-screener breakdown' },
  ] },
  { match: /shuffle|blocker-mover|delay/i, links: [
    { url: 'https://www.youtube.com/watch?v=rHht1_oH_ps', label: 'Motion offense breakdown' },
    { url: 'https://www.youtube.com/watch?v=cP43qgUL9BY', label: 'Swing offense breakdown' },
  ] },
  { match: /transition|early[-\s]offense|primary break|secondary break|flow/i, links: [
    { url: 'https://www.youtube.com/watch?v=_vvHUH94v4s', label: 'Transition offense breakdown' },
    { url: 'https://www.youtube.com/watch?v=rHht1_oH_ps', label: 'Motion offense breakdown' },
  ] },
  { match: /motion|continuity|read-and-react/i, links: [
    { url: 'https://www.youtube.com/watch?v=rHht1_oH_ps', label: 'Motion offense breakdown' },
    { url: 'https://www.youtube.com/watch?v=_vvHUH94v4s', label: 'Transition offense breakdown' },
  ] },
  // Formation fallbacks: out-of-bounds formations vs floor alignments
  { match: /\bbox\b|diamond|stack|\bline\b|four across/i, links: [
    { url: 'https://www.youtube.com/watch?v=UKlC9RZ-rCA', label: 'Out-of-bounds formation breakdown' },
    { url: 'https://www.youtube.com/watch?v=5iD1R-9fnTo', label: 'SLOB set breakdown' },
  ] },
  { match: /\b5[-\s]?out\b|\b4[-\s]?out\b|\b3[-\s]?out\b|1-4|double high|double low|high[-\s]?low|dunker|empty|spread|overload/i, links: [
    { url: 'https://www.youtube.com/watch?v=rHht1_oH_ps', label: 'Spacing formation breakdown' },
    { url: 'https://www.youtube.com/watch?v=2zPwx2ogXMU', label: 'Flex motion system breakdown' },
  ] },
  { match: /defense|defensive|coverage|drop|switch|deny|\bice\b|hedge|\bshow\b|\bunder\b|at-level|man-to-man|gap man|run-and-jump/i, links: [
    { url: 'https://www.youtube.com/watch?v=7vL-ZozMpNU', label: 'Pick-and-roll defense breakdown' },
    { url: 'https://www.youtube.com/watch?v=6ttbx0xC_ss', label: 'Switching man-to-man breakdown' },
    { url: 'https://www.youtube.com/watch?v=EbhLtoCl2Lk', label: 'Team switching defense film' },
  ] },
];

export function filmLinksForPlay(play) {
  if (!play) return [];
  const haystack = `${play.name} ${play.type || ''}`;
  const found = FILM_LINKS.find((link) => link.match.test(haystack));
  return found ? found.links : [];
}