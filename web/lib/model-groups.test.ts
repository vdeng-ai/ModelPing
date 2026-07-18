import { describe, expect, it } from "vitest";
import { groupModelsByFamily, modelFamilyPrefix } from "./model-groups.js";

describe("modelFamilyPrefix", () => {
  it.each([
    ["claude-opus-4-8", "claude-opus"],
    ["gpt-5.5", "gpt"],
    ["deepseek-v4-pro", "deepseek"],
    ["MiniMax-M2.7", "MiniMax"],
    ["kimi-k2.6", "kimi"],
    ["openai/gpt-5.4", "openai/gpt"],
    ["qwen2.5-coder", "qwen"],
    ["o3-mini", "o"],
  ])("extracts the family from %s", (model, expected) => {
    expect(modelFamilyPrefix(model)).toBe(expected);
  });

  it("keeps versionless and numeric-only model ids standalone", () => {
    expect(modelFamilyPrefix("claude-latest")).toBeNull();
    expect(modelFamilyPrefix("2026-model")).toBeNull();
    expect(modelFamilyPrefix("  ")).toBeNull();
  });
});

describe("groupModelsByFamily", () => {
  it("groups matching families case-insensitively and keeps singletons flat", () => {
    const models = [
      { id: "gpt-5.10" },
      { id: "standalone-latest" },
      { id: "minimax-M3" },
      { id: "gpt-5.2" },
      { id: "MiniMax-M2.7" },
      { id: "claude-opus-4-8" },
    ];

    const entries = groupModelsByFamily(models, (model) => model.id);

    expect(
      entries.map((entry) =>
        entry.kind === "group"
          ? { kind: entry.kind, label: entry.label, models: entry.models.map((model) => model.id) }
          : { kind: entry.kind, model: entry.model.id },
      ),
    ).toEqual([
      { kind: "model", model: "claude-opus-4-8" },
      { kind: "group", label: "gpt", models: ["gpt-5.2", "gpt-5.10"] },
      { kind: "group", label: "MiniMax", models: ["MiniMax-M2.7", "minimax-M3"] },
      { kind: "model", model: "standalone-latest" },
    ]);
  });

  it("does not mutate the source array", () => {
    const models = [{ id: "z-2" }, { id: "a-1" }];
    const original = [...models];

    groupModelsByFamily(models, (model) => model.id);

    expect(models).toEqual(original);
  });
});
