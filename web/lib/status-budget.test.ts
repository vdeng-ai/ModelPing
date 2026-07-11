import { describe, expect, it } from "vitest";
import {
  FREE_WORKER_SOFT_CAP,
  dailyPingRequests,
  isOverFreeCap,
  maxEntriesForInterval,
  safestInterval,
} from "./status-budget.js";

describe("dailyPingRequests", () => {
  it("returns 0 for Off or empty list", () => {
    expect(dailyPingRequests(10, 0)).toBe(0);
    expect(dailyPingRequests(0, 30)).toBe(0);
  });

  it("matches entries × 86400 / interval", () => {
    expect(dailyPingRequests(10, 30)).toBe(Math.ceil((10 * 86400) / 30));
    expect(dailyPingRequests(50, 30)).toBe(Math.ceil((50 * 86400) / 30));
  });
});

describe("maxEntriesForInterval", () => {
  it("returns Infinity for Off", () => {
    expect(maxEntriesForInterval(0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("fits under free soft cap for common intervals", () => {
    expect(maxEntriesForInterval(30)).toBe(Math.floor((FREE_WORKER_SOFT_CAP * 30) / 86400));
    expect(maxEntriesForInterval(30)).toBe(34);
    expect(maxEntriesForInterval(60)).toBe(69);
    expect(maxEntriesForInterval(300)).toBe(347);
  });
});

describe("isOverFreeCap / safestInterval", () => {
  const OPTIONS = [0, 30, 60, 300] as const;

  it("flags 40 entries at 30s as over free cap", () => {
    expect(isOverFreeCap(40, 30)).toBe(true);
    expect(isOverFreeCap(10, 30)).toBe(false);
  });

  it("picks next safe interval or Off", () => {
    expect(safestInterval(10, OPTIONS)).toBe(30);
    expect(safestInterval(40, OPTIONS)).toBe(60);
    expect(safestInterval(100, OPTIONS)).toBe(300);
    expect(safestInterval(500, OPTIONS)).toBe(0);
  });
});
