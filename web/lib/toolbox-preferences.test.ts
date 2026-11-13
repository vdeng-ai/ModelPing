import { afterEach, describe, expect, it, vi } from "vitest";
import { loadToolboxPreferences, sanitizeToolboxPreferences, saveToolboxPreferences, TOOLBOX_PREFERENCES_KEY } from "./toolbox-preferences.js";
import { toolboxEn } from "./locales/toolbox-en.js";
import { toolboxZh } from "./locales/toolbox-zh.js";

afterEach(() => vi.unstubAllGlobals());

describe("toolbox preferences and privacy", () => {
  it("provides safe, independent defaults", () => {
    const defaults = sanitizeToolboxPreferences(null);
    expect(defaults.tool).toBe("quick-base64");
    expect(defaults.directions["quick-base64"]).toBe("auto");
    expect(defaults.directions.jwt).toBe("decode");
    defaults.options.hashAlgorithm = "MD5";
    expect(sanitizeToolboxPreferences(null).options.hashAlgorithm).toBe("SHA-256");
  });
  it("validates all saved options and directions", () => {
    const preferences = sanitizeToolboxPreferences({ tool: "invalid", directions: { jwt: "auto", base64: "decode" }, options: { rotMode: "bad", hashAlgorithm: "SHA-512", base64Padding: "false", hexSeparator: "colon" } });
    expect(preferences.tool).toBe("quick-base64");
    expect(preferences.directions.jwt).toBe("decode");
    expect(preferences.directions.base64).toBe("decode");
    expect(preferences.options).toMatchObject({ rotMode: "13", hashAlgorithm: "SHA-512", base64Padding: true, hexSeparator: "colon" });
  });
  it("does not persist input, output, tokens or secrets, even when accidentally passed extra properties", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem });
    const preferences = { ...sanitizeToolboxPreferences(null), secret: "private-key", input: "private-input", output: "private-output", drafts: { jwt: "private-token" } };
    expect(saveToolboxPreferences(preferences)).toBe(true);
    expect(setItem.mock.calls[0][0]).toBe(TOOLBOX_PREFERENCES_KEY);
    const stored = setItem.mock.calls[0][1] as string;
    expect(stored).not.toContain("private-");
    expect(Object.keys(JSON.parse(stored))).toEqual(["tool", "directions", "options"]);
  });
  it("survives disabled storage and corrupt JSON", () => {
    vi.stubGlobal("localStorage", { getItem: () => "{broken", setItem: () => { throw new Error("denied"); } });
    expect(loadToolboxPreferences().tool).toBe("quick-base64");
    expect(saveToolboxPreferences(sanitizeToolboxPreferences(null))).toBe(false);
    vi.stubGlobal("localStorage", undefined);
    expect(loadToolboxPreferences().tool).toBe("quick-base64");
  });
  it("restores valid preferences", () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ tool: "hash", options: { hashAlgorithm: "MD5" } }) });
    expect(loadToolboxPreferences()).toMatchObject({ tool: "hash", options: { hashAlgorithm: "MD5" } });
  });
});

describe("toolbox translations", () => {
  function leaves(value: Record<string, unknown>, prefix = ""): string[] {
    return Object.entries(value).flatMap(([key, item]) => typeof item === "object" && item !== null ? leaves(item as Record<string, unknown>, `${prefix}${key}.`) : [`${prefix}${key}`]);
  }
  it("has matching Chinese and English translation keys", () => expect(leaves(toolboxEn).sort()).toEqual(leaves(toolboxZh).sort()));
});
