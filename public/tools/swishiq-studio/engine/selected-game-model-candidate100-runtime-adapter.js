/* Owner-authorized Candidate100 release. Numerical validity remains a separate
 * result. Same-origin static modules keep this loader compatible with site CSP. */
import * as entry from './candidate100-release-20261008/game-lab-candidate100-pruned-total-model-blend090-v1.mjs';

export const SELECTED_GAME_MODEL_ID = 'game-lab-candidate100';
export const SELECTED_GAME_MODEL_BUNDLE_SHA256 = "0b03e7a5d9d4da1cbf562f5bc01d57ca621332339109c00a60a6080e24ce2a0a";
const bundleUrl = new URL('/tools/swishiq-studio/engine/candidate100-release-20261008/bundle.json', globalThis.location?.href || import.meta.url);
const cached = new Map();
const stable = v => Array.isArray(v) ? '[' + v.map(stable).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}' : JSON.stringify(v);
async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2,'0')).join('');
}
async function readPinned(fetchImpl, descriptor, signal) {
  if (!/^[a-zA-Z0-9._-]+$/.test(descriptor.path) || !/^[a-f0-9]{64}$/.test(descriptor.sha256) || !Number.isSafeInteger(descriptor.byteLength)) throw Error('Invalid model asset pin.');
  const url = new URL(descriptor.path, bundleUrl); const key = url.href + ':' + descriptor.sha256;
  if (!cached.has(key)) {
    const request = (async () => {
      const response = await fetchImpl(url.href, { signal, credentials:'same-origin', cache:'no-cache' });
      if (!response.ok) throw Error('Model asset unavailable: ' + descriptor.path);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== descriptor.byteLength || await digest(bytes) !== descriptor.sha256) throw Error('Model asset does not match release: ' + descriptor.path);
      return bytes;
    })().catch(error => { cached.delete(key); throw error; });
    cached.set(key,request);
  }
  return cached.get(key);
}
const json = bytes => JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));

export async function loadSelectedGameModelV4Runtime({ fetchImpl=globalThis.fetch.bind(globalThis), signal, seasonStartYear=2025 }={}) {
  const bundle=json(await readPinned(fetchImpl,{path:'bundle.json',sha256:SELECTED_GAME_MODEL_BUNDLE_SHA256,byteLength:11368},signal));
  if (bundle.format !== 'swishiq-selected-game-model-browser-bundle-v1' || bundle.modelId !== SELECTED_GAME_MODEL_ID
    || bundle.configurationSha256 !== entry.CONFIGURATION_SHA256 || stable(bundle.configuration)!==stable(entry.CONFIGURATION)
    || bundle.releaseStatus !== 'owner-manual-override-approved') throw Error('Selected model release identity mismatch.');
  const expectedModules = [
    'game-lab-candidate100-pruned-total-model-blend090-v1.mjs', 'game-lab-head-feature-policy-v1.mjs',
    'game-lab-candidate57-runtime-checkpoint-v3.mjs', 'game-lab-candidate57-c51-pass6-hybrid-v4.mjs',
    'game-lab-candidate57-feature-penalty-fit-v3.mjs', 'game-lab-candidate57-configurable-uncertainty-v7.mjs',
  ];
  if (!Array.isArray(bundle.modules) || bundle.modules.length !== expectedModules.length
    || new Set(bundle.modules.map(d=>d.path)).size !== expectedModules.length
    || expectedModules.some(name=>!bundle.modules.some(d=>d.path===name))
    || bundle.entryModule.path !== expectedModules[0]) throw Error('Selected model dependency closure mismatch.');
  await Promise.all(bundle.modules.map(d=>readPinned(fetchImpl,d,signal)));
  const snapshot=bundle.snapshots.find(s=>s.seasonStartYear===Number(seasonStartYear));
  const checkpointDescriptor=snapshot?.checkpoint || bundle.currentCheckpoint;
  const [checkpointBytes,decisionBytes,featureBytes]=await Promise.all([
    readPinned(fetchImpl,checkpointDescriptor,signal),readPinned(fetchImpl,bundle.releaseDecision,signal),
    snapshot ? readPinned(fetchImpl,snapshot.features,signal):null,
  ]);
  const artifact=json(checkpointBytes),decision=json(decisionBytes),features=featureBytes?json(featureBytes):null;
  if(decision.modelVersion!==entry.MODEL_VERSION || decision.configurationSha256!==entry.CONFIGURATION_SHA256
    || decision.independentPredictiveValidityEstablished!==false || decision.selectedCandidate!==100) throw Error('Model release decision mismatch.');
  if(features && (features.containsTargetLabels!==false || features.modelVersion!==entry.MODEL_VERSION
    || features.configurationSha256!==entry.CONFIGURATION_SHA256 || features.package.packageId!==snapshot.packageId
    || features.package.packageVersion!==snapshot.packageVersion || !Array.isArray(features.rows))) throw Error('Selected model feature snapshot mismatch.');
  if (artifact.modelVersion !== entry.MODEL_VERSION || artifact.configurationSha256 !== entry.CONFIGURATION_SHA256
    || !Array.isArray(artifact.sourcePins) || !decision.predictiveUseApproved
    || decision.approvalMethod !== 'explicit-owner-manual-override'
    || decision.empiricalValidationPassed !== false || decision.prospectiveValidityEstablished !== false
    || features && features.featureRepresentation !== 'raw-before-head-policy') throw Error('Model approval or raw-feature contract mismatch.');
  for (const descriptor of [...bundle.modules, bundle.releaseDecision]) {
    const embedded = artifact.sourcePins.find(p=>p.path===descriptor.path);
    if (!embedded || embedded.sha256!==descriptor.sha256 || embedded.byteLength!==descriptor.byteLength)
      throw Error('Checkpoint source pin differs from verified dependency: ' + descriptor.path);
  }
  const runtime=await entry.hydrateRuntime({artifact});
  const rows=features?.rows || [], byRef=new Map(rows.map(row=>[row.gameRef,row]));
  if(byRef.size!==rows.length || rows.some(row=>row.seasonStartYear!==Number(seasonStartYear)
    || row.featureObservedThrough>=row.gameDateLocal || artifact.lastObservedLocalDate>=row.gameDateLocal)) throw Error('Feature chronology or identity mismatch.');
  const provenance=Object.freeze({ modelId:SELECTED_GAME_MODEL_ID,modelVersion:entry.MODEL_VERSION,
    releaseStatus:bundle.releaseStatus,predictiveReleaseStatus:'owner-approved-predictive-use',
    predictiveValidityStatus:decision.predictiveValidityStatus,predictiveUseApproved:true,approvalMethod:decision.approvalMethod,
    frozenEmpiricalStatus:'frozen-numerical-checks-not-fully-passed',empiricalValidationPassed:false,independentPredictiveValidityEstablished:false,
    prospectiveValidityEstablished:false,packageWideValidityEstablished:false,configurationSha256:entry.CONFIGURATION_SHA256,
    developmentChecks:{passed:decision.development.passed,total:decision.development.total},independentHistoricalChecks:decision.historical,
    checkpoint:{sha256:checkpointDescriptor.sha256,lastObservedDate:artifact.lastObservedLocalDate,distributionVersion:entry.MODEL_VERSION},
    bundle:{url:bundleUrl.href,sha256:SELECTED_GAME_MODEL_BUNDLE_SHA256},approval:{status:bundle.releaseStatus},
    targetMode:features?.targetMode || 'unavailable',featureSnapshot:snapshot?.features || null });
  return Object.freeze({ provenance,featureSnapshot:features,snapshot,
    requirements:Object.freeze({totalPredictors:entry.CONFIGURATION.totalFeatureNames.length,marginPredictors:entry.CONFIGURATION.marginFeatureNames.length,strictPriorLocalDate:true}),
    async predict({inputFeatures,targetGameRef}={}) {
      const row=byRef.get(targetGameRef);
      if(!row || stable(inputFeatures)!==stable(row.features)) throw Error('Choose a verified selected-model scheduled target.');
      const result=entry.predictGame({runtime,inputFeatures:row.features,targetGameRef:row.gameRef,targetDate:row.gameDateLocal,
        featureObservedThrough:row.featureObservedThrough,seasonStartYear:row.seasonStartYear});
      return Object.freeze({...result.distribution,version:entry.MODEL_VERSION,tieProbability:0,
        executionStatus:'owner-manual-override-approved',featureObservedThrough:result.featureObservedThrough,
        coefficientObservedThrough:result.coefficientObservedThrough,standardizationObservedThrough:result.standardizationObservedThrough});
    },
  });
}
