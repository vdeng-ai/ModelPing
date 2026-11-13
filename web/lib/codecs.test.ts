import { describe, expect, it } from "vitest";
import { base64ToBytes, convertRot, convertUrl, decodeBase32, decodeBase64, decodeHex, decodeHtml, decodeMorse, decodeUnicode, encodeBase32, encodeBase64, encodeHex, encodeHtml, encodeMorse, encodeUnicode, isProbablyBase64 } from "./codecs.js";
import { runToolbox } from "./toolbox-engine.js";
import { DEFAULT_TOOLBOX_OPTIONS, MAX_TOOLBOX_INPUT, TOOL_IDS, type Direction, type ToolId, type ToolboxOptions } from "./toolbox-types.js";
import { toolboxExample } from "./toolbox-examples.js";

const UNICODE = "\ufeffHello, ModelPing! 你好 👋 café\n\t\0";
const vectors = [
  ["", "", ""], ["f", "Zg==", "MY======"], ["fo", "Zm8=", "MZXQ===="],
  ["foo", "Zm9v", "MZXW6==="], ["foob", "Zm9vYg==", "MZXW6YQ="],
  ["fooba", "Zm9vYmE=", "MZXW6YTB"], ["foobar", "Zm9vYmFy", "MZXW6YTBOI======"],
];

describe("Base-N RFC 4648 vectors", () => {
  it.each(vectors)("encodes and decodes %j", (text, b64, b32) => {
    expect(encodeBase64(text)).toBe(b64);
    expect(decodeBase64(b64)).toBe(text);
    expect(encodeBase32(text)).toBe(b32);
    expect(decodeBase32(b32)).toBe(text);
  });
  it("preserves Unicode, BOM, control characters and unpadded forms", () => {
    expect(decodeBase64(encodeBase64(UNICODE))).toBe(UNICODE);
    expect(decodeBase64(encodeBase64(UNICODE, true, false))).toBe(UNICODE);
    expect(decodeBase32(encodeBase32(UNICODE, false).toLowerCase())).toBe(UNICODE);
    expect(decodeBase64(" Zm9v\nYmFy\r\t")).toBe("foobar");
    expect(decodeBase32(" MZXW6\nYTBOI====== ")).toBe("foobar");
  });
  it("processes larger input without argument-stack overflow", () => {
    const input = "你好 👋".repeat(20_000);
    expect(decodeBase64(encodeBase64(input))).toBe(input);
    expect(decodeBase32(encodeBase32(input))).toBe(input);
  });
  it.each(["=", "A", "Zg=", "Zg===", "Zg====", "Zh==", "Zm9=", "Zm9v=", "ab-c+/", "%%%", "Zg==$", "Zg\u00a0=="])("rejects noncanonical Base64 %j", (text) => {
    expect(() => decodeBase64(text)).toThrow("invalidBase64");
  });
  it.each(["=", "M", "MZX", "MZXW6Y", "MY=", "MY=======", "MZ======", "M1======", "MZXW6YTB=", "MZXW6YTB!", "MY======M"])("rejects malformed Base32 %j", (text) => {
    expect(() => decodeBase32(text)).toThrow("invalidBase32");
  });
  it("rejects binary data that is not UTF-8 without replacing it", () => {
    expect(base64ToBytes("/w==")).toEqual(new Uint8Array([255]));
    expect(() => decodeBase64("/w==")).toThrow("invalidUtf8");
    expect(() => decodeBase32("74======")).toThrow("invalidUtf8");
  });
  it.each(["hello", "test", "AAAA", "/w==", "", "  ", "Zh=="])("does not auto-decode ordinary/invalid/binary input %j", (text) => {
    expect(isProbablyBase64(text)).toBe(false);
  });
  it.each(["SGVsbG8=", "5L2g5aW9", "YWJj", "8J-Riw"])("auto-detects printable UTF-8 Base64 %j", (text) => {
    expect(isProbablyBase64(text)).toBe(true);
  });
});

describe("Hex", () => {
  it.each(["4869", "0x4869", "48 69", "0x48 0x69", "48:69", "48-69", "48,69", " 48\n69 "])("decodes %j", (text) => expect(decodeHex(text)).toBe("Hi"));
  it("round-trips UTF-8, including BOM and emoji", () => {
    expect(decodeHex(encodeHex(UNICODE, true, ":"))).toBe(UNICODE);
    expect(encodeHex("你好", true, "")).toBe("E4BDA0E5A5BD");
  });
  it.each(["0", "4g", "0x", "48:6", "480x69", "48-", "48 0069"])("rejects malformed bytes %j", (text) => expect(() => decodeHex(text)).toThrow("invalidHex"));
  it("rejects invalid UTF-8", () => expect(() => decodeHex("ff")).toThrow("invalidUtf8"));
});

describe("URL", () => {
  it.each(["component", "form"] as const)("round-trips %s mode", (mode) => {
    const input = "你好 & + / !'()~* 👋";
    expect(convertUrl(convertUrl(input, true, mode), false, mode)).toBe(input);
    if (mode === "form") expect(convertUrl(input, true, mode)).toBe(new URLSearchParams({ q: input }).toString().slice(2));
  });
  it("keeps plus signs except in form mode", () => {
    expect(convertUrl("a+b%2Bc", false, "component")).toBe("a+b+c");
    expect(convertUrl("a+b%2Bc", false, "form")).toBe("a b+c");
  });
  it("preserves reserved delimiters in full-URI mode", () => {
    expect(convertUrl("https://example.com/你好?q=hello world", true, "uri")).toBe("https://example.com/%E4%BD%A0%E5%A5%BD?q=hello%20world");
    expect(convertUrl("%2F%3F%26", false, "uri")).toBe("%2F%3F%26");
  });
  it.each(["%", "%GG", "%FF", "%E4%BD"])("rejects bad escapes %j", (input) => expect(() => convertUrl(input, false, "component")).toThrow("invalidUrl"));
});

describe("Unicode escapes", () => {
  it.each(["utf16", "codepoint"] as const)("round-trips %s", (mode) => expect(decodeUnicode(encodeUnicode(UNICODE, mode))).toBe(UNICODE));
  it("decodes JavaScript escapes without evaluating code or recursively decoding", () => {
    expect(decodeUnicode(String.raw`\u4f60\u597d \u{1F44B}\n\x41\t\0`)).toBe("你好 👋\nA\t\0");
    expect(decodeUnicode(String.raw`\\u0041`)).toBe(String.raw`\u0041`);
    expect(decodeUnicode("alert('hello')")).toBe("alert('hello')");
  });
  it.each([String.raw`\uZZZZ`, String.raw`\u123`, String.raw`\u{110000}`, String.raw`\u{}`, String.raw`\ud800`, String.raw`\udc00`, String.raw`\q`, String.raw`\01`, "\\"])("rejects malformed escape %j", (input) => expect(() => decodeUnicode(input)).toThrow("invalidUnicode"));
  it("rejects unpaired source surrogates instead of corrupting them", () => {
    expect(() => encodeBase64("\ud800")).toThrow("invalidUnicode");
    expect(() => encodeUnicode("\udc00", "utf16")).toThrow("invalidUnicode");
  });
});

describe("HTML / ROT / Morse", () => {
  it.each(["named", "decimal", "hex"] as const)("round-trips HTML %s", (mode) => {
    const input = '<div title="你好">& \' 👋</div>';
    expect(decodeHtml(encodeHtml(input, mode))).toBe(input);
  });
  it("supports the HTML5 entity set and returns markup as inert text", () => {
    expect(decodeHtml("&copy; &euro; &NotEqualTilde; &#x1F44B;")).toBe("© € ≂̸ 👋");
    expect(decodeHtml("&lt;img src=x onerror=alert(1)&gt;")).toBe("<img src=x onerror=alert(1)>");
    expect(decodeHtml("&amp;lt;")).toBe("&lt;");
  });
  it.each(["13", "5", "18", "47"] as const)("ROT%s is an involution", (mode) => {
    const input = "Abc xyz 0123456789 !@# 你好 👋";
    expect(convertRot(convertRot(input, mode), mode)).toBe(input);
  });
  it("matches ROT vectors", () => {
    expect(convertRot("Hello 123", "13")).toBe("Uryyb 123");
    expect(convertRot("Hello 123", "5")).toBe("Hello 678");
    expect(convertRot("Hello 123", "18")).toBe("Uryyb 678");
  });
  it("uses word separators, uppercase and preserved line breaks in Morse", () => {
    expect(encodeMorse("SOS HELP")).toBe("... --- ... / .... . .-.. .--.");
    expect(decodeMorse(encodeMorse("SOS\nHello, world! 123"))).toBe("SOS\nHELLO, WORLD! 123");
    expect(decodeMorse("··· −−− ···   .... ..")).toBe("SOS HI");
  });
  it.each(["你好", "ß", "😀"])("reports unsupported Morse input %j", (input) => expect(() => encodeMorse(input)).toThrow("unsupportedMorse"));
  it.each(["......", "abc", "... // ---", "... /", "toString"])("rejects invalid Morse %j", (input) => expect(() => decodeMorse(input)).toThrow("invalidMorse"));
});

describe("toolbox dispatch and boundaries", () => {
  const run = (tool: ToolId, input: string, direction: Direction = "encode", overrides: Partial<ToolboxOptions> = {}) => runToolbox({ tool, input, direction, options: { ...DEFAULT_TOOLBOX_OPTIONS, ...overrides }, secret: "" });
  it("honors automatic and explicit Base64 directions", () => {
    expect(run("quick-base64", "SGVsbG8=", "auto")).toEqual({ ok: true, output: "Hello", direction: "decode" });
    expect(run("quick-base64", "hello", "auto")).toEqual({ ok: true, output: "aGVsbG8=", direction: "encode" });
    expect(run("quick-base64", "SGVsbG8=", "encode")).toEqual({ ok: true, output: "U0dWc2JHOD0=", direction: "encode" });
    expect(run("quick-base64", "not base64!", "decode")).toMatchObject({ ok: false, error: "invalidBase64" });
  });
  it.each(TOOL_IDS.filter((tool) => tool !== "hash"))("clears %s output on empty input", (tool) => expect(run(tool, "")).toMatchObject({ ok: true, output: "" }));
  it("hashes empty input, rather than treating it as no result", () => expect(run("hash", "")).toMatchObject({ ok: true, direction: "hash", output: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" }));
  it("bounds input size before doing conversion work", () => expect(run("base64", "a".repeat(MAX_TOOLBOX_INPUT + 1))).toMatchObject({ ok: false, error: "tooLarge" }));
  it.each(TOOL_IDS)("provides working examples for %s", (tool) => {
    for (const direction of ["encode", "decode"] as const) {
      const { input, secret = "" } = toolboxExample(tool, direction, DEFAULT_TOOLBOX_OPTIONS);
      expect(runToolbox({ tool, input, direction, options: DEFAULT_TOOLBOX_OPTIONS, secret })).toMatchObject({ ok: true });
    }
  });
});
