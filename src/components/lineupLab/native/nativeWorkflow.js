import nativeErrors from '@/components/lineupLab/native/nativeErrors';

// Presentation adapter only: the reviewed controller still owns validation,
// all input defaults, feasibility, exact search, passports and result actions.
export default function nativeWorkflow(root, saveWorkflowDraft, options) {
  const { state, form, capture, validate, storage } = options;
  const workflow = state.workflow = { current: 'review', furthest: 4, ready: false, hasChanges: false };
  const settings = root.querySelector('#nativeSettings');
  let queued = false;
  const save = () => {
    if (root.isConnected && workflow.ready && state.dataset && !state.liveDataLoading) {
      workflow.form = capture(); workflow.saved = saveWorkflowDraft(storage, workflow, workflow.form);
    }
  };
  const busy = value => {
    settings.disabled = value;
    root.querySelectorAll('.experience-switcher button, .tool-nav button').forEach(button => { button.disabled = value; });
  };
  const refresh = () => {
    if (queued) return;
    queued = true; queueMicrotask(() => {
      queued = false;
      root.querySelector('#coachingBrief').hidden = root.querySelector('#presetGrid').hidden;
      save();
    });
  };
  form.addEventListener('input', refresh); form.addEventListener('change', refresh);
  return {
    refresh,
    changed() { workflow.hasChanges = true; refresh(); },
    ready() { workflow.ready = true; save(); },
    beforeSubmit() {
      if (!workflow.ready || workflow.current === 'running') return false;
      const errors = validate(); nativeErrors(root, errors); return !errors.length;
    },
    start() { workflow.current = 'running'; busy(true); },
    finish() { workflow.current = 'results'; busy(false); save(); root.querySelector('#results').scrollIntoView({ block: 'start', behavior: 'instant' }); },
    cancelled() { workflow.current = 'review'; busy(false); refresh(); },
  };
}