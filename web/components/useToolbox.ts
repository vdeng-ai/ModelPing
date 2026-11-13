import { useEffect, useRef, useState } from "preact/hooks";
import type { ToolboxRequest, ToolboxResult, ToolboxWorkerResponse } from "../lib/toolbox-types.js";

/** Debounce typing, isolate CPU work, and discard results from superseded requests. */
export function useToolbox(request: ToolboxRequest) {
  const workerRef = useRef<Worker | null>(null);
  const workerUnavailable = useRef(false);
  const sequence = useRef(0);
  const [completed, setCompleted] = useState<{ request: ToolboxRequest; result: ToolboxResult } | null>(null);

  useEffect(() => {
    const id = ++sequence.current;
    const finish = (result: ToolboxResult) => {
      if (id === sequence.current) setCompleted({ request, result });
    };
    const fallback = async () => {
      try {
        const { runToolbox } = await import("../lib/toolbox-engine.js");
        if (id === sequence.current) finish(runToolbox(request));
      } catch { finish({ ok: false, error: "conversionFailed" }); }
    };
    const timer = setTimeout(() => {
      if (workerUnavailable.current) { void fallback(); return; }
      try {
        const worker = workerRef.current ?? new Worker(new URL("../lib/toolbox.worker.ts", import.meta.url), { type: "module" });
        workerRef.current = worker;
        worker.onmessage = ({ data }: MessageEvent<ToolboxWorkerResponse>) => {
          if (data.id === id) finish(data.result);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          worker.terminate();
          workerRef.current = null;
          workerUnavailable.current = true;
          void fallback();
        };
        worker.postMessage({ id, request });
      } catch {
        workerRef.current?.terminate();
        workerRef.current = null;
        workerUnavailable.current = true;
        void fallback();
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [request]);

  useEffect(() => () => {
    ++sequence.current;
    workerRef.current?.terminate();
  }, []);

  // Hide obsolete output synchronously, not one effect/frame after the next keystroke.
  const current = completed?.request === request ? completed.result : null;
  return { result: current, pending: current === null };
}
