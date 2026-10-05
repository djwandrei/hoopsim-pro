// Post-boot enhancements that ride alongside the site's own workflow without
// touching its logic: a one-tap auto data load, and CSV/image export of the
// result desk. Everything re-uses the site's real buttons and DOM state.

export function installToolExtras(keeper) {
  autoLoadData(keeper);
  installResultExports(keeper);
}

let autoLoaded = false;

// The site's "Load live data" button is the gateway into the workflow. Click
// it once on boot with its native defaults so the desk is ready immediately;
// users can still change season/team and press it again themselves.
function autoLoadData(keeper) {
  if (autoLoaded) return;
  const button = keeper.querySelector('#loadLiveDataButton');
  if (!button || button.disabled) return;
  autoLoaded = true;
  setTimeout(() => {
    if (button.isConnected && !button.disabled) button.click();
  }, 400);
}

function installResultExports(keeper) {
  const results = keeper.querySelector('#results');
  if (!results) return;
  const attach = () => {
    if (!results.querySelector('.command-export-bar')) {
      results.prepend(buildExportBar());
    }
  };
  attach();
  new MutationObserver(attach).observe(results, { childList: true });
}

function buildExportBar() {
  const bar = document.createElement('div');
  bar.className = 'command-export-bar';
  const csvButton = document.createElement('button');
  csvButton.type = 'button';
  csvButton.className = 'button-secondary';
  csvButton.textContent = 'Export CSV';
  csvButton.addEventListener('click', () => exportCsv(bar.closest('#results')));
  const imageButton = document.createElement('button');
  imageButton.type = 'button';
  imageButton.className = 'button-secondary';
  imageButton.textContent = 'Export image';
  imageButton.addEventListener('click', () => exportImage(imageButton, bar.closest('#results')));
  bar.append(csvButton, imageButton);
  return bar;
}

function tableToCsv(table) {
  return [...table.querySelectorAll('tr')].map(tr =>
    [...tr.children].map(cell => {
      const text = (cell.innerText || cell.textContent || '').replace(/\s+/g, ' ').trim();
      return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }).join(',')).join('\n');
}

function exportCsv(results) {
  const tables = [...results.querySelectorAll('table')];
  if (!tables.length) return;
  const blob = new Blob([tables.map(tableToCsv).join('\n\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'lineup-lab-results.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportImage(button, results) {
  if (!results || button.disabled) return;
  button.disabled = true;
  button.textContent = 'Rendering…';
  try {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(results, { backgroundColor: null, scale: 2 });
    const link = document.createElement('a');
    link.download = 'lineup-lab-results.png';
    link.href = canvas.toDataURL('image/png');
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    button.disabled = false;
    button.textContent = 'Export image';
  }
}