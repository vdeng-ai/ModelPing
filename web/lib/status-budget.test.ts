import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODELPING_DAILY_BUDGET,
  PING_BATCH_SIZE,
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

  it("counts Worker batch requests rather than entries", () => {
    expect(dailyPingRequests(10, 30)).toBe(Math.ceil(86400 / 30));
    expect(dailyPingRequests(50, 30)).toBe(Math.ceil((5 * 86400) / 30));
    expect(PING_BATCH_SIZE).toBe(10);
  });
});

describe("maxEntriesForInterval", () => {
  it("returns Infinity for Off", () => {
    expect(maxEntriesForInterval(0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("fits batches under the default 60k ModelPing budget", () => {
    expect(DEFAULT_MODELPING_DAILY_BUDGET).toBe(60_000);
    expect(maxEntriesForInterval(30)).toBe(200);
    expect(maxEntriesForInterval(60)).toBe(410);
    expect(maxEntriesForInterval(300)).toBe(2080);
  });
});

describe("isOverFreeCap / safestInterval", () => {
  const OPTIONS = [0, 30, 60, 300] as const;

  it("uses the configurable budget after batching", () => {
    expect(isOverFreeCap(210, 30)).toBe(true);
    expect(isOverFreeCap(200, 30)).toBe(false);
    expect(isOverFreeCap(100, 30, 10_000)).toBe(true);
  });

  it("picks next safe interval or Off", () => {
    expect(safestInterval(200, OPTIONS)).toBe(30);
    expect(safestInterval(210, OPTIONS)).toBe(60);
    expect(safestInterval(1000, OPTIONS)).toBe(300);
    expect(safestInterval(3000, OPTIONS)).toBe(0);
  });
});
