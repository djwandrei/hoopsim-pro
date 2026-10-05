// Move—not clone—the existing submit/reset/cancel buttons. They stay in
// optimizerForm, so the original submit listener and disabled states apply.
export default function commandDock(form) {
  const tray = document.createElement('div');
  tray.className = 'command-actions';
  const phases = document.createElement('span');
  phases.className = 'command-actions__phases';
  phases.textContent = 'Ingestion & Scope · Strategic Weights · Roster Directives · Results Studio';
  const actions = document.createElement('div');
  actions.className = 'command-actions__buttons';
  for (const id of ['resetScenarioButton', 'cancelOptimizeButton', 'optimizeButton']) {
    const button = form.querySelector(`#${id}`);
    if (!button) continue;
    button.classList.add('button');
    if (id !== 'optimizeButton') button.classList.add('button--quiet');
    actions.append(button);
  }
  tray.append(phases, actions);
  form.append(tray);
}