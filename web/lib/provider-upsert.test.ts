import { describe, expect, it } from "vitest";
import type { ProviderPreset } from "./types.js";
import {
  mergeProviderModels,
  nextProviderId,
  removeProviderModelsByLabel,
  upsertProviderFromConn,
  upsertProviderModel,
} from "./provider-upsert.js";

const base: ProviderPreset = {
  id: "acme",
  name: "Acme",
  baseUrl: "https://api.acme.test/v1",
  models: [{ id: "m1" }],
};

describe("provider-upsert", () => {
  it("merges model ids without duplicates", () => {
    const next = mergeProviderModels(base, ["m1", " m2 ", "", "m2"]);
    expect(next.models.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("upserts model onto named provider only", () => {
    const providers = [base, { id: "other", name: "Other", baseUrl: "https://o.test", models: [] }];
    const next = upsertProviderModel(providers, "acme", "new-m");
    expect(next.find((p) => p.id === "acme")?.models.map((m) => m.id)).toEqual(["m1", "new-m"]);
    expect(next.find((p) => p.id === "other")?.models).toEqual([]);
    expect(upsertProviderModel(providers, "custom", "x")).toBe(providers);
  });

  it("removes every provider mapping for the same display label", () => {
    const providers: ProviderPreset[] = [
      {
        ...base,
        models: [
          { id: "shared-direct" },
          { id: "vendor/shared", label: "shared-direct" },
          { id: "keep" },
        ],
      },
      {
        id: "other",
        name: "Other",
        baseUrl: "https://o.test",
        models: [{ id: "another/shared", label: "shared-direct" }],
      },
    ];

    const result = removeProviderModelsByLabel(providers, " shared-direct ");

    expect(result.affectedProviders).toEqual([
      { id: "acme", name: "Acme" },
      { id: "other", name: "Other" },
    ]);
    expect(result.providers[0].models).toEqual([{ id: "keep" }]);
    expect(result.providers[1].models).toEqual([]);
    expect(providers[0].models).toHaveLength(3);
  });

  it("returns the original provider array when no display label matches", () => {
    const providers = [base];
    const result = removeProviderModelsByLabel(providers, "missing");

    expect(result.providers).toBe(providers);
    expect(result.affectedProviders).toEqual([]);
  });

  it("allocates unique provider ids", () => {
    expect(nextProviderId(["provider-1", "provider-2"])).toBe("provider-3");
    expect(nextProviderId(["acme"], "Acme Cloud!")).toBe("acme-cloud");
    expect(nextProviderId(["acme-cloud"], "Acme Cloud!")).toBe("provider-1");
    expect(nextProviderId([], "custom")).toBe("provider-1");
  });

  it("updates existing provider from conn draft", () => {
    const { providers, providerId } = upsertProviderFromConn([base], {
      providerId: "acme",
      name: "Acme Renamed",
      baseUrl: "https://api.acme.test/v2",
      isFullUrl: true,
      models: ["m1", "m3"],
    });
    expect(providerId).toBe("acme");
    expect(providers).toHaveLength(1);
    expect(providers[0]).toMatchObject({
      name: "Acme Renamed",
      baseUrl: "https://api.acme.test/v2",
      isFullUrl: true,
    });
    expect(providers[0].models.map((m) => m.id)).toEqual(["m1", "m3"]);
  });

  it("creates a new provider when custom/no match", () => {
    const { providers, providerId } = upsertProviderFromConn([base], {
      name: "My Proxy",
      baseUrl: "https://proxy.test/v1",
      models: ["gpt-x"],
    });
    expect(providerId).toBe("my-proxy");
    expect(providers).toHaveLength(2);
    expect(providers[1]).toMatchObject({
      id: "my-proxy",
      name: "My Proxy",
      baseUrl: "https://proxy.test/v1",
      models: [{ id: "gpt-x" }],
    });
  });
});
