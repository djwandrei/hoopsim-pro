// Spin Room pool templates: recent control-desk setups saved in this browser
// so rebuilding a favorite pool is one click. Same storage pattern as pack
// history: engine-tagged, capped list, memory-only if storage is unavailable.
import { safeStorage } from '@/lib/safeStorage';

const KEY = 'swishiq-spin-templates';
const MAX_TEMPLATES = 6;

export function readSpinTemplates() {
  try {
    const parsed = JSON.parse(safeStorage()?.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, MAX_TEMPLATES) : [];
  } catch { return []; }
}

export function prependSpinTemplate(template) {
  const next = [template, ...readSpinTemplates().filter((item) => item.label !== template.label)].slice(0, MAX_TEMPLATES);
  try { safeStorage()?.setItem(KEY, JSON.stringify(next)); } catch { /* memory-only */ }
  return next;
}

export function removeSpinTemplate(label) {
  const next = readSpinTemplates().filter((item) => item.label !== label);
  try { safeStorage()?.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}