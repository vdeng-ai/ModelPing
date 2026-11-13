const LOCK_NAME = "modelping-status-poller";
const LEASE_KEY = "modelping:status-poller-lease";
const LEASE_MS = 15_000;
const RENEW_MS = 5_000;

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function startLeaseFallback(onLeader: (leader: boolean) => void): () => void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    onLeader(true);
    return () => onLeader(false);
  }

  const id = randomId();
  let stopped = false;
  let leader = false;

  const setLeader = (next: boolean) => {
    if (leader === next) return;
    leader = next;
    onLeader(next);
  };

  const readLease = (): { id: string; expires: number } | null => {
    try {
      const raw = localStorage.getItem(LEASE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { id?: unknown; expires?: unknown };
      if (typeof parsed.id !== "string" || typeof parsed.expires !== "number") return null;
      return { id: parsed.id, expires: parsed.expires };
    } catch {
      return null;
    }
  };

  const tick = () => {
    if (stopped) return;
    const now = Date.now();
    const current = readLease();
    if (!current || current.expires <= now || current.id === id) {
      try {
        localStorage.setItem(LEASE_KEY, JSON.stringify({ id, expires: now + LEASE_MS }));
        setLeader(readLease()?.id === id);
      } catch {
        setLeader(true);
      }
    } else {
      setLeader(false);
    }
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key === LEASE_KEY) tick();
  };

  tick();
  const timer = window.setInterval(tick, RENEW_MS);
  window.addEventListener("storage", onStorage);

  return () => {
    stopped = true;
    window.clearInterval(timer);
    window.removeEventListener("storage", onStorage);
    if (readLease()?.id === id) {
      try {
        localStorage.removeItem(LEASE_KEY);
      } catch {}
    }
    setLeader(false);
  };
}

/**
 * Elect exactly one visible tab to run Status auto-refresh.
 * Web Locks is preferred; localStorage lease is a lightweight fallback.
 */
export function acquireStatusPollLeadership(onLeader: (leader: boolean) => void): () => void {
  if (typeof navigator === "undefined") {
    onLeader(true);
    return () => onLeader(false);
  }

  const locks = (navigator as Navigator & {
    locks?: {
      request(
        name: string,
        options: { mode: "exclusive"; signal: AbortSignal },
        callback: () => Promise<void>,
      ): Promise<void>;
    };
  }).locks;

  if (!locks?.request) return startLeaseFallback(onLeader);

  const controller = new AbortController();
  let stopped = false;
  let fallbackCleanup: (() => void) | null = null;

  void locks.request(
    LOCK_NAME,
    { mode: "exclusive", signal: controller.signal },
    async () => {
      if (stopped) return;
      onLeader(true);
      await new Promise<void>((resolve) => {
        if (controller.signal.aborted) {
          resolve();
          return;
        }
        controller.signal.addEventListener("abort", () => resolve(), { once: true });
      });
      onLeader(false);
    },
  ).catch((error: unknown) => {
    if (stopped || (error as { name?: string } | null)?.name === "AbortError") return;
    fallbackCleanup = startLeaseFallback(onLeader);
  });

  return () => {
    stopped = true;
    controller.abort();
    fallbackCleanup?.();
    onLeader(false);
  };
}
