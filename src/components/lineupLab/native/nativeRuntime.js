import workerConnection, { disconnectWorker } from '@/lineupLab/lineup-lab/workerConnection';
import { readSourceText } from '@/lineupLab/lineup-lab/runtimeRelay';
import { ensureSiteConfig } from '@/lineupLab/lineup-lab/toolStyles';
import { installLineupLabBridge } from '@/lineupLab/lineup-lab/siteBridge';
import nativeWorkflow from '@/components/lineupLab/native/nativeWorkflow';
import controllerContract from '@/components/lineupLab/native/controllerContract';

const REV = '?v=20261002c&rev=lineup-v4-share-client-contract-pin-closure-v1';
const WORKFLOW = '/lineup-lab/workflow-state.js?v=20261002c&rev=lineup-workflow-state-phase10-component-reliability-v1-20260928j';

export default async function nativeRuntime(root, signal) {
  await workerConnection(); signal.throwIfAborted();
  const [, original, workflow] = await Promise.all([
    ensureSiteConfig(), readSourceText('/lineup-lab/app.js' + REV), import(/* @vite-ignore */ WORKFLOW),
  ]);
  signal.throwIfAborted();
  controllerContract(root, original);
  installLineupLabBridge();
  const factories = globalThis.__nativeLineupFactories ||= new Map();
  const instance = crypto.randomUUID();
  factories.set(instance, options => nativeWorkflow(root, workflow.saveWorkflowDraft, options));
  // Keep the original data/model controller, but replace its page-moving
  // workflow with an adapter for separately authored React components.
  let source = original.replace(/import\s*\{\s*createWorkflowView\s*\}\s*from\s*["'][^"']+["'];/, `const createWorkflowView = globalThis.__nativeLineupFactories.get(${JSON.stringify(instance)});`);
  source = source.replace(/import\s*\{\s*setCourtContextTeam\s*\}\s*from\s*["'][^"']+["'];/, 'const setCourtContextTeam = code => { const team = typeof code === "string" ? code.trim().toUpperCase() : ""; if (team) document.body.dataset.courtContextTeam = team; else delete document.body.dataset.courtContextTeam; document.body.dispatchEvent(new CustomEvent("djhc-court-context-change", { detail: { team: team || null } })); };');
  source = source.replace(/(["'])(\.{1,2}\/[^"'\s]+)\1/g, (_, quote, path) => JSON.stringify(new URL(path, new URL('/lineup-lab/', location.origin)).href));
  if (source === original || source.includes('from "./workflow-view')) throw new Error('The original Lineup Lab controller contract has changed.');
  source = source.replace(/\binitialize\(\);\s*$/, 'export const ready = initialize();\nexport function dispose() { invalidateDatasetLoad(); cancelCurrentOptimization(); window.clearTimeout(state.toastTimer); }');
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  let runtime;
  try {
    runtime = await import(/* @vite-ignore */ url);
    await runtime.ready;
    if (signal.aborted) { runtime.dispose(); signal.throwIfAborted(); }
  } finally { URL.revokeObjectURL(url); factories.delete(instance); }
  return () => { runtime.dispose(); disconnectWorker(); };
}