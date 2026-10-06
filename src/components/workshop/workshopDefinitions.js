// Workshop experience definitions, ported from the site's definitions.js.
// Preview-only framework: each definition describes a planned tool's setup.
export const WORKSHOP_DEFINITIONS = [
  {
    id: 'rotation-rescue',
    category: 'Rotation Rescue · Rotation challenge',
    prompt: 'Can you build the requested lineup within the rules?',
    fields: [
      { id: 'build-scope', label: 'What you will build', help: 'Choose a starting five or all 240 minutes.', defaultValue: 'best-five', options: [{ value: 'best-five', label: 'Best five' }, { value: 'full-rotation', label: 'Full 240-minute rotation' }] },
      { id: 'challenge-source', label: 'Challenge source', help: 'Pick the challenge set to use.', defaultValue: 'daily', options: [{ value: 'daily', label: 'Daily seed' }, { value: 'weekly', label: 'Weekly feature' }, { value: 'practice', label: 'Practice pool' }] },
      { id: 'difficulty', label: 'Rule level', help: 'Higher levels add more roster and minute rules.', defaultValue: 'standard', options: [{ value: 'rookie', label: 'Rookie' }, { value: 'standard', label: 'Standard' }, { value: 'expert', label: 'Expert' }] },
    ],
    stages: [
      { title: 'Read the brief', summary: 'See the team, player pool, goal, and rules.' },
      { title: 'Build your answer', summary: 'Choose a five or rotation. Your other tools stay unchanged.' },
      { title: 'Review the result', summary: 'See which rules you met and how your answer ranks.' },
    ],
    resultContract: ['Your lineup or rotation', 'Which rules you met', 'How your answer ranks', 'A saved run summary'],
    guardrails: ['No prediction of season wins', 'No hidden minute limits', 'Five-player rows remain exact lineups'],
    connectionPoints: ['optimizer-core.js worker', 'lineup-role-model.js', 'rotation-unit-planner.js', 'versioned challenge pack'],
    nextMilestone: 'Connect one reviewed team-season example to the optimizer and complete one challenge.',
  },
  {
    id: 'swishiq-call',
    category: 'SwishIQ Call · Historical game-plan challenge',
    prompt: 'Which priorities and lineup best answer this historical opponent?',
    fields: [
      { id: 'brief-type', label: 'Opponent brief', help: 'Choose a reviewed opponent profile.', defaultValue: 'balanced', options: [{ value: 'balanced', label: 'Balanced opponent' }, { value: 'paint-pressure', label: 'Paint pressure' }, { value: 'spacing', label: 'Spacing and shooting' }] },
      { id: 'decision-depth', label: 'Decision depth', help: 'Choose priorities or add a five-player answer.', defaultValue: 'priorities-lineup', options: [{ value: 'priorities', label: 'Priorities only' }, { value: 'priorities-lineup', label: 'Priorities and lineup' }] },
      { id: 'reveal-style', label: 'Reveal style', help: 'Each result names its source and limits.', defaultValue: 'guided', options: [{ value: 'guided', label: 'Guided explanation' }, { value: 'side-by-side', label: 'Side-by-side comparison' }] },
    ],
    stages: [
      { title: 'Read the profile', summary: "See the opponent's strengths, sample, and season." },
      { title: 'Make your call', summary: 'Choose priorities, then add a counter-lineup if requested.' },
      { title: 'Review the debrief', summary: 'Compare your choices with the reviewed game-plan helper.' },
    ],
    resultContract: ['Your priorities', 'Your counter-lineup when requested', 'A source-labeled comparison', 'A limits note'],
    guardrails: ['No live injury or schedule claims', 'No unsupported player assignments', 'Observed profile is not proof of tactics'],
    connectionPoints: ['opponent-gameplan.js', 'fan-analytics.js', 'Lineup Lab scenario URL', 'historical team profile adapter'],
    nextMilestone: 'Connect one reviewed opponent profile to the priority model and test the Lineup Lab handoff.',
  },
  {
    id: 'what-breaks-this-five',
    category: 'What Breaks This Five · Lineup explanation game',
    prompt: 'Which missing role or trade-off matters most in this five?',
    fields: [
      { id: 'case-source', label: 'Lineup cases', help: 'Each case uses one reviewed five-player lineup.', defaultValue: 'historical', options: [{ value: 'historical', label: 'Historical lineups' }, { value: 'lab', label: 'Lineup Lab scenarios' }] },
      { id: 'answer-mode', label: 'Answer mode', help: 'Answer choices follow Lineup Lab role definitions.', defaultValue: 'role-gap', options: [{ value: 'role-gap', label: 'Missing role' }, { value: 'trade-off', label: 'Biggest trade-off' }, { value: 'replacement', label: 'Best single change' }] },
      { id: 'reveal-depth', label: 'Reveal depth', help: 'The detailed view labels facts, model results, and proxies.', defaultValue: 'detailed', options: [{ value: 'quick', label: 'Quick answer' }, { value: 'detailed', label: 'Detailed breakdown' }] },
    ],
    stages: [
      { title: 'Inspect the five', summary: 'See the lineup and public facts for each player.' },
      { title: 'Make a diagnosis', summary: 'Choose the role gap, trade-off, or single change.' },
      { title: 'Review the explanation', summary: 'Compare your answer with role coverage and the evidence.' },
    ],
    resultContract: ['The lineup case', 'Your diagnosis', 'A role-coverage explanation', 'One modeled alternative'],
    guardrails: ['Exact five-player lineups only', 'Defensive box-score signals stay proxies', 'Modeled fit is not observed causation'],
    connectionPoints: ['lineup-role-model.js', 'fan-analytics.js', 'optimizer-core.js worker', 'reviewed lineup case bank'],
    nextMilestone: 'Publish one reviewed lineup case and test the diagnosis and Lineup Lab handoff.',
  },
];

export function getWorkshopDefinition(id) {
  return WORKSHOP_DEFINITIONS.find(definition => definition.id === String(id || '').trim()) || WORKSHOP_DEFINITIONS[0] || null;
}