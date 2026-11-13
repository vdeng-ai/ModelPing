import { runToolbox } from "./toolbox-engine.js";
import type { ToolboxWorkerRequest, ToolboxWorkerResponse } from "./toolbox-types.js";

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<ToolboxWorkerRequest>) => void;
  postMessage: (message: ToolboxWorkerResponse) => void;
};

scope.onmessage = ({ data }) => scope.postMessage({ id: data.id, result: runToolbox(data.request) });
