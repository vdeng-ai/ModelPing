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
  let cleanedUp = false;
  const onAbort = () => ctrl.abort(signal?.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });

  const normalizeAbort = (error: unknown): unknown => {
    if (signal?.aborted) return abortError(signal);
    if (timedOut) return new TimeoutError(timeoutMs);
    return error;
  };

  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timedOut = true;
    ctrl.abort(new TimeoutError(timeoutMs));
  }, timeoutMs);

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (timer) clearTimeout(timer);
    timer = null;
    signal?.removeEventListener("abort", onAbort);
  };

  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.body) {
      cleanup();
      return res;
    }

    const reader = res.body.getReader();
    const wrappedBody = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            cleanup();
            controller.close();
            return;
          }
          controller.enqueue(value);
        } catch (error) {
          cleanup();
          controller.error(normalizeAbort(error));
        }
      },
      async cancel(reason) {
        cleanup();
        try {
          await reader.cancel(reason);
        } catch {
          // Ignore cancellation races: the caller already chose to stop consuming the body.
        }
      },
    });

    return new Response(wrappedBody, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  } catch (error) {
    cleanup();
    throw normalizeAbort(error);
  }
}
