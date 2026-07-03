import { describe, expect, it } from "vitest";
import type { ProviderPreset } from "./types.js";
import { buildRows, freshProbes, selectRowsForProvider, type ModelRow } from "./model-rows.js";

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
});
