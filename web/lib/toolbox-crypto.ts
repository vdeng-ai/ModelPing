import { hmac } from "@noble/hashes/hmac.js";
import { md5, sha1 } from "@noble/hashes/legacy.js";
import { sha256, sha384, sha512 } from "@noble/hashes/sha2.js";
import { base64ToBytes, bytesToBase64, bytesToHex, decodeBase64, encodeBase64, utf8Bytes } from "./codecs.js";
import { ToolboxError, type HashAlgorithm, type JwtAlgorithm, type JwtDetails, type ToolboxOptions } from "./toolbox-types.js";

const HASHERS = { MD5: md5, "SHA-1": sha1, "SHA-256": sha256, "SHA-384": sha384, "SHA-512": sha512 };
const JWT_HASHERS = { HS256: sha256, HS384: sha384, HS512: sha512 };
export const JWT_KEY_BYTES: Record<JwtAlgorithm, number> = { HS256: 32, HS384: 48, HS512: 64 };

export function hashText(text: string, algorithm: HashAlgorithm, format: ToolboxOptions["hashFormat"], uppercase = false): string {
  const bytes = HASHERS[algorithm](utf8Bytes(text));
  return format === "base64" ? bytesToBase64(bytes) : bytesToHex(bytes, uppercase);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { throw new ToolboxError("invalidJson"); }
}

function decodeSegment(segment: string): string {
  // Compact JWS uses unpadded Base64URL only; no internal whitespace or standard alphabet.
  if (!/^[\w-]+$/.test(segment)) throw new ToolboxError("invalidJwt");
  try { return decodeBase64(segment); } catch { throw new ToolboxError("invalidJwt"); }
}

interface ParsedJwt {
  header: Record<string, unknown> & { alg: string };
  payload: Record<string, unknown>;
  signingInput: string;
  signature: string;
}

export function parseJwt(input: string): ParsedJwt {
  const parts = input.trim().replace(/^Bearer\s+/i, "").split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !/^[\w-]*$/.test(parts[2])) throw new ToolboxError("invalidJwt");
  let header: unknown;
  let payload: unknown;
  try {
    header = parseJson(decodeSegment(parts[0]));
    payload = parseJson(decodeSegment(parts[1]));
    base64ToBytes(parts[2]);
  } catch { throw new ToolboxError("invalidJwt"); }
  if (!isObject(header) || !isObject(payload) || typeof header.alg !== "string" || !header.alg) {
    throw new ToolboxError("jwtObjects");
  }
  if ((header.alg === "none") !== (parts[2] === "")) throw new ToolboxError("invalidJwt");
  return { header: header as ParsedJwt["header"], payload, signingInput: `${parts[0]}.${parts[1]}`, signature: parts[2] };
}

function jwtClaims(payload: Record<string, unknown>, now: number): Pick<JwtDetails, "claims" | "expiresAt" | "notBefore"> {
  const exp = payload.exp;
  const nbf = payload.nbf;
  // NumericDate values must also fit the browser's Date display range.
  if ([exp, nbf].some((value) => value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 8.64e12))) {
    return { claims: "invalid" };
  }
  const expiresAt = typeof exp === "number" ? exp : undefined;
  const notBefore = typeof nbf === "number" ? nbf : undefined;
  return {
    claims: expiresAt !== undefined && now >= expiresAt ? "expired" : notBefore !== undefined && now < notBefore ? "notYetValid" : "unchecked",
    expiresAt,
    notBefore,
  };
}

/** A debugging inspector, NOT an application authentication/authorization verifier. */
export function inspectJwt(input: string, secret: string, expectedAlgorithm: JwtAlgorithm, now = Date.now() / 1000) {
  const parsed = parseJwt(input);
  const { header, payload, signature, signingInput } = parsed;
  const details: JwtDetails = { algorithm: header.alg, verification: "unchecked", weakSecret: false, ...jwtClaims(payload, now) };
  if (header.alg === "none") {
    details.verification = "unsigned";
  } else if (!Object.hasOwn(JWT_HASHERS, header.alg) || header.crit !== undefined || header.b64 !== undefined) {
    details.verification = "unsupported";
  } else if (secret) {
    if (header.alg !== expectedAlgorithm) {
      details.verification = "mismatch";
    } else {
      const key = utf8Bytes(secret);
      details.weakSecret = key.length < JWT_KEY_BYTES[expectedAlgorithm];
      const expected = hmac(JWT_HASHERS[expectedAlgorithm], key, utf8Bytes(signingInput));
      const actual = base64ToBytes(signature);
      let difference = expected.length ^ actual.length;
      for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ (actual[i] ?? 0);
      details.verification = difference === 0 ? "valid" : "invalid";
    }
  }
  return { output: JSON.stringify({ header, payload, signature }, null, 2), details };
}

/** Sign only explicitly selected HMAC algorithms. Never follow a token's jku/x5u URLs. */
export function signJwt(input: string, secret: string, algorithm: JwtAlgorithm): string {
  const value = parseJson(input);
  if (!isObject(value) || !isObject(value.payload) || (value.header !== undefined && !isObject(value.header))) {
    throw new ToolboxError("jwtObjects");
  }
  const header = { typ: "JWT", ...value.header as Record<string, unknown>, alg: algorithm };
  if (isObject(value.header) && value.header.alg !== undefined && value.header.alg !== algorithm) throw new ToolboxError("jwtAlgorithm");
  if ("crit" in header || "b64" in header) throw new ToolboxError("jwtExtension");
  if (!secret) throw new ToolboxError("secretRequired");
  const key = utf8Bytes(secret);
  if (key.length < JWT_KEY_BYTES[algorithm]) throw new ToolboxError("weakSecret", { bytes: JWT_KEY_BYTES[algorithm] });
  const signingInput = `${encodeBase64(JSON.stringify(header), true, false)}.${encodeBase64(JSON.stringify(value.payload), true, false)}`;
  const signature = hmac(JWT_HASHERS[algorithm], key, utf8Bytes(signingInput));
  return `${signingInput}.${bytesToBase64(signature, true, false)}`;
}
