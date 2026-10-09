import workerConnection, { disconnectWorker } from '@/lineupLab/lineup-lab/workerConnection';
import { readSourceText } from '@/lineupLab/lineup-lab/runtimeRelay';
import { ensureSiteConfig } from '@/lineupLab/lineup-lab/toolStyles';
import { installLineupLabBridge } from '@/lineupLab/lineup-lab/siteBridge';
import nativeWorkflow from '@/components/lineupLab/native/nativeWorkflow';
import controllerContract from '@/components/lineupLab/native/controllerContract';

const REV = '?v=20261002c&rev=lineup-v4-share-client-contract-pin-closure-v1';
const WORKFLOW = '/lineup-lab/workflow-state.js?v=20261002c&rev=lineup-workflow-state-phase10-component-reliability-v1-20260928j';
// Compute the public-dir URL at runtime: a static-looking import specifier
// makes the dev server try to transform a /public file, which refuses it.
const workflowUrl = new URL(WORKFLOW, location.origin).href;
const controllerUrl = new URL(`${import.meta.env.BASE_URL}djhc-runtime/lineup-controller.js`, location.origin).href;

export default async function nativeRuntime(root, signal) {
  await workerConnection(); signal.throwIfAborted();
  const [, original, workflow, controller] = await Promise.all([
    ensureSiteConfig(), readSourceText('/lineup-lab/app.js' + REV), import(/* @vite-ignore */ workflowUrl), import(/* @vite-ignore */ controllerUrl),
  ]);
  signal.throwIfAborted();
  controllerContract(root, original);
  installLineupLabBridge();
  const setCourtContextTeam = code => {
    const team = typeof code === 'string' ? code.trim().toUpperCase() : '';
    if (team) document.body.dataset.courtContextTeam = team;
    else delete document.body.dataset.courtContextTeam;
    document.body.dispatchEvent(new CustomEvent('djhc-court-context-change', { detail: { team: team || null } }));
  };
  if (typeof controller.mountLineupController !== 'function') throw new Error('The generated Lineup Lab controller is unavailable.');
  const runtime = controller.mountLineupController(
    options => nativeWorkflow(root, workflow.saveWorkflowDraft, options),
    setCourtContextTeam,
  );
  await runtime.ready;
  if (signal.aborted) { runtime.dispose(); signal.throwIfAborted(); }
  return () => { runtime.dispose(); disconnectWorker(); };
}
