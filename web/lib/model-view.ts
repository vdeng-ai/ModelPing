import type { ModelRow } from "./model-rows.js";
import { rowResult, rowState } from "./result-presentation.js";

export type ModelSort = "preset" | "name" | "latency" | "status";
const order = { fail: 0, testing: 1, idle: 2, success: 3 };

/** Sorting is a view operation: never mutate the run queue or selected rows. */
export function sortModelRows(rows: ModelRow[], sort: ModelSort): ModelRow[] {
  if (sort === "preset") return rows;
  return [...rows].sort((a, b) => {
    if (sort === "name") return a.label.localeCompare(b.label, undefined, { numeric: true });
    if (sort === "status") return order[rowState(a)] - order[rowState(b)];
    const latency = (row: ModelRow) => rowResult(row)?.result?.latencyMs ?? Number.POSITIVE_INFINITY;
    return latency(a) - latency(b);
  });
}
