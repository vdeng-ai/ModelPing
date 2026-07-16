import { describe, expect, it } from "vitest";
import { appRouteFromHash, hashForAppRoute } from "./navigation.js";

describe("appRouteFromHash", () => {
  it("maps every public workspace hash", () => {
    expect(appRouteFromHash("#test/models")).toBe("test-models");
    expect(appRouteFromHash("#test/history/")).toBe("test-history");
    expect(appRouteFromHash("#status")).toBe("status");
    expect(appRouteFromHash("#providers")).toBe("providers");
  });

  it("keeps the legacy settings hash and defaults unknown hashes", () => {
    expect(appRouteFromHash("#settings")).toBe("providers");
    expect(appRouteFromHash("#unknown")).toBe("test-models");
    expect(appRouteFromHash("")).toBe("test-models");
  });
});

describe("hashForAppRoute", () => {
  it("returns stable deep-link hashes", () => {
    expect(hashForAppRoute("test-models")).toBe("#test/models");
    expect(hashForAppRoute("test-history")).toBe("#test/history");
    expect(hashForAppRoute("status")).toBe("#status");
    expect(hashForAppRoute("providers")).toBe("#providers");
  });
});
