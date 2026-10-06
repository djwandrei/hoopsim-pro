/**
 * Small, browser-safe session state for the simulation workbenches.
 *
 * The season and career engines own their data and report objects. This
 * module only owns the interaction state around those runs so a DOM repaint
 * cannot become the source of truth for a simulation.
 */

const SESSION_STATUSES = new Set([
  'ready', 'running', 'paused', 'cancelling', 'complete', 'failed', 'cancelled', 'reset', 'replay',
]);

function text(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : fallback;
}

function freezeSteps(steps) {
  if (!Array.isArray(steps) || !steps.length) return Object.freeze(['Ready']);
  return Object.freeze(steps.map(step => text(step, 'Step')));
}

function freezeProvenance(provenance) {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) return Object.freeze({});
  return Object.freeze(Object.fromEntries(Object.entries(provenance)
    .filter(([key, value]) => text(key) && text(value))
    .map(([key, value]) => [text(key), text(value)])));
}

function stateSnapshot(state) {
  return Object.freeze({
    ...state,
    steps: Object.freeze([...state.steps]),
    provenance: freezeProvenance(state.provenance),
  });
}

function stepIndex(value, steps, fallback = 0) {
  const index = integer(value, fallback);
  return Math.max(0, Math.min(steps.length - 1, index));
}

function progressValue(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function abortError(message = 'Simulation cancelled.') {
  if (typeof DOMException === 'function') return new DOMException(message, 'AbortError');
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

/**
 * Gate the engine's existing yield points without moving simulation state into
 * the DOM. A pause takes effect at the next model checkpoint and a cancelled
 * signal rejects a paused wait so the engine can finish its normal abort path.
 */
export function createSimulationPauseGate() {
  let paused = false;
  const waiters = new Set();

  const waitWhilePaused = signal => {
    if (signal?.aborted) return Promise.reject(abortError());
    if (!paused) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal, onAbort: null };
      waiter.onAbort = () => {
        waiters.delete(waiter);
        waiter.signal?.removeEventListener('abort', waiter.onAbort);
        reject(abortError());
      };
      waiters.add(waiter);
      signal?.addEventListener('abort', waiter.onAbort, { once: true });
    });
  };

  const yieldToTask = signal => new Promise((resolve, reject) => {
    let timer = null;
    const cleanup = () => {
      if (timer !== null) globalThis.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    // A timer task gives browser input and visibility-change events a turn
    // between simulation batches. Keep this out of the microtask queue so a
    // long run cannot monopolize the event loop.
    timer = globalThis.setTimeout(() => {
      cleanup();
      if (signal?.aborted) {
        reject(abortError());
      } else if (paused) {
        waitWhilePaused(signal).then(resolve, reject);
      } else {
        resolve();
      }
    }, 1);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

  const pause = () => {
    paused = true;
    return paused;
  };
  const resume = () => {
    paused = false;
    [...waiters].forEach(waiter => {
      waiters.delete(waiter);
      waiter.signal?.removeEventListener('abort', waiter.onAbort);
      waiter.resolve();
    });
    return paused;
  };
  const wait = signal => {
    if (signal?.aborted) return Promise.reject(abortError());
    return paused ? waitWhilePaused(signal) : yieldToTask(signal);
  };

  return Object.freeze({
    pause,
    resume,
    wait,
    isPaused: () => paused,
  });
}

/**
 * Create a small observable session state machine. The returned state only
 * describes UI progress; simulation outputs remain owned by the caller.
 */
export function createSimulationSession({
  objective = 'Complete the simulation session.',
  steps = ['Ready', 'Run', 'Review'],
  provenance = {},
  initialStep = 0,
  initialMessage = 'Ready when you are.',
} = {}) {
  const normalizedSteps = freezeSteps(steps);
  const listeners = new Set();
  const sessionIdentity = Object.freeze({});
  let runGeneration = 0;
  let activeRunToken = null;
  let state = stateSnapshot({
    objective: text(objective, 'Complete the simulation session.'),
    steps: normalizedSteps,
    stepIndex: stepIndex(initialStep, normalizedSteps),
    status: 'ready',
    feedback: text(initialMessage, 'Ready when you are.'),
    progress: null,
    actionCount: 0,
    runToken: null,
    lastAction: null,
    canReplay: false,
    canPause: false,
    canResume: false,
    canCancel: false,
    provenance: freezeProvenance(provenance),
  });

  const notify = () => {
    listeners.forEach(listener => {
      try { listener(state); } catch { /* UI observers are optional. */ }
    });
    return state;
  };

  const update = (changes = {}) => {
    const status = SESSION_STATUSES.has(changes.status) ? changes.status : state.status;
    state = stateSnapshot({
      ...state,
      ...changes,
      status,
      objective: text(changes.objective, state.objective),
      steps: normalizedSteps,
      stepIndex: stepIndex(changes.stepIndex, normalizedSteps, state.stepIndex),
      feedback: text(changes.feedback, state.feedback),
      progress: changes.progress === null ? null : progressValue(changes.progress, state.progress),
      provenance: changes.provenance === undefined ? state.provenance : freezeProvenance(changes.provenance),
    });
    return notify();
  };
  const isCurrentRun = runToken => activeRunToken !== null && runToken === activeRunToken;
  const acceptsRunUpdate = (runToken, tokenBound, statuses) => tokenBound
    ? isCurrentRun(runToken) && statuses.includes(state.status)
    : state.status !== 'reset' && statuses.includes(state.status);

  return Object.freeze({
    getState() { return state; },
    subscribe(listener, { emit = true } = {}) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      if (emit) listener(state);
      return () => listeners.delete(listener);
    },
    setStep(nextStep, feedback = state.feedback, status = state.status) {
      return update({ stepIndex: nextStep, feedback, status });
    },
    setProvenance(nextProvenance) {
      return update({ provenance: nextProvenance });
    },
    begin(action = 'run', { step = 1, feedback = 'Simulation is running.' } = {}) {
      activeRunToken = Object.freeze({ session: sessionIdentity, generation: ++runGeneration });
      return update({
        status: 'running',
        stepIndex: step,
        feedback,
        progress: 0,
        actionCount: state.actionCount + 1,
        runToken: activeRunToken,
        lastAction: text(action, 'run'),
        canReplay: false,
        canPause: true,
        canResume: false,
        canCancel: true,
      });
    },
    setProgress(progress, feedback = state.feedback, runToken) {
      if (!acceptsRunUpdate(runToken, arguments.length >= 3, ['running', 'paused'])) return state;
      return update({ progress: progressValue(progress, state.progress), feedback });
    },
    pause(feedback = 'Simulation paused at the last completed checkpoint. Resume when ready.', runToken) {
      if (!acceptsRunUpdate(runToken, arguments.length >= 2, ['running'])) return state;
      return update({ status: 'paused', feedback, lastAction: 'pause', canPause: false, canResume: true, canCancel: true });
    },
    resume(feedback = 'Simulation resumed. Building the next checkpoint.', runToken) {
      if (!acceptsRunUpdate(runToken, arguments.length >= 2, ['paused'])) return state;
      return update({ status: 'running', feedback, lastAction: 'resume', canPause: true, canResume: false, canCancel: true });
    },
    requestCancel(feedback = 'Cancelling the run. No partial result will be saved.', runToken) {
      if (!acceptsRunUpdate(runToken, arguments.length >= 2, ['running', 'paused', 'replay'])) return state;
      return update({ status: 'cancelling', feedback, lastAction: 'cancel', canPause: false, canResume: false, canCancel: false });
    },
    cancelled(feedback = 'Run cancelled. No partial result was saved.', runToken) {
      if (!acceptsRunUpdate(runToken, arguments.length >= 2, ['running', 'paused', 'cancelling'])) return state;
      return update({ status: 'cancelled', feedback, lastAction: 'cancel', canPause: false, canResume: false, canCancel: false, canReplay: false });
    },
    complete(feedback = 'Simulation complete. Review the recorded result.', runToken) {
      const tokenBound = arguments.length >= 2;
      const statuses = tokenBound ? ['running', 'paused'] : ['ready', 'reset', 'running', 'paused'];
      const accepted = tokenBound
        ? acceptsRunUpdate(runToken, true, statuses)
        : statuses.includes(state.status);
      if (!accepted) return state;
      return update({
        status: 'complete',
        stepIndex: normalizedSteps.length - 1,
        feedback,
        progress: 1,
        canReplay: true,
        canPause: false,
        canResume: false,
        canCancel: false,
        lastAction: 'complete',
      });
    },
    fail(feedback = 'Simulation could not be completed.', runToken) {
      const tokenBound = arguments.length >= 2;
      const statuses = tokenBound ? ['running', 'paused', 'cancelling', 'replay'] : ['ready', 'running', 'paused', 'cancelling', 'replay'];
      if (!acceptsRunUpdate(runToken, tokenBound, statuses)) return state;
      return update({ status: 'failed', feedback, lastAction: 'failed', canPause: false, canResume: false, canCancel: false, canReplay: false });
    },
    replay(feedback = 'Replay ready. Run the same setup again to compare the receipt.', runToken) {
      const tokenBound = arguments.length >= 2;
      if ((tokenBound && !isCurrentRun(runToken)) || state.status !== 'complete' || !state.canReplay) return state;
      return update({ status: 'replay', stepIndex: Math.min(1, normalizedSteps.length - 1), feedback, lastAction: 'replay' });
    },
    reset(feedback = 'Session reset. Ready when you are.') {
      activeRunToken = null;
      return update({ status: 'reset', stepIndex: 0, feedback, progress: null, actionCount: 0, runToken: null, lastAction: 'reset', canReplay: false, canPause: false, canResume: false, canCancel: false });
    },
  });
}

function domNode(documentRef, tag, textContent, className) {
  const element = documentRef.createElement(tag);
  if (textContent !== undefined) element.textContent = textContent;
  if (className) element.className = className;
  return element;
}

function appendProvenance(documentRef, root, provenance, {
  retained = false,
  retainedNote = 'The details below are reference context, not a new result. Review the setup above before running.',
} = {}) {
  root.replaceChildren();
  const entries = Object.entries(provenance || {});
  if (!entries.length) return;
  if (retained && text(retainedNote)) {
    root.append(domNode(documentRef, 'p', text(retainedNote), 'swishiq-session-hud__provenance-note'));
  }
  const list = domNode(documentRef, 'dl', undefined, 'swishiq-session-hud__provenance-list');
  entries.forEach(([label, value]) => {
    const item = domNode(documentRef, 'div', undefined, 'swishiq-session-hud__provenance-item');
    item.append(domNode(documentRef, 'dt', label), domNode(documentRef, 'dd', value));
    list.append(item);
  });
  root.append(list);
}

/**
 * Mount a compact DOM HUD and return its session state plus a small update
 * surface. Callers supply the actual reset/replay operations owned by each
 * simulation form.
 */
export function mountSimulationSessionHud(documentRef, parent, {
  id = 'simulationSession',
  objective = 'Complete the simulation session.',
  steps = ['Ready', 'Run', 'Review'],
  provenance = {},
  retainedProvenanceNote = 'The details below are reference context, not a new result. Review the setup above before running.',
  initialMessage = 'Ready when you are.',
  onReset = null,
  onReplay = null,
  onPause = null,
  onResume = null,
  onCancel = null,
} = {}) {
  if (!documentRef || !parent) return null;
  const session = createSimulationSession({ objective, steps, provenance, initialMessage });
  const headingId = `${id}Title`;
  const root = domNode(documentRef, 'section', undefined, 'swishiq-session-hud');
  root.id = id;
  root.dataset.sessionStatus = session.getState().status;
  root.setAttribute('aria-labelledby', headingId);
  const heading = domNode(documentRef, 'h3', objective, 'swishiq-session-hud__title');
  heading.id = headingId;
  const status = domNode(documentRef, 'p', initialMessage, 'swishiq-session-hud__status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.tabIndex = -1;
  const stepList = domNode(documentRef, 'ol', undefined, 'swishiq-session-hud__steps');
  const stepNodes = session.getState().steps.map((label, index) => {
    const item = domNode(documentRef, 'li', undefined, 'swishiq-session-hud__step');
    item.dataset.stepIndex = String(index);
    const marker = domNode(documentRef, 'span', String(index + 1), 'swishiq-session-hud__step-marker');
    marker.setAttribute('aria-hidden', 'true');
    item.append(marker, domNode(documentRef, 'span', label, 'swishiq-session-hud__step-label'));
    stepList.append(item);
    return item;
  });
  const actions = domNode(documentRef, 'div', undefined, 'swishiq-session-hud__actions');
  const pause = domNode(documentRef, 'button', 'Pause run', 'button-secondary');
  pause.type = 'button';
  pause.classList.add('swishiq-session-hud__pause');
  pause.hidden = typeof onPause !== 'function';
  const resume = domNode(documentRef, 'button', 'Resume run', 'button-secondary');
  resume.type = 'button';
  resume.classList.add('swishiq-session-hud__resume');
  resume.hidden = true;
  const cancel = domNode(documentRef, 'button', 'Cancel run', 'button-secondary');
  cancel.type = 'button';
  cancel.classList.add('swishiq-session-hud__cancel');
  cancel.hidden = typeof onCancel !== 'function';
  const replay = domNode(documentRef, 'button', 'Replay last run', 'button-secondary');
  replay.type = 'button';
  replay.classList.add('swishiq-session-hud__replay');
  replay.hidden = true;
  const reset = domNode(documentRef, 'button', 'Reset session', 'button-secondary');
  reset.type = 'button';
  reset.classList.add('swishiq-session-hud__reset');
  actions.append(pause, resume, cancel, replay, reset);
  const progress = domNode(documentRef, 'progress', undefined, 'swishiq-session-hud__progress');
  progress.max = 1;
  progress.value = 0;
  progress.hidden = true;
  progress.style.gridColumn = '1 / -1';
  progress.style.width = '100%';
  progress.setAttribute('aria-label', 'Simulation progress');
  const provenanceRoot = domNode(documentRef, 'div', undefined, 'swishiq-session-hud__provenance');
  appendProvenance(documentRef, provenanceRoot, provenance);
  root.append(
    domNode(documentRef, 'span', 'Session loop', 'swishiq-session-hud__kicker'),
    heading,
    status,
    progress,
    stepList,
    actions,
    provenanceRoot,
  );

  const render = nextState => {
    root.dataset.sessionStatus = nextState.status;
    status.textContent = nextState.feedback;
    appendProvenance(documentRef, provenanceRoot, nextState.provenance, {
      retained: nextState.status === 'reset',
      retainedNote: retainedProvenanceNote,
    });
    const running = nextState.status === 'running';
    const paused = nextState.status === 'paused';
    pause.hidden = typeof onPause !== 'function' || !running || !nextState.canPause;
    resume.hidden = typeof onResume !== 'function' || !paused || !nextState.canResume;
    cancel.hidden = typeof onCancel !== 'function' || !['running', 'paused', 'cancelling'].includes(nextState.status) || !nextState.canCancel;
    cancel.disabled = nextState.status === 'cancelling';
    replay.hidden = typeof onReplay !== 'function' || !nextState.canReplay
      || ['running', 'paused', 'cancelling', 'replay'].includes(nextState.status);
    progress.hidden = !Number.isFinite(nextState.progress);
    if (Number.isFinite(nextState.progress)) progress.value = nextState.progress;
    stepNodes.forEach((item, index) => {
      const active = index === nextState.stepIndex;
      item.classList.toggle('is-active', active);
      item.classList.toggle('is-complete', index < nextState.stepIndex || nextState.status === 'complete');
      if (active) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
  };
  const focusControl = element => {
    const target = element && !element.hidden && !element.disabled ? element : status;
    try { target.focus?.({ preventScroll: true }); } catch { target.focus?.(); }
  };
  const unsubscribe = session.subscribe(render);
  pause.addEventListener('click', () => {
    if (typeof onPause !== 'function') return;
    const previousState = session.getState();
    if (session.pause() === previousState) return;
    try { onPause?.(session); } catch (error) { session.fail(error?.message || 'Pause could not be started.'); }
    focusControl(resume);
  });
  resume.addEventListener('click', () => {
    if (typeof onResume !== 'function') return;
    const previousState = session.getState();
    if (session.resume() === previousState) return;
    try { onResume?.(session); } catch (error) { session.fail(error?.message || 'Resume could not be started.'); }
    focusControl(pause);
  });
  cancel.addEventListener('click', () => {
    if (typeof onCancel !== 'function') return;
    const previousState = session.getState();
    if (session.requestCancel() === previousState) return;
    try { onCancel?.(session); } catch (error) { session.fail(error?.message || 'Cancellation could not be started.'); }
    focusControl(null);
  });
  reset.addEventListener('click', () => {
    session.reset();
    try { onReset?.(session); } catch (error) { session.fail(error?.message || 'Session reset could not be completed.'); }
  });
  replay.addEventListener('click', () => {
    if (typeof onReplay !== 'function') return;
    const previousState = session.getState();
    if (session.replay() === previousState) return;
    try { onReplay?.(session); } catch (error) { session.fail(error?.message || 'Replay could not be started.'); }
    focusControl(null);
  });

  return Object.freeze({
    element: root,
    session,
    updateProvenance(nextProvenance) {
      appendProvenance(documentRef, provenanceRoot, nextProvenance);
      return session.setProvenance(nextProvenance);
    },
    destroy() { unsubscribe(); root.remove(); },
  });
}
