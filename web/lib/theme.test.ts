import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("theme with restricted browser storage", () => {
  it("keeps theme controls usable when storage reads and writes are denied", async () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    const dataset: Record<string, string> = {};
    vi.stubGlobal("document", { documentElement: { dataset } });
    const { getThemePref, setThemePref, initTheme } = await import("./theme.js");
    expect(initTheme()).toBe("system");
    setThemePref("dark");
    expect(dataset.theme).toBe("dark");
    expect(getThemePref()).toBe("dark");
  });
  it("still restores persisted preferences", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "light" });
    const { getThemePref } = await import("./theme.js");
    expect(getThemePref()).toBe("light");
  });
});
