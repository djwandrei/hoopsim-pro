// Objective weight visualization: a single offense/defense balance bar under
// the fine-tuning sliders, updated live from the slider values. Presentation
// only — the controller still converts the same sliders into the focus mix.

const OFFENSE = ['scoring', 'freeThrowPressure', 'spacing', 'creation'];
const DEFENSE = ['perimeterDefense', 'interiorDefense', 'rebounding'];

export function installWeightBalance(keeper) {
  const grid = keeper.querySelector('#weightGrid');
  const panel = keeper.querySelector('#weightsPanel');
  if (!grid || !panel || panel.querySelector('.ll-balance')) return;
  const bar = document.createElement('div');
  bar.className = 'll-balance';
  grid.after(bar);
  const value = key => Number(keeper.querySelector(`#familyWeight-${key}`)?.value || 0);
  const render = () => {
    const offense = OFFENSE.reduce((sum, key) => sum + value(key), 0);
    const defense = DEFENSE.reduce((sum, key) => sum + value(key), 0);
    const total = offense + defense;
    const offShare = total ? Math.round((offense / total) * 100) : 50;
    const defShare = total ? Math.round((defense / total) * 100) : 50;
    bar.classList.toggle('is-empty', !total);
    bar.innerHTML = `<div class="ll-balance__labels"><span>Offense ${offShare}%</span><span>Defense ${defShare}%</span></div>` +
      `<div class="ll-balance__track"><span style="width:${offShare}%"></span></div>` +
      (total ? '' : '<p class="helper">Set a priority above zero to shape the balance.</p>');
  };
  grid.addEventListener('input', render);
  grid.addEventListener('change', render);
  render();
}