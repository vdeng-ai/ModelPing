import { PROTOCOLS } from "../../src/protocols.js";
import type { ModelRow } from "./model-rows.js";

export function rowState(row: ModelRow) {
  const probes = PROTOCOLS.map((protocol) => row.probes[protocol]);
  if (probes.some((probe) => probe.status === "testing")) return "testing";
  if (probes.some((probe) => probe.status === "success")) return "success";
  if (probes.some((probe) => probe.status === "fail")) return "fail";
  return "idle";
}

export function rowResult(row: ModelRow) {
  const probes = PROTOCOLS.map((protocol) => row.probes[protocol]);
  return probes.find((probe) => probe.status === "success" && probe.result)
    ?? probes.find((probe) => probe.status === "fail" && probe.result);
}
