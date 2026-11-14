import { describe, expect, it } from "vitest";
import { normalizeExternalCatalog } from "./model-catalog.js";

describe("normalizeExternalCatalog", () => {
  it("normalizes provider metadata and keeps active model IDs", () => {
    const result = normalizeExternalCatalog({
      openai: {
        name: "OpenAI", api: "https://api.openai.com/v1", doc: "https://platform.openai.com/docs",
        models: {
          "gpt-z": { name: "GPT Z", release_date: "2026-01-01", limit: { context: 1000 }, modalities: { input: ["text", "image"] } },
          "old-model": { status: "deprecated" },
          "deleted-model": { deleted: true },
        },
      },
      broken: { models: {} },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" });
    expect(result[0].models).toEqual([{ id: "gpt-z", label: "GPT Z", releaseDate: "2026-01-01", context: 1000, modalities: ["text", "image"] }]);
  });

  it("rejects malformed roots and unsafe metadata URLs", () => {
    expect(() => normalizeExternalCatalog([])).toThrow();
    const [provider] = normalizeExternalCatalog({ x: { api: "http://unsafe.example", doc: "javascript:alert(1)", models: { m: {} } } });
    expect(provider).toMatchObject({ baseUrl: "", docs: "" });
  });
});
