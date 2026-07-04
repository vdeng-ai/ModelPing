function abortError(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError");
}

export class TimeoutError extends Error {
  readonly isTimeout = true;

  constructor(timeoutMs: number) {
    super(`请求超时 (${timeoutMs}ms)`);
    this.name = "TimeoutError";
  }
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError || Boolean((error as { isTimeout?: unknown } | null)?.isTimeout);
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const ctrl = new AbortController();
  let timedOut = false;
  const onAbort = () => ctrl.abort(signal?.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e: any) {
    if (signal?.aborted) throw abortError(signal);
    if (timedOut && e?.name === "AbortError") throw new TimeoutError(timeoutMs);
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
