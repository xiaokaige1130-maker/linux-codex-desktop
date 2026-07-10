"use strict";

const modelIds = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];
const marker = "codexLinuxCustomModelIds";

function applyCustomModelCatalogPatch(source) {
  if (source.includes(marker)) {
    return source;
  }

  const availableModelsPatterns = [
    /availableModels:new Set\(([A-Za-z_$][\w$]*)\),defaultModel:/,
    /availableModels:([A-Za-z_$][\w$]*),defaultModel:/,
  ];
  if (!source.includes("availableModels") || !source.includes("useHiddenModels")) {
    return source;
  }

  const availableModelsPattern = availableModelsPatterns.find((pattern) => pattern.test(source));
  const availableMatch = availableModelsPattern == null ? null : source.match(availableModelsPattern);
  if (!availableMatch) {
    if (modelIds.every((modelId) => source.includes(modelId))) {
      return `${`var ${marker}=${JSON.stringify(modelIds)};`}${source}`;
    }
    console.warn("WARN: Could not find model query allowlist - skipping custom model catalog patch");
    return source;
  }

  const availableModelsVar = availableMatch[1];
  const declaration = `var ${marker}=${JSON.stringify(modelIds)};`;
  const patched = source.replace(
    availableModelsPattern,
    `availableModels:new Set([...${availableModelsVar},...${marker}]),defaultModel:`,
  );
  return `${declaration}${patched}`;
}

module.exports = {
  descriptors: [
    {
      id: "model-picker-allowlist",
      phase: "webview-asset",
      pattern: /^model-queries-.*\.js$/,
      missingDescription: "model query bundle",
      skipDescription: "custom model catalog patch",
      apply: applyCustomModelCatalogPatch,
    },
  ],
  applyCustomModelCatalogPatch,
  modelIds,
};
