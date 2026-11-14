import { describe, expect, it } from "vitest";
import { buildRows } from "./model-rows.js";
import { sortModelRows } from "./model-view.js";

const makeRows = () =>
  buildRows([
    {
      id: "example",
      name: "Example",
      baseUrl: "https://example.test",
      models: [{ id: "model-10" }, { id: "model-2" }, { id: "model-1" }],
    },
  ]);
describe("local model view", () => {
  it("retains preset order and row references", () => {
    const rows = makeRows();
    expect(sortModelRows(rows, "preset")).toBe(rows);
    const sorted = sortModelRows(rows, "name");
    expect(sorted.map((row) => row.label)).toEqual(["model-1", "model-2", "model-10"]);
    expect(rows.map((row) => row.label)).toEqual(["model-10", "model-2", "model-1"]);
    expect(sorted[0]).toBe(rows[2]);
  });
  it("puts failed rows first without changing selection or probes", () => {
    const rows = makeRows();
    rows[1].checked = true;
    rows[1].probes["openai-chat"].status = "fail";
    rows[2].probes["openai-chat"].status = "success";
    const snapshot = JSON.stringify(rows);
    expect(sortModelRows(rows, "status").map((row) => row.label)).toEqual(["model-2", "model-10", "model-1"]);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
  it("sorts measured latency before untested models and keeps ties stable", () => {
    const rows = makeRows();
    for (const [i, latencyMs] of [
      [0, 400],
      [2, 80],
    ]) {
      rows[i].probes["openai-chat"] = {
        ...rows[i].probes["openai-chat"],
        status: "success",
        result: {
          ok: true,
          status: 200,
          latencyMs,
          ttftMs: null,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          text: "ok",
          error: null,
          requestUrl: null,
          attempts: 1,
        },
      };
    }
    expect(sortModelRows(rows, "latency").map((row) => row.label)).toEqual(["model-1", "model-10", "model-2"]);
    expect(sortModelRows(makeRows(), "latency").map((row) => row.label)).toEqual(["model-10", "model-2", "model-1"]);
  });
});
