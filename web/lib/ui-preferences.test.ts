import { afterEach, expect, it, vi } from "vitest";
import { readDensity, writeDensity } from "./ui-preferences.js";

afterEach(() => vi.unstubAllGlobals());
it("stores only a local density choice", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k),
    setItem: (k: string, v: string) => values.set(k, v),
  });
  expect(readDensity()).toBe("comfortable");
  writeDensity("compact");
  expect(readDensity()).toBe("compact");
  expect([...values.entries()]).toEqual([["modelping:ui-density", "compact"]]);
});
it("keeps the UI usable when storage is unavailable", () => {
  vi.stubGlobal("localStorage", {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
  });
  expect(readDensity()).toBe("comfortable");
  expect(() => writeDensity("compact")).not.toThrow();
});
