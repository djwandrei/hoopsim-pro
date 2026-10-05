const stages = [
  ['Ingestion & Scope', 'Team and season', '#liveDataPanel'],
  ['Strategic Weights', 'Game plan and rules', '[aria-labelledby="scenarioHeading"]'],
  ['Roster Directives', 'Players', '[aria-labelledby="playersHeading"]'],
  ['Results Studio', 'Results', '.run-card'],
];

export default function commandStages(view, form) {
  const navigation = document.createElement('nav');
  navigation.className = 'command-stages';
  navigation.setAttribute('aria-label', 'Builder phases');
  for (const [label, description, selector] of stages) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'command-stage';
    const title = document.createElement('strong');
    title.textContent = label;
    const detail = document.createElement('span');
    detail.textContent = description;
    button.append(title, detail);
    button.addEventListener('click', () => {
      const result = view.querySelector('#results');
      const target = label === 'Results Studio' && result && !result.hidden
        ? result : view.querySelector(selector);
      target?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
    navigation.append(button);
  }
  form.before(navigation);
}