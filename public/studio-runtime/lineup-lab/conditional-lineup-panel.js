import {
  conditionalLineupModelEntry, loadConditionalLineupModel, predictPublishedConditionalLineup,
} from './conditional-lineup-model.js?v=20261008n&rev=conditional-lineup-publication-v1';

/** Separate conditional scoring output; it never changes the optimizer's
 * objective, selected roster, minute allocation, or existing Impact gate. */
export function createConditionalLineupPanel({ document, result, selection, teamNames, loadOpponent, isCurrent }) {
  const section = document.createElement('details');
  section.className = 'result-card conditional-lineup-projection';
  const summary = document.createElement('summary');
  summary.textContent = 'Conditional lineup projection · validated scoring model';
  const intro = document.createElement('p');
  intro.textContent = 'Choose two explicit fives to estimate their scoring and net rates against each other. This is separate from the optimizer ranking and the 240-minute planning totals.';
  section.append(summary, intro);
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  section.append(status);
  const entry = conditionalLineupModelEntry(selection?.season, selection?.seasonPhase);
  if (!entry || !selection?.team || !result?.best?.players?.length) {
    status.textContent = 'Available for 2022–23 through 2025–26 regular-season NBA rosters. No model from another season or phase is substituted.';
    return section;
  }
  status.textContent = `Frozen ${entry.seasonEndYear - 1}–${String(entry.seasonEndYear).slice(-2)} model · fit through ${entry.observedThroughLocalDate}. Open to select the two fives.`;
  let initialized = false;
  section.addEventListener('toggle', () => {
    if (!section.open || initialized) return;
    initialized = true;
    void initialize().catch(error => { if (section.isConnected) status.textContent = error.message; });
  });
  async function initialize() {
    status.textContent = 'Loading the integrity-checked exact-season lineup model…';
    const model = await loadConditionalLineupModel(selection.season, selection.seasonPhase);
    if (!section.isConnected) return;
    const current = () => {
      if (isCurrent()) return true;
      status.textContent = 'The optimizer setup changed. Run a new build before making another conditional projection.';
      return false;
    };
    const note = document.createElement('p');
    note.className = 'helper';
    note.textContent = `Chronological conditional validation passed 12/12 checks across 1,028 heldout games. This snapshot uses fitting history only through ${model.observedThroughLocalDate}. Your five defaults to the five largest assigned minute allocations (or your starting five); both selections remain editable. This does not infer who will be available.`;
    const controls = document.createElement('div');
    controls.className = 'input-stability-controls';
    const field = (title, options, id) => {
      const label = document.createElement('label'); label.className = 'field';
      const text = document.createElement('span'); text.textContent = title;
      const select = document.createElement('select'); select.id = id; select.setAttribute('aria-label', title);
      for (const [value, name] of options) {
        const option = document.createElement('option'); option.value = value; option.textContent = name; select.append(option);
      }
      label.append(text, select); return { label, select };
    };
    const venue = field('Your team plays', [['home', 'At home'], ['away', 'Away']], 'conditional-lineup-venue');
    const opponentTeam = field('Conditional opponent', [['', 'Choose opposing team'], ...Object.entries(teamNames)
      .filter(([code]) => code !== selection.team)], 'conditional-lineup-opponent');
    controls.append(venue.label, opponentTeam.label);
    const ownHeading = document.createElement('h4'); ownHeading.textContent = 'Your specified five';
    const ownControls = document.createElement('div'); ownControls.className = 'input-stability-controls';
    const allocations = new Map((result.best.rotation?.allocations || []).map(row => [row.id, row.minutes]));
    const ownPlayers = [...result.best.players].sort((a, b) => (allocations.get(b.id) || 0) - (allocations.get(a.id) || 0));
    const ownSelects = Array.from({ length: 5 }, (_, i) => {
      const choice = field(`Your player ${i + 1}`, ownPlayers.map(player => [player.id, player.name]), `conditional-lineup-own-${i + 1}`);
      choice.select.value = ownPlayers[i].id; ownControls.append(choice.label); return choice.select;
    });
    const opponentHeading = document.createElement('h4'); opponentHeading.textContent = 'Opposing specified five';
    const opponentControls = document.createElement('div'); opponentControls.className = 'input-stability-controls';
    const opponentHint = document.createElement('p'); opponentHint.className = 'helper';
    opponentHint.textContent = 'Choose an opposing team to load its exact-season roster. The initial five will be its five highest-MPG players, for you to review and change.';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'button button--secondary';
    button.textContent = 'Project these two fives'; button.disabled = true;
    const output = document.createElement('div'); output.setAttribute('aria-live', 'polite');
    const limitations = document.createElement('p'); limitations.className = 'helper';
    limitations.textContent = 'Rates are points per 100 matched offensive possessions, not final game scores or win probabilities. Validation covers observed paired fives; a hypothetical optimized selection is a conditional scenario, not proof that this is the best real-world lineup. Pregame availability, chemistry, fatigue, and rotation outcomes are not certified by this model.';
    const provenance = document.createElement('p'); provenance.className = 'result-passport__note';
    provenance.textContent = `Model: ${model.modelVersion} · ridge ${model.lambda} · coefficient hash ${model.modelSha256.slice(0, 16)}. Unknown fitted players use a disclosed zero-centered ridge prior.`;
    section.append(note, controls, ownHeading, ownControls, opponentHeading, opponentHint, opponentControls,
      button, output, limitations, provenance);
    let opponentPlayers = [], opponentSelects = [], generation = 0;
    const clearOutput = () => {
      output.replaceChildren();
      status.textContent = 'Selections changed. Review both fives, then project again.';
    };
    venue.select.addEventListener('change', clearOutput);
    ownSelects.forEach(select => select.addEventListener('change', clearOutput));
    opponentTeam.select.addEventListener('change', async () => {
      const token = ++generation, team = opponentTeam.select.value;
      button.disabled = true; opponentControls.replaceChildren(); output.replaceChildren();
      opponentPlayers = []; opponentSelects = [];
      if (!current() || !team) return;
      status.textContent = `Loading ${teamNames[team]} exact-season roster…`;
      try {
        const loaded = await loadOpponent({ team, seasonEndYear: selection.season, seasonPhase: selection.seasonPhase });
        if (token !== generation || !section.isConnected || !current()) return;
        opponentPlayers = [...loaded.dataset.players].sort((a, b) => b.minutes - a.minutes);
        if (opponentPlayers.length < 5) throw new Error('This opponent roster has fewer than five players. Choose another team.');
        opponentSelects = Array.from({ length: 5 }, (_, i) => {
          const choice = field(`Opposing player ${i + 1}`, opponentPlayers.map(player => [player.id, player.name]), `conditional-lineup-away-${i + 1}`);
          choice.select.value = opponentPlayers[i].id; choice.select.addEventListener('change', clearOutput);
          opponentControls.append(choice.label); return choice.select;
        });
        button.disabled = false;
        status.textContent = 'Both explicit fives are ready for review. Project only after confirming your selections.';
      } catch (error) { if (token === generation && section.isConnected) status.textContent = error.message; }
    });
    button.addEventListener('click', () => {
      if (!current()) return;
      output.replaceChildren();
      try {
        const own = ownSelects.map(select => ownPlayers.find(player => player.id === select.value));
        const opponent = opponentSelects.map(select => opponentPlayers.find(player => player.id === select.value));
        const prediction = predictPublishedConditionalLineup(model, own, opponent, { venue: venue.select.value });
        const grid = document.createElement('dl'); grid.className = 'result-passport__metrics';
        for (const [label, value] of [[`${selection.team} scoring rate`, prediction.ownRate],
          [`${opponentTeam.select.value} scoring rate`, prediction.opponentRate], [`${selection.team} net rate`, prediction.netRate]]) {
          const row = document.createElement('div'), term = document.createElement('dt'), detail = document.createElement('dd');
          term.textContent = label; detail.textContent = value.toFixed(2); row.append(term, detail); grid.append(row);
        }
        const fives = document.createElement('p');
        fives.textContent = `${selection.team}: ${own.map(player => player.name).join(', ')}. ${opponentTeam.select.value}: ${opponent.map(player => player.name).join(', ')}. Your venue: ${prediction.venue}.`;
        const coverage = document.createElement('p');
        coverage.textContent = `${10 - prediction.unknownPlayers.length}/10 players have fitted history.`
          + (prediction.unknownPlayers.length ? ` Zero-centered prior: ${prediction.unknownPlayers.join(', ')}.` : '')
          + (prediction.limitedHistoryPlayers.length ? ` Limited history (under 200 paired possessions): ${prediction.limitedHistoryPlayers.join(', ')}.` : '');
        output.append(grid, fives, coverage);
        status.textContent = 'Conditional projection ready · points per 100 matched offensive possessions.';
      } catch (error) { status.textContent = error.message; }
    });
    status.textContent = 'Pinned model verified. Choose the opposing team and review both fives.';
  }
  return section;
}
