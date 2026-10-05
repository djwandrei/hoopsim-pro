// Run journal: after every solve it captures the group and renders (1) an
// "at a glance" summary strip and (2) an opt-in diff against the previous
// run. Presentation only — the controller's own result views are untouched.

export function installRunJournal(keeper) {
  const results = keeper.querySelector('#results');
  const content = results?.querySelector('#resultContent');
  if (!results || !content) return;
  const heading = results.querySelector('.results__heading');
  const strip = document.createElement('div');
  strip.className = 'll-run-summary';
  strip.hidden = true;
  const diffPanel = document.createElement('div');
  diffPanel.className = 'll-run-diff';
  diffPanel.hidden = true;
  heading?.after(strip, diffPanel);

  const runs = [];
  let showDiff = false;

  const readLineup = () => {
    const names = [...content.querySelectorAll('.lineup-player .player-name strong, .minutes-list__player strong')]
      .map(node => node.textContent.trim()).filter(Boolean);
    return [...new Set(names)];
  };

  const readScore = () => {
    const card = [...content.querySelectorAll('.score-card')]
      .find(c => /objective|overall|score/i.test(c.querySelector('span')?.textContent || ''));
    return card?.querySelector('strong')?.textContent.trim() || '';
  };

  const chip = (state, text) => {
    const chip = document.createElement('span');
    chip.className = `ll-chip${state ? ` is-${state}` : ''}`;
    chip.textContent = text;
    return chip;
  };

  const renderDiff = run => {
    const previous = runs[runs.indexOf(run) - 1];
    if (!showDiff || !previous) { diffPanel.hidden = true; return; }
    const gone = previous.lineup.filter(name => !run.lineup.includes(name));
    const added = run.lineup.filter(name => !previous.lineup.includes(name));
    const title = document.createElement('h3');
    title.textContent = `Diff vs ${previous.label}`;
    const chips = document.createElement('div');
    chips.className = 'll-run-diff__chips';
    chips.append(
      ...gone.map(name => chip('fail', `Out: ${name}`)),
      ...added.map(name => chip('ok', `In: ${name}`)),
    );
    if (!gone.length && !added.length) chips.append(chip('ok', 'Same group — settings changed the readout only'));
    diffPanel.replaceChildren(title, chips);
    diffPanel.hidden = false;
  };

  const render = () => {
    const lineup = readLineup();
    if (!lineup.length) { strip.hidden = true; diffPanel.hidden = true; return; }
    const score = readScore();
    const previous = runs[runs.length - 1];
    if (previous && previous.lineup.join('|') === lineup.join('|') && previous.score === score) return;
    const run = { label: `Run ${runs.length + 1}`, lineup, score };
    runs.push(run);
    if (runs.length > 10) runs.shift();
    const kept = previous ? previous.lineup.filter(name => run.lineup.includes(name)).length : null;
    strip.replaceChildren();
    const headline = document.createElement('strong');
    headline.textContent = `${run.label} · ${lineup[0]} headlines`;
    strip.append(headline);
    if (previous) strip.append(chip('ok', `${kept} of ${lineup.length} kept from ${previous.label}`));
    if (run.score) strip.append(chip(null, `Score ${run.score}`));
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'text-button';
    toggle.textContent = showDiff ? 'Hide diff' : 'Diff vs previous run';
    toggle.addEventListener('click', () => {
      showDiff = !showDiff;
      toggle.textContent = showDiff ? 'Hide diff' : 'Diff vs previous run';
      renderDiff(run);
    });
    strip.append(toggle);
    strip.hidden = false;
    renderDiff(run);
  };

  new MutationObserver(render).observe(content, { childList: true, subtree: true });
}