// 轻量对称加密（AES-256-GCM），用于私有工作态（含 apiKey）落盘前加密。
// 零依赖：用 WebCrypto（globalThis.crypto.subtle），Node 20+ / Workers / Vercel 均可用。
//
// v1: PBKDF2(SHA-256) → AES-256-GCM。用于 APP_PASSWORD / STATUS_SECRET 等可能较弱的人类口令。
// v2: SHA-256(上下文 + 高熵 PRIVATE_STATE_SECRET) → AES-256-GCM。仅 dedicated secret 启用，
//     避免 Cloudflare Free 每次私有状态读写都消耗昂贵 PBKDF2 CPU。
// decrypt() 同时兼容 v1/v2；旧 v1 blob 会在下一次保存时自然迁移到 v2（若配置 dedicated secret）。

const PBKDF2_ITERS = 50_000;
const LEGACY_PBKDF2_ITERS = 120_000;
const MAX_PBKDF2_ITERS = 200_000;
const SALT_LEN = 16;
const IV_LEN = 12;
const FAST_KEY_CONTEXT = "modelping:private-state:v2:";

interface EncBlobV1 {
  v: 1;
  iter?: number;
  salt: string;
  iv: string;
  ct: string;
}

interface EncBlobV2 {
  v: 2;
  kdf: "sha256";
  iv: string;
  ct: string;
}

export interface EncryptOptions {
  /** Use only when secret is a dedicated high-entropy PRIVATE_STATE_SECRET. */
  fastKdf?: boolean;
}

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derivePasswordKey(secret: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

const fastKeyCache = new Map<string, Promise<CryptoKey>>();

function deriveFastKey(secret: string): Promise<CryptoKey> {
  const cached = fastKeyCache.get(secret);
  if (cached) return cached;
  const promise = (async () => {
    const material = new TextEncoder().encode(FAST_KEY_CONTEXT + secret);
    const digest = await crypto.subtle.digest("SHA-256", material);
    return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  })();
  fastKeyCache.set(secret, promise);
  return promise;
}

async function encryptV1(plaintext: string, secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await derivePasswordKey(secret, salt, PBKDF2_ITERS);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  );
  const blob: EncBlobV1 = { v: 1, iter: PBKDF2_ITERS, salt: b64encode(salt), iv: b64encode(iv), ct: b64encode(ct) };
  return JSON.stringify(blob);
}

async function encryptV2(plaintext: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveFastKey(secret);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  );
  const blob: EncBlobV2 = { v: 2, kdf: "sha256", iv: b64encode(iv), ct: b64encode(ct) };
  return JSON.stringify(blob);
}

// 默认仍走 PBKDF2；只有调用方明确确认 secret 为 dedicated 高熵密钥时才启用 v2。
export async function encrypt(plaintext: string, secret: string, options: EncryptOptions = {}): Promise<string> {
  return options.fastKdf ? encryptV2(plaintext, secret) : encryptV1(plaintext, secret);
}

function resolveIterations(iter: unknown): number {
  if (iter === undefined) return LEGACY_PBKDF2_ITERS;
  if (!Number.isSafeInteger(iter) || (iter as number) < 1 || (iter as number) > MAX_PBKDF2_ITERS) {
    throw new Error("不支持的 PBKDF2 迭代次数");
  }
  return iter as number;
}

async function decryptV1(blob: EncBlobV1, secret: string): Promise<string> {
  const iterations = resolveIterations(blob.iter);
  const key = await derivePasswordKey(secret, b64decode(blob.salt), iterations);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(blob.iv) as BufferSource },
    key,
    b64decode(blob.ct) as BufferSource,
  );
  return new TextDecoder().decode(pt);
}

async function decryptV2(blob: EncBlobV2, secret: string): Promise<string> {
  if (blob.kdf !== "sha256") throw new Error("不支持的 v2 KDF");
  const key = await deriveFastKey(secret);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(blob.iv) as BufferSource },
    key,
    b64decode(blob.ct) as BufferSource,
  );
  return new TextDecoder().decode(pt);
}

// 自动识别 v1/v2。密钥不匹配或 GCM 校验失败会抛出。
export async function decrypt(blobStr: string, secret: string): Promise<string> {
  const blob = JSON.parse(blobStr) as EncBlobV1 | EncBlobV2 | { v?: unknown };
  if (blob?.v === 1) return decryptV1(blob as EncBlobV1, secret);
  if (blob?.v === 2) return decryptV2(blob as EncBlobV2, secret);
  throw new Error("不支持的加密格式");
}
