import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto.js";

describe("crypto", () => {
  it("round-trips the password-compatible v1 format", async () => {
    const secret = "s3cr3t";
    const plaintext = JSON.stringify({ apiKey: "sk-live", note: "私有工作态" });
    const blob = await encrypt(plaintext, secret);
    expect(blob).not.toContain("sk-live");
    expect(JSON.parse(blob).v).toBe(1);
    expect(await decrypt(blob, secret)).toBe(plaintext);
  });

  it("round-trips the fast v2 format for dedicated high-entropy secrets", async () => {
    const secret = "random-private-state-secret-0123456789";
    const plaintext = JSON.stringify({ apiKey: "sk-live", mode: "fast" });
    const blob = await encrypt(plaintext, secret, { fastKdf: true });
    const parsed = JSON.parse(blob) as { v: number; kdf?: string; iter?: number };
    expect(parsed).toMatchObject({ v: 2, kdf: "sha256" });
    expect(parsed.iter).toBeUndefined();
    expect(blob).not.toContain("sk-live");
    expect(await decrypt(blob, secret)).toBe(plaintext);
  });

  it("keeps PBKDF2 iterations within the Cloudflare Workers limit (<=100000)", async () => {
    const blob = JSON.parse(await encrypt("x", "s")) as { iter?: number };
    expect(typeof blob.iter).toBe("number");
    expect(blob.iter!).toBeLessThanOrEqual(100_000);
  });

  it("decrypts legacy blobs that predate the iter field (falls back to 120000)", async () => {
    const secret = "legacy-secret";
    const plaintext = "legacy payload 私有";
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt as BufferSource, iterations: 120_000, hash: "SHA-256" },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(plaintext));
    const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...(buf instanceof Uint8Array ? buf : new Uint8Array(buf))));
    const legacyBlob = JSON.stringify({ v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) });
    expect(await decrypt(legacyBlob, secret)).toBe(plaintext);
  });

  it("fails to decrypt either format with the wrong secret", async () => {
    const v1 = await encrypt("top secret", "right");
    const v2 = await encrypt("top secret", "right", { fastKdf: true });
    await expect(decrypt(v1, "wrong")).rejects.toThrow();
    await expect(decrypt(v2, "wrong")).rejects.toThrow();
  });

  it("rejects an unsupported blob version", async () => {
    await expect(decrypt(JSON.stringify({ v: 3, iv: "", ct: "" }), "s")).rejects.toThrow("不支持的加密格式");
  });

  it("rejects an unsupported v2 KDF", async () => {
    await expect(decrypt(JSON.stringify({ v: 2, kdf: "pbkdf2", iv: "", ct: "" }), "s")).rejects.toThrow("不支持的 v2 KDF");
  });

  it("rejects blobs with a present-but-malformed iter (guards against corrupt/DoS values)", async () => {
    const base = { v: 1 as const, salt: "", iv: "", ct: "" };
    for (const iter of [null, 0, -1, 1.5, 200_001, "50000", true, {}]) {
      await expect(decrypt(JSON.stringify({ ...base, iter }), "s")).rejects.toThrow("不支持的 PBKDF2 迭代次数");
    }
  });

  it("rejects an iter that serialized to null (e.g. NaN/Infinity)", async () => {
    const blob = JSON.stringify({ v: 1, iter: Number.NaN, salt: "", iv: "", ct: "" });
    await expect(decrypt(blob, "s")).rejects.toThrow("不支持的 PBKDF2 迭代次数");
  });
});
