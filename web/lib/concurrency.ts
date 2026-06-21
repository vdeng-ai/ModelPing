export async function runConcurrent<T>(
  items: T[],
  limit: number,
  signal: AbortSignal,
  task: (item: T, signal: AbortSignal) => Promise<void>,
  onComplete: () => void,
): Promise<void> {
  const queue = [...items];
  const workerCount = Math.min(Math.max(1, Math.trunc(limit)), queue.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (!signal.aborted) {
      const item = queue.shift();
      if (item === undefined) return;
      try {
        await task(item, signal);
        if (!signal.aborted) onComplete();
      } catch (error) {
        if (signal.aborted || (error as { name?: string } | null)?.name === "AbortError") return;
        throw error;
      }
    }
  });
  await Promise.all(workers);
}
