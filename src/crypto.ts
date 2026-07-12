// 轻量对称加密（AES-256-GCM），用于私有工作态（含 apiKey）落盘前加密。
// 零依赖：用 WebCrypto（globalThis.crypto.subtle），Node 20+ / Workers / Vercel 均可用。
// 密钥由 PRIVATE_STATE_SECRET || STATUS_SECRET || APP_PASSWORD 经 PBKDF2(SHA-256) 派生；每次加密用随机 salt+iv。
// 落盘格式：JSON { v:1, iter, salt, iv, ct }（salt/iv/ct 均 base64；iter 可缺省，旧 blob 无此字段）。
//
// PBKDF2 迭代次数取舍：
//   - Cloudflare Workers 的 WebCrypto 硬性拒绝 >100000 的迭代（NotSupportedError）——
//     这是本次 private-state PUT 500 的直接原因；100000 是绝对上限。
//   - Workers Free 每请求仅 10ms CPU，100000 次实测已逼近该预算，故生产值取 50000
//     留约 2x 余量；部署后可据日志 cpuTimeMs 决定是否上调（仍须 <=100000）。
//   - iter 写进 blob，解密按 blob 记录的次数派生，与调参解耦。
//   - 缺失 iter 的旧 blob 回退 120000：仅在支持该值的 Node/Vercel 上可解密；
//     Cloudflare 上若遇到（KV 现为空，不会发生）会被运行时拒绝，属预期。
const PBKDF2_ITERS = 50_000;
const LEGACY_PBKDF2_ITERS = 120_000;
// 解密时对 blob.iter 的合理性上限：拦截损坏/畸形/超大值（避免 Node 上跑飞）。
// 这不是 CF 的 100000 硬限——运行时自会拒绝它无法执行的次数；此处只挡明显非法值，
// 且须 >= 旧值 120000，否则会误伤 Node/Vercel 上的历史 blob。
const MAX_PBKDF2_ITERS = 200_000;
const SALT_LEN = 16;
const IV_LEN = 12;

interface EncBlob {
  v: 1;
  iter?: number;
  salt: string;
  iv: string;
  ct: string;
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

async function deriveKey(secret: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
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

// 加密明文，返回可直接落盘的 JSON 字符串。
export async function encrypt(plaintext: string, secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(secret, salt, PBKDF2_ITERS);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  );
  const blob: EncBlob = { v: 1, iter: PBKDF2_ITERS, salt: b64encode(salt), iv: b64encode(iv), ct: b64encode(ct) };
  return JSON.stringify(blob);
}

// blob.iter 合理性校验：只有字段「真正缺失」（undefined，旧 blob 无此键）才回退 120000；
// 存在则须为 [1, MAX] 内的安全整数，否则拒绝。注意 null 属畸形（合法 JSON，且 NaN/Infinity
// 经 JSON.stringify 会变成 null），必须走拒绝路径，不能与「缺失」混为一谈。
// 拦截损坏/畸形/超大迭代数（防止 Node 上被恶意 blob 拖入超长 KDF）。
function resolveIterations(iter: unknown): number {
  if (iter === undefined) return LEGACY_PBKDF2_ITERS;
  if (!Number.isSafeInteger(iter) || (iter as number) < 1 || (iter as number) > MAX_PBKDF2_ITERS) {
    throw new Error("不支持的 PBKDF2 迭代次数");
  }
  return iter as number;
}

// 解密 encrypt() 产出的 JSON 字符串。密钥/密文不匹配会抛出（GCM 校验失败）。
export async function decrypt(blobStr: string, secret: string): Promise<string> {
  const blob = JSON.parse(blobStr) as EncBlob;
  if (blob?.v !== 1) throw new Error("不支持的加密格式");
  const iterations = resolveIterations(blob.iter);
  const key = await deriveKey(secret, b64decode(blob.salt), iterations);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(blob.iv) as BufferSource },
    key,
    b64decode(blob.ct) as BufferSource,
  );
  return new TextDecoder().decode(pt);
}
