// Match the app shell's revision so the worker cannot run an older solver from
// an existing browser cache after a targeted cPanel release.
import { analyzeLineupInputStability, analyzeWeightSensitivity, canShareWeightOnlyLineupScenarios, optimizeLineups } from "./optimizer-core.js?v=20261010g&rev=consolidated-runtime-v1";
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
      if (canShareWeightOnlyLineupScenarios(scenarioConfigs)) {
        const scenarioRows = scenarioConfigs.map((scenario, index) => {
          const id = typeof scenario.id === "string" ? scenario.id : `scenario-${index + 1}`;
          return { id, label: String(scenario.label || id), config: scenario.config };
        });
        const [baselineScenario, ...weightScenarios] = scenarioRows;
        const idByInternalId = new Map();
        const sensitivityScenarios = weightScenarios.map((scenario, index) => {
          const internalId = `weight-scenario-${index + 1}`;
          idByInternalId.set(internalId, scenario);
          return {
            id: internalId,
            label: scenario.label,
            weights: scenario.config.weights,
          };
        });
        const sensitivity = analyzeWeightSensitivity(
          players,
          baselineScenario.config,
          sensitivityScenarios,
          {
            onProgress: (progress) => {
              const scenario = progress.scenarioId === "baseline"
                ? baselineScenario
                : idByInternalId.get(progress.scenarioId);
              onProgress({
                ...progress,
                scenarioId: scenario?.id || baselineScenario.id,
                scenarioLabel: scenario?.label || baselineScenario.label,
              });
            },
          },
        );
        const toScenarioResult = (scenario, result) => ({
          id: scenario.id,
          label: scenario.label,
          ok: Boolean(result?.ok),
          status: result?.status,
          objectiveMetadata: result?.objectiveMetadata || null,
          result,
        });
        const scenarios = [
          toScenarioResult(baselineScenario, sensitivity.baseline.result),
          ...sensitivity.scenarios.map((scenario, index) => toScenarioResult(weightScenarios[index], scenario.result)),
        ];
        self.postMessage({
          requestId,
          type: "result",
          result: { kind: "objective-scenario-comparison", scenarios },
        });
        return;
      }
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
