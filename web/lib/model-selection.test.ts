import { describe, expect, it } from "vitest";
import { buildRows, freshProbes, type ModelRow } from "./model-rows.js";
import { buildModelOptions, modelsForConnection, searchModelOptions, selectModelById } from "./model-selection.js";
import type { CatalogProvider } from "./api.js";

const rows = buildRows([
  { id: "first", name: "First", baseUrl: "https://first.example/v1", models: [{ id: "alias-one", label: "Shared model" }] },
  { id: "second", name: "Second", baseUrl: "https://second.example/v1", models: [{ id: "alias-two", label: "Shared model" }] },
]);
const catalog: CatalogProvider[] = [
  { id: "openai", name: "OpenAI", baseUrl: "https://example.test", docs: "", models: [
    { id: "gpt-new", label: "GPT New", releaseDate: null, context: 128000, modalities: ["text"] },
    { id: "alias-two", label: "Another display name", releaseDate: null, context: null, modalities: [] },
  ] },
  { id: "proxy", name: "Proxy", baseUrl: "https://proxy.test", docs: "", models: [
    { id: "gpt-new", label: "新模型", releaseDate: null, context: null, modalities: [] },
  ] },
];

describe("model discovery and selection", () => {
  it("includes models shared with a non-first provider", () => {
    expect(modelsForConnection(rows, "second")).toEqual(rows);
    expect(modelsForConnection(rows, "unrelated")).toEqual([]);
    expect(modelsForConnection(rows, "custom")).toEqual(rows);
  });
  it("merges duplicate request IDs, retaining local rows and all source names", () => {
    const options = buildModelOptions(rows, "second", catalog);
    expect(options).toHaveLength(2);
    expect(options.find((option) => option.id === "alias-two")?.rowKey).toBe(rows[0].key);
    expect(options.find((option) => option.id === "gpt-new")?.sources).toEqual(["OpenAI", "Proxy"]);
    expect(options.find((option) => option.id === "gpt-new")?.rowKey).toBeUndefined();
  });
  it("searches names, IDs, source names, unicode and multiple case-insensitive terms", () => {
    const options = buildModelOptions(rows, "second", catalog);
    for (const query of ["GPT-NEW", "GPT New", "OpenAI new", "Proxy", "新模型"]) {
      expect(searchModelOptions(options, query).options.map((option) => option.id)).toEqual(["gpt-new"]);
    }
    expect(searchModelOptions(options, "another display").options[0].id).toBe("alias-two");
    expect(searchModelOptions(options, "unmatched").total).toBe(0);
  });
  it("ranks exact IDs first and caps rendered options without dropping the match count", () => {
    const options = Array.from({ length: 150 }, (_, i) => ({ id: `gpt-${i}`, label: `GPT ${i}`, sources: [], searchText: `gpt-${i}` }));
    const found = searchModelOptions(options, "gpt-");
    expect(found.total).toBe(150);
    expect(found.options).toHaveLength(60);
    expect(searchModelOptions(options, "gpt-1").options[0].id).toBe("gpt-1");
  });
  it("selects an existing current-provider ID without duplicating or clearing its probes", () => {
    const selected = selectModelById(rows, "second", "alias-two");
    expect(selected.rows).toHaveLength(1);
    expect(selected.key).toBe(rows[0].key);
    expect(selected.rows[0].probes).toBe(rows[0].probes);
    expect(selected.rows[0].checked).toBe(true);
    expect(rows[0].checked).toBe(false);
  });
  it("adds the canonical catalog ID rather than its display name and selects it exclusively", () => {
    const selected = selectModelById(rows, "second", " gpt-new ", () => "catalog-new");
    expect(selected.rows.filter((row) => row.checked).map((row) => row.label)).toEqual(["gpt-new"]);
    expect(selected.rows[1]).toMatchObject({ key: "catalog-new", custom: true, modelByProvider: {} });
    expect(selectModelById(selected.rows, "second", "gpt-new").rows).toHaveLength(2);
  });
  it("does not reuse a same-label row with a different request ID", () => {
    const collision: ModelRow = { key: "collision", label: "gpt-new", modelByProvider: { second: "different-id" }, custom: false, checked: true, probes: freshProbes() };
    const selected = selectModelById([collision], "second", "gpt-new", () => "correct-id");
    expect(selected.key).toBe("correct-id");
    expect(selected.rows.filter((row) => row.checked)[0].label).toBe("gpt-new");
  });
  it("does not select an unrelated provider's alias", () => {
    const selected = selectModelById(rows, "unrelated", "alias-one", () => "new-custom");
    expect(selected.key).toBe("new-custom");
    expect(selected.rows[1].custom).toBe(true);
  });
  it("does not add empty model IDs", () => {
    expect(selectModelById(rows, "second", " ")).toEqual({ rows, key: "" });
  });
});
