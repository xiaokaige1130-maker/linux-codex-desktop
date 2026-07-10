#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { applyCustomModelCatalogPatch, modelIds } = require("./patch.js");
const {
  loadLinuxFeaturePatchDescriptors,
} = require("../../upstream/codex-desktop-linux/scripts/lib/linux-features.js");

const fixture = "var w=o(c,({availableModels:e,defaultModel:n},{get:l})=>({queryFn:()=>i(`list-models-for-host`),select:({data:r})=>p({availableModels:e,defaultModel:n,models:r,useHiddenModels:c})}));";
const currentFixture = "var w=o(c,({availableModels:e,authMethod:t,defaultModel:n},{get:l})=>({queryFn:()=>i(`list-models-for-host`),select:({data:r})=>p({authMethod:t,availableModels:new Set(e),defaultModel:n,models:r,useHiddenModels:c})}));";

test("adds custom models to the renderer allowlist", () => {
  const patched = applyCustomModelCatalogPatch(fixture);
  for (const modelId of modelIds) {
    assert.match(patched, new RegExp(modelId.replaceAll(".", "\\.")));
  }
  assert.match(patched, /availableModels:new Set\(\[\.\.\.e,\.\.\.codexLinuxCustomModelIds\]\)/);
});

test("custom model allowlist patch is idempotent", () => {
  const once = applyCustomModelCatalogPatch(fixture);
  assert.equal(applyCustomModelCatalogPatch(once), once);
});

test("patches the current model query shape with auth method metadata", () => {
  const patched = applyCustomModelCatalogPatch(currentFixture);
  assert.match(patched, /availableModels:new Set\(\[\.\.\.e,\.\.\.codexLinuxCustomModelIds\]\)/);
  for (const modelId of modelIds) {
    assert.match(patched, new RegExp(modelId.replaceAll(".", "\\.")));
  }
});

test("adopts the existing generated app patch without duplicating models", () => {
  const assets = path.resolve(
    __dirname,
    "..",
    "..",
    "upstream",
    "codex-desktop-linux",
    "codex-app",
    "content",
    "webview",
    "assets",
  );
  const modelQueryFile = fs.readdirSync(assets).find((name) => /^model-queries-.*\.js$/.test(name));
  assert.ok(modelQueryFile, "generated app should contain a model query bundle");
  const current = fs.readFileSync(path.join(assets, modelQueryFile), "utf8");
  const patched = applyCustomModelCatalogPatch(current);
  assert.match(patched, /codexLinuxCustomModelIds/);
  for (const modelId of modelIds) {
    assert.equal(patched.split(modelId).length - 1, current.split(modelId).length - 1 + 1);
  }
  assert.equal(applyCustomModelCatalogPatch(patched), patched);
});

test("upstream feature loader discovers the main-repository feature root", () => {
  const featuresRoot = path.resolve(__dirname, "..");
  const configPath = path.join(featuresRoot, "features.json");
  const previousConfig = process.env.CODEX_LINUX_FEATURES_CONFIG;
  process.env.CODEX_LINUX_FEATURES_CONFIG = configPath;
  try {
    const descriptors = loadLinuxFeaturePatchDescriptors({ featuresRoot });
    assert.deepEqual(
      descriptors.map((descriptor) => descriptor.id),
      ["feature:custom-model-catalog:model-picker-allowlist"],
    );
    assert.match(descriptors[0].apply(fixture, {}), /codexLinuxCustomModelIds/);
  } finally {
    if (previousConfig == null) {
      delete process.env.CODEX_LINUX_FEATURES_CONFIG;
    } else {
      process.env.CODEX_LINUX_FEATURES_CONFIG = previousConfig;
    }
  }
});
