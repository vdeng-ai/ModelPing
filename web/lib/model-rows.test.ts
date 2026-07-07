import { describe, expect, it } from "vitest";
import type { ProviderPreset } from "./types.js";
import {
  appendCustomModelRows,
  buildRows,
  customModelIds,
  freshProbes,
  selectRowsForProvider,
  upsertCustomModelRows,
  type ModelRow,
} from "./model-rows.js";

const providers: ProviderPreset[] = [
  {
    id: "a",
    name: "A",
    baseUrl: "https://a.example.com",
    models: [
      { id: "a-shared", label: "Shared" },
      { id: "a-only" },
    ],
  },
  {
    id: "b",
    name: "B",
    baseUrl: "https://b.example.com",
    models: [
      { id: "b-shared", label: "Shared" },
    ],
  },
];

describe("model rows", () => {
  it("deduplicates by label and checks rows available for the selected provider", () => {
    const keys = ["k1", "k2"];
    const rows = buildRows(providers, "b", () => keys.shift()!);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      key: "k1",
      label: "Shared",
      checked: true,
      modelByProvider: { a: "a-shared", b: "b-shared" },
    });
    expect(rows[1]).toMatchObject({
      key: "k2",
      label: "a-only",
      checked: false,
      modelByProvider: { a: "a-only" },
    });
  });

  it("selects custom rows when provider is custom and resets probes", () => {
    const probes = freshProbes();
    probes["openai-chat"] = { ...probes["openai-chat"], status: "success" };
    const rows: ModelRow[] = [
      { key: "c", label: "custom", modelByProvider: {}, custom: true, checked: false, probes },
      { key: "p", label: "preset", modelByProvider: { a: "preset" }, custom: false, checked: true, probes: freshProbes() },
    ];

    const next = selectRowsForProvider(rows, "custom");

    expect(next.map((row) => row.checked)).toEqual([true, false]);
    expect(next[0].probes["openai-chat"].status).toBe("idle");
  });

  it("selects preset rows that exist for the chosen provider", () => {
    const rows = buildRows(providers, "custom", () => "k");
    const next = selectRowsForProvider(rows, "a");

    expect(next.map((row) => row.checked)).toEqual([true, true]);
    expect(next.every((row) => row.probes["openai-chat"].status === "idle")).toBe(true);
  });

  it("upserts custom rows and resets existing probes", () => {
    const probes = freshProbes();
    probes.gemini = { ...probes.gemini, status: "success" };
    const rows: ModelRow[] = [
      { key: "old", label: "existing", modelByProvider: {}, custom: true, checked: false, probes },
    ];
    const keys = ["new"];

    const next = upsertCustomModelRows(rows, [" existing ", "", "new-model"], () => keys.shift()!);

    expect(next).toHaveLength(2);
    expect(next[0].checked).toBe(true);
    expect(next[0].probes.gemini.status).toBe("idle");
    expect(next[1]).toMatchObject({
      key: "new",
      label: "new-model",
      custom: true,
      checked: true,
      modelByProvider: {},
    });
  });

  it("restores custom model rows without changing preset rows", () => {
    const rows = buildRows(providers, "custom", () => "preset");
    const next = appendCustomModelRows(rows, [" custom-a ", "Shared", "custom-a", ""], () => "custom");

    expect(next).toHaveLength(3);
    expect(next[0]).toMatchObject({ label: "Shared", custom: false, checked: false });
    expect(next[2]).toMatchObject({
      key: "custom",
      label: "custom-a",
      custom: true,
      checked: true,
      modelByProvider: {},
    });
    expect(next[2].probes.gemini.status).toBe("idle");
  });

  it("extracts only custom model ids for persistence", () => {
    const rows: ModelRow[] = [
      { key: "p", label: "preset", modelByProvider: { a: "preset" }, custom: false, checked: true, probes: freshProbes() },
      { key: "c1", label: " custom-a ", modelByProvider: {}, custom: true, checked: false, probes: freshProbes() },
      { key: "c2", label: "custom-a", modelByProvider: {}, custom: true, checked: true, probes: freshProbes() },
      { key: "c3", label: "", modelByProvider: {}, custom: true, checked: true, probes: freshProbes() },
    ];

    expect(customModelIds(rows)).toEqual(["custom-a"]);
  });
});
