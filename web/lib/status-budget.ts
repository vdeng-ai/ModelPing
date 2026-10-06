/** Cloudflare Workers Free daily request ceiling. */
export const CLOUDFLARE_FREE_DAILY_REQUEST_LIMIT = 100_000;

/** ModelPing default share reserved for Status auto-refresh; leave headroom for manual API calls. */
export const DEFAULT_MODELPING_DAILY_BUDGET = 60_000;

/** Keep in sync with src/ping.ts MAX_PING_BATCH_SIZE. */
export const PING_BATCH_SIZE = 10;

/** Estimated Worker requests/day when Status entries are packed into ping batches. */
export function dailyPingRequests(
  entryCount: number,
  intervalSec: number,
  batchSize = PING_BATCH_SIZE,
): number {
  if (!intervalSec || entryCount <= 0) return 0;
  const batchesPerRefresh = Math.ceil(entryCount / Math.max(1, batchSize));
  return Math.ceil((batchesPerRefresh * 86400) / intervalSec);
}

/** Max entries that fit under a request budget for a given interval. */
export function maxEntriesForInterval(
  intervalSec: number,
  cap = DEFAULT_MODELPING_DAILY_BUDGET,
  batchSize = PING_BATCH_SIZE,
): number {
  if (!intervalSec) return Number.POSITIVE_INFINITY;
  const maxBatches = Math.floor((cap * intervalSec) / 86400);
  return Math.max(0, maxBatches) * Math.max(1, batchSize);
}

export function isOverFreeCap(
  entryCount: number,
  intervalSec: number,
  cap = DEFAULT_MODELPING_DAILY_BUDGET,
  batchSize = PING_BATCH_SIZE,
): boolean {
  return dailyPingRequests(entryCount, intervalSec, batchSize) > cap;
}

export function safestInterval(
  entryCount: number,
  options: readonly number[],
  cap = DEFAULT_MODELPING_DAILY_BUDGET,
  batchSize = PING_BATCH_SIZE,
): number {
  const positive = options.filter((sec) => sec > 0).sort((a, b) => a - b);
  for (const sec of positive) {
    if (!isOverFreeCap(entryCount, sec, cap, batchSize)) return sec;
  }
  return 0;
}
