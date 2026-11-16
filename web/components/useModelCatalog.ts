import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { fetchModelCatalog, syncModelCatalog, type ModelCatalog } from "../lib/api.js";

/** One lazy cache shared by the searchable picker and explicit catalog manager. */
export function useModelCatalog() {
  const [data, setData] = useState<ModelCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const loaded = useRef(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const request = useCallback(async (sync: boolean) => {
    if (pending.current || (!sync && loaded.current)) return;
    pending.current = true;
    setError("");
    if (sync) setSyncing(true); else setLoading(true);
    try {
      const result = await (sync ? syncModelCatalog() : fetchModelCatalog());
      if (mounted.current) { loaded.current = true; setData(result); }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      pending.current = false;
      if (mounted.current) { setLoading(false); setSyncing(false); }
    }
  }, []);
  const load = useCallback(() => request(false), [request]);
  const sync = useCallback(() => request(true), [request]);
  return { data, loading, syncing, error, load, sync };
}

export type ModelCatalogState = ReturnType<typeof useModelCatalog>;
