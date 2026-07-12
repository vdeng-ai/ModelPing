import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto.js";

describe("crypto", () => {
  it("round-trips plaintext through encrypt/decrypt", async () => {
    const secret = "s3cr3t";
    const plaintext = JSON.stringify({ apiKey: "sk-live", note: "私有工作态" });
    const blob = await encrypt(plaintext, secret);
    expect(blob).not.toContain("sk-live");
    expect(await decrypt(blob, secret)).toBe(plaintext);
  });

  it("keeps PBKDF2 iterations within the Cloudflare Workers limit (<=100000)", async () => {
    // Regression guard: Workers WebCrypto rejects PBKDF2 iterations > 100000
    // (NotSupportedError), which 500'd every private-state PUT. Production sits
    // at 50000 for ~2x headroom under the Free-plan 10ms CPU budget.
    const blob = JSON.parse(await encrypt("x", "s")) as { iter?: number };
    expect(typeof blob.iter).toBe("number");
    expect(blob.iter!).toBeLessThanOrEqual(100_000);
  });

  it("decrypts legacy blobs that predate the iter field (falls back to 120000)", async () => {
    // Craft a genuine legacy blob: encrypted at 120000 iterations, with no iter
    // field recorded (as the old code wrote). decrypt() must fall back to 120000.
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

  it("fails to decrypt with the wrong secret", async () => {
    const blob = await encrypt("top secret", "right");
    await expect(decrypt(blob, "wrong")).rejects.toThrow();
  });

  it("rejects an unsupported blob version", async () => {
    await expect(decrypt(JSON.stringify({ v: 2, salt: "", iv: "", ct: "" }), "s")).rejects.toThrow("不支持的加密格式");
  });

  it("rejects blobs with a present-but-malformed iter (guards against corrupt/DoS values)", async () => {
    // A present iter that isn't a sane integer must be rejected before deriveKey
    // runs, so a corrupt or hostile blob can't force an absurdly long KDF. Only a
    // truly absent iter (undefined) is legacy → falls back to 120000; a present
    // null is corrupt and rejected. Note NaN/Infinity serialize to null via
    // JSON.stringify, so they land in this rejection path, not the legacy one.
    const base = { v: 1 as const, salt: "", iv: "", ct: "" };
    for (const iter of [null, 0, -1, 1.5, 200_001, "50000", true, {}]) {
      await expect(decrypt(JSON.stringify({ ...base, iter }), "s")).rejects.toThrow("不支持的 PBKDF2 迭代次数");
    }
  });

  it("rejects an iter that serialized to null (e.g. NaN/Infinity)", async () => {
    // JSON.stringify({ iter: NaN }) → {"iter":null}. A stored blob really can
    // carry null, and it must be rejected — not silently run at the legacy count.
    const blob = JSON.stringify({ v: 1, iter: Number.NaN, salt: "", iv: "", ct: "" });
    await expect(decrypt(blob, "s")).rejects.toThrow("不支持的 PBKDF2 迭代次数");
  });
});
