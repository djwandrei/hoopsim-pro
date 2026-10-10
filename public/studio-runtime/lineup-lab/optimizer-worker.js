// Match the app shell's revision so the worker cannot run an older solver from
// an existing browser cache after a targeted cPanel release.
import { analyzeLineupInputStability, optimizeLineups } from "./optimizer-core.js?v=20261010a&rev=native-v4-impact-mean-only-v1";
import { canonicalV4LineupModelExecutionAvailability } from "../../engine/canonical-v4-lineup-model-gate.js?v=20261008n&rev=historical-optimizer-gate-6a0e4d0ed273a71e";

self.addEventListener("message", (event) => {
  const { requestId, players, config } = event.data || {};
  if (typeof requestId !== "string" || !Array.isArray(players)) {
    if (typeof requestId === "string") {
      self.postMessage({
        requestId,
        error: "The optimizer received an invalid background request.",
      });
    }
    return;
  }
  const sourceGate = canonicalV4LineupModelExecutionAvailability({
    sourceMode: event.data?.sourceMode || "pre-cutover",
  });
  if (!sourceGate.available) {
    self.postMessage({
      requestId,
      error: sourceGate.reason,
      code: sourceGate.code,
    });
    return;
  }
  try {
    const onProgress = (progress) => {
      self.postMessage({
        requestId,
        type: "progress",
        progress,
      });
    };
    const inputStability = event.data?.inputStability;
    if (inputStability && typeof inputStability === "object" && !Array.isArray(inputStability)) {
      self.postMessage({
        requestId,
        type: "result",
        result: analyzeLineupInputStability(players, config, inputStability, { onProgress }),
      });
      return;
    }
    const scenarioConfigs = Array.isArray(event.data?.scenarioConfigs)
      ? event.data.scenarioConfigs
      : null;
    if (scenarioConfigs?.length) {
      const scenarios = [];
      for (const [index, scenario] of scenarioConfigs.entries()) {
        const scenarioId = typeof scenario?.id === "string" ? scenario.id : `scenario-${index + 1}`;
        if (!scenario?.config || typeof scenario.config !== "object" || Array.isArray(scenario.config)) {
          scenarios.push({ id: scenarioId, label: String(scenario?.label || scenarioId), ok: false,
            reason: "The objective scenario configuration was invalid.", result: null });
          continue;
        }
        const result = optimizeLineups(players, scenario.config, {
          onProgress: (progress) => onProgress({ ...progress, scenarioId, scenarioLabel: scenario.label || scenarioId }),
        });
        scenarios.push({
          id: scenarioId,
          label: String(scenario.label || scenarioId),
          ok: result.ok,
          status: result.status,
          objectiveMetadata: result.objectiveMetadata || null,
          result,
        });
      }
      self.postMessage({
        requestId,
        type: "result",
        result: { kind: "objective-scenario-comparison", scenarios },
      });
      return;
    }
    self.postMessage({
      requestId,
      type: "result",
      result: optimizeLineups(players, config, { onProgress }),
    });
  } catch (error) {
    self.postMessage({
      requestId,
      error: error instanceof Error ? error.message : "The optimizer could not finish.",
    });
  }
});
