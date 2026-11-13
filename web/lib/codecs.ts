import { decodeHTML, escapeUTF8 } from "entities";
import { MAX_TOOLBOX_INPUT, ToolboxError, type ToolboxOptions } from "./toolbox-types.js";

export function assertInputSize(input: string): void {
  if (input.length > MAX_TOOLBOX_INPUT) throw new ToolboxError("tooLarge", { max: MAX_TOOLBOX_INPUT });
}

/** TextEncoder otherwise silently replaces unpaired surrogates with U+FFFD. */
export function assertUnicode(input: string): void {
  for (let i = 0; i < input.length; i++) {
    const unit = input.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = input.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new ToolboxError("invalidUnicode");
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new ToolboxError("invalidUnicode");
    }
  }
}

export function utf8Bytes(input: string): Uint8Array {
  assertUnicode(input);
  return new TextEncoder().encode(input);
}

export function utf8Text(bytes: Uint8Array): string {
  try {
    // Preserve a leading U+FEFF instead of silently eating the BOM on round-trip.
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new ToolboxError("invalidUtf8");
  }
}

export function bytesToBase64(bytes: Uint8Array, urlSafe = false, padding = true): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
  }
  let result = btoa(chunks.join(""));
  if (urlSafe) result = result.replace(/\+/g, "-").replace(/\//g, "_");
  return padding ? result : result.replace(/=+$/, "");
}

/** Accept standard or URL-safe alphabets, with optional padding and ASCII whitespace. */
export function base64ToBytes(input: string): Uint8Array {
  const compact = input.replace(/[\t\n\r ]/g, "");
  if (!compact) return new Uint8Array();
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact) || (/[+/]/.test(compact) && /[-_]/.test(compact))) {
    throw new ToolboxError("invalidBase64");
  }
  const normalized = compact.replace(/-/g, "+").replace(/_/g, "/");
  const raw = normalized.replace(/=+$/, "");
  const padding = (4 - raw.length % 4) % 4;
  if (padding === 3 || (normalized.includes("=") && normalized !== raw + "=".repeat(padding))) {
    throw new ToolboxError("invalidBase64");
  }
  try {
    const bytes = Uint8Array.from(atob(raw + "=".repeat(padding)), (char) => char.charCodeAt(0));
    // RFC 4648 canonical pad bits: e.g. "Zh==" must not silently become "f".
    if (bytesToBase64(bytes, false, false) !== raw) throw new ToolboxError("invalidBase64");
    return bytes;
  } catch {
    throw new ToolboxError("invalidBase64");
  }
}

export const encodeBase64 = (text: string, urlSafe = false, padding = true) => bytesToBase64(utf8Bytes(text), urlSafe, padding);
export const decodeBase64 = (text: string) => utf8Text(base64ToBytes(text));

/** Auto detection is necessarily a heuristic: only canonical, printable UTF-8 is decoded. */
export function isProbablyBase64(text: string): boolean {
  if (!text.trim()) return false;
  try {
    const decoded = decodeBase64(text);
    // eslint-disable-next-line no-control-regex
    return decoded.length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(decoded);
  } catch {
    return false;
  }
}

export function bytesToHex(bytes: Uint8Array, uppercase = false, separator = ""): string {
  const text = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(separator);
  return uppercase ? text.toUpperCase() : text;
}

export function encodeHex(text: string, uppercase = false, separator = " "): string {
  return bytesToHex(utf8Bytes(text), uppercase, separator);
}

export function decodeHex(text: string): string {
  const input = text.trim();
  if (!input) return "";
  let raw: string;
  if (/^(?:0x)?[\da-f]+$/i.test(input)) {
    raw = input.replace(/^0x/i, "");
  } else {
    const tokens = input.split(/[\s,:-]+/);
    if (!tokens.every((token) => /^(?:0x)?[\da-f]{2}$/i.test(token))) throw new ToolboxError("invalidHex");
    raw = tokens.map((token) => token.replace(/^0x/i, "")).join("");
  }
  if (raw.length % 2) throw new ToolboxError("invalidHex");
  return utf8Text(Uint8Array.from(raw.match(/../g) ?? [], (byte) => parseInt(byte, 16)));
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function encodeBase32(text: string, padding = true): string {
  const bytes = utf8Bytes(text);
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(value >>> bits) & 31];
    }
    value &= (1 << bits) - 1;
  }
  if (bits) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return padding ? output.padEnd(Math.ceil(output.length / 8) * 8, "=") : output;
}

export function decodeBase32(text: string): string {
  const compact = text.replace(/[\t\n\r ]/g, "").toUpperCase();
  if (!compact) return "";
  if (!/^[A-Z2-7]+={0,6}$/.test(compact)) throw new ToolboxError("invalidBase32");
  const raw = compact.replace(/=+$/, "");
  if (![0, 2, 4, 5, 7].includes(raw.length % 8)) throw new ToolboxError("invalidBase32");
  if (compact.includes("=") && compact !== raw.padEnd(Math.ceil(raw.length / 8) * 8, "=")) {
    throw new ToolboxError("invalidBase32");
  }
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of raw) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
    value &= (1 << bits) - 1;
  }
  if (value !== 0) throw new ToolboxError("invalidBase32");
  return utf8Text(Uint8Array.from(bytes));
}

export function convertUrl(text: string, encode: boolean, mode: ToolboxOptions["urlMode"]): string {
  try {
    if (mode === "uri") return encode ? encodeURI(text) : decodeURI(text);
    if (!encode) return decodeURIComponent(mode === "form" ? text.replace(/\+/g, " ") : text);
    const result = encodeURIComponent(text);
    return mode === "form"
      ? result.replace(/%20/g, "+").replace(/[!'()~]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
      : result;
  } catch {
    throw new ToolboxError("invalidUrl");
  }
}

export function encodeUnicode(text: string, mode: ToolboxOptions["unicodeMode"]): string {
  assertUnicode(text);
  if (mode === "codepoint") {
    return Array.from(text, (char) => `\\u{${char.codePointAt(0)!.toString(16)}}`).join("");
  }
  return text.split("").map((char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`).join("");
}

export function decodeUnicode(text: string): string {
  const simple: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0", "\\": "\\", '"': '"', "'": "'", "/": "/" };
  const parts: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "\\") { parts.push(text[i]); continue; }
    const kind = text[++i];
    if (kind === "u" || kind === "x") {
      const rest = text.slice(i + 1);
      const match = kind === "u" && rest[0] === "{"
        ? /^\{([\da-fA-F]{1,6})\}/.exec(rest)
        : (kind === "u" ? /^([\da-fA-F]{4})/ : /^([\da-fA-F]{2})/).exec(rest);
      if (!match) throw new ToolboxError("invalidUnicode");
      const point = parseInt(match[1], 16);
      if (point > 0x10ffff) throw new ToolboxError("invalidUnicode");
      parts.push(String.fromCodePoint(point));
      i += match[0].length;
    } else if (Object.hasOwn(simple, kind) && !(kind === "0" && /\d/.test(text[i + 1] ?? ""))) {
      parts.push(simple[kind]);
    } else {
      throw new ToolboxError("invalidUnicode");
    }
  }
  const result = parts.join("");
  assertUnicode(result);
  return result;
}

export function encodeHtml(text: string, mode: ToolboxOptions["htmlMode"]): string {
  assertUnicode(text);
  if (mode === "named") return escapeUTF8(text);
  return Array.from(text, (char) => mode === "hex"
    ? `&#x${char.codePointAt(0)!.toString(16)};`
    : `&#${char.codePointAt(0)!};`).join("");
}

// A parser library, not innerHTML/DOMParser: decoded markup is never executed or fetched.
export const decodeHtml = (text: string): string => decodeHTML(text);

export function convertRot(text: string, mode: ToolboxOptions["rotMode"]): string {
  return text.replace(/[!-~]/g, (char) => {
    const code = char.charCodeAt(0);
    if (mode === "47") return String.fromCharCode(33 + (code - 33 + 47) % 94);
    if (mode !== "5" && /[a-z]/i.test(char)) {
      const base = code <= 90 ? 65 : 97;
      return String.fromCharCode(base + (code - base + 13) % 26);
    }
    if (mode !== "13" && /\d/.test(char)) return String.fromCharCode(48 + (code - 48 + 5) % 10);
    return char;
  });
}

const MORSE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--",
  N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
  ".": ".-.-.-", ",": "--..--", "?": "..--..", "'": ".----.", "!": "-.-.--", "/": "-..-.", "(": "-.--.", ")": "-.--.-", "&": ".-...",
  ":": "---...", ";": "-.-.-.", "=": "-...-", "+": ".-.-.", "-": "-....-", "_": "..--.-", '"': ".-..-.", "$": "...-..-", "@": ".--.-.",
};
const FROM_MORSE = Object.fromEntries(Object.entries(MORSE).map(([char, code]) => [code, char]));

export function encodeMorse(text: string): string {
  return text.split(/\r?\n/).map((line) => line.trim().split(/\s+/).filter(Boolean).map((word) =>
    Array.from(word, (char) => {
      // Uppercasing the entire string would silently turn unsupported ß into SS.
      if (char.charCodeAt(0) > 127) throw new ToolboxError("unsupportedMorse", { char });
      const code = MORSE[char.toUpperCase()];
      if (!code) throw new ToolboxError("unsupportedMorse", { char });
      return code;
    }).join(" "),
  ).join(" / ")).join("\n");
}

export function decodeMorse(text: string): string {
  return text.replace(/·/g, ".").replace(/[−–—]/g, "-").split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return "";
    return trimmed.split(/\s*\/\s*|[ \t]{3,}/).map((word) => {
      if (!word) throw new ToolboxError("invalidMorse");
      return word.split(/[ \t]+/).map((code) => {
        if (!Object.hasOwn(FROM_MORSE, code)) throw new ToolboxError("invalidMorse");
        return FROM_MORSE[code];
      }).join("");
    }).join(" ");
  }).join("\n");
}
