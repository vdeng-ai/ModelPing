/** Cloudflare Workers free-tier soft cap used for client-side status auto-refresh guards. */
export const FREE_WORKER_SOFT_CAP = 100_000;

/** Estimated Worker requests/day if every entry is pinged once per intervalSec. */
export function dailyPingRequests(entryCount: number, intervalSec: number): number {
  if (!intervalSec || entryCount <= 0) return 0;
  return Math.ceil((entryCount * 86400) / intervalSec);
}

/** Max entries that stay under the free-tier soft cap for a given interval. */
export function maxEntriesForInterval(intervalSec: number, cap = FREE_WORKER_SOFT_CAP): number {
  if (!intervalSec) return Number.POSITIVE_INFINITY;
  return Math.floor((cap * intervalSec) / 86400);
}

/** True when the interval would exceed the free-tier soft cap. */
export function isOverFreeCap(
  entryCount: number,
  intervalSec: number,
  cap = FREE_WORKER_SOFT_CAP,
): boolean {
  return dailyPingRequests(entryCount, intervalSec) > cap;
}

/**
 * Pick the shortest allowed interval from options that stays under the cap.
 * Returns 0 (Off) when none of the positive options are safe.
 */
export function safestInterval(
  entryCount: number,
  options: readonly number[],
  cap = FREE_WORKER_SOFT_CAP,
): number {
  const positive = options.filter((sec) => sec > 0).sort((a, b) => a - b);
  for (const sec of positive) {
    if (!isOverFreeCap(entryCount, sec, cap)) return sec;
  }
  return 0;
}
