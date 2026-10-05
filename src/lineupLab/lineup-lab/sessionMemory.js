// Session memory for the workflow's native inputs. Values are snapshotted to
// localStorage on change and restored on the next boot, before the auto data
// load, so the desk reopens where the user left off. Pure input mirroring:
// the site's own change handlers stay in charge of all dependent updates.

const SESSION_KEY = 'swishiq-lineup-lab-session';
let restoring = false;

function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return saved && typeof saved === 'object' ? saved : null;
  } catch {
    return null;
  }
}

function controls(keeper) {
  const scope = keeper.querySelector('#workspace') || keeper;
  return [...scope.querySelectorAll('select, input, textarea')]
    .filter(el => el.tagName !== 'BUTTON' && !el.disabled && el.type !== 'file' && el.type !== 'hidden' && !el.hasAttribute('data-ll-designed'));
}

function keyOf(el, index) {
  if (el.id) return `#${el.id}`;
  if (el.name && el.type === 'radio') return `radio:${el.name}:${el.value}`;
  if (el.name) return `name:${el.name}`;
  return `node:${index}`;
}

export function collectInputs(keeper) {
  const data = {};
  controls(keeper).forEach((el, index) => {
    if (el.type === 'radio') {
      if (el.checked) data[keyOf(el, index)] = true;
    } else if (el.type === 'checkbox') {
      data[keyOf(el, index)] = el.checked;
    } else {
      data[keyOf(el, index)] = el.value;
    }
  });
  return data;
}

// Applies saved values and lets the native change handlers run. Returns how
// many fields actually changed, so callers can retry until a pass settles
// (season choices repopulate downstream options asynchronously).
export function restoreInputs(keeper, data) {
  if (!data || typeof data !== 'object') return 0;
  let applied = 0;
  controls(keeper).forEach((el, index) => {
    const key = keyOf(el, index);
    if (!(key in data)) return;
    if (el.type === 'radio' || el.type === 'checkbox') {
      const wanted = Boolean(data[key]);
      if (el.checked === wanted) return;
      el.checked = wanted;
    } else if (el.tagName === 'SELECT') {
      const wanted = String(data[key]);
      if (el.value === wanted || ![...el.options].some(option => option.value === wanted)) return;
      el.value = wanted;
    } else {
      const wanted = String(data[key] ?? '');
      if (el.value === wanted) return;
      el.value = wanted;
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    applied += 1;
  });
  return applied;
}

// Restore in settling passes: each pass applies what its predecessors made
// possible (season first, then team, then everything else). Stops when a pass
// changes nothing or the pass budget runs out.
export async function restoreSessionInputs(keeper) {
  const saved = readSaved();
  if (!saved) return;
  restoring = true;
  try {
    const settle = () => new Promise(resolve => setTimeout(resolve, 350));
    for (let pass = 0; pass < 5; pass += 1) {
      if ((await Promise.resolve(restoreInputs(keeper, saved))) === 0) break;
      await settle();
    }
  } finally {
    restoring = false;
  }
}

export function installSessionMemory(keeper) {
  const scope = keeper.querySelector('#workspace') || keeper;
  let timer;
  scope.addEventListener('change', () => {
    if (restoring) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(collectInputs(keeper)));
      } catch {
        // Private-browsing storage quotas are non-fatal; memory is best effort.
      }
    }, 400);
  });
}