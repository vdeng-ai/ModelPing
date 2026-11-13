import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashText, inspectJwt, parseJwt, signJwt } from "./toolbox-crypto.js";
import { DEMO_JWT_SECRET } from "./toolbox-examples.js";
import type { HashAlgorithm, JwtAlgorithm } from "./toolbox-types.js";

const algorithms: HashAlgorithm[] = ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"];
const jwtAlgorithms: JwtAlgorithm[] = ["HS256", "HS384", "HS512"];
const toSegment = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const makeToken = (header: unknown, payload: unknown, signature = "AQID") => `${toSegment(header)}.${toSegment(payload)}.${signature}`;

describe("local hashes against the independent Node crypto implementation", () => {
  it.each(algorithms)("matches %s for empty, ASCII, Unicode and large inputs", (algorithm) => {
    for (const input of ["", "abc", "你好 👋\n\0", "ModelPing".repeat(10_000)]) {
      const nodeAlgorithm = algorithm.toLowerCase().replace("-", "");
      const expected = createHash(nodeAlgorithm).update(input).digest("hex");
      expect(hashText(input, algorithm, "hex")).toBe(expected);
      expect(hashText(input, algorithm, "hex", true)).toBe(expected.toUpperCase());
      expect(hashText(input, algorithm, "base64")).toBe(createHash(nodeAlgorithm).update(input).digest("base64"));
    }
  });
});

describe("JWT signing and inspection", () => {
  it.each(jwtAlgorithms)("signs and verifies %s without WebCrypto or a server", (algorithm) => {
    const header = { typ: "JWT", alg: algorithm, kid: "local-demo" };
    const payload = { sub: "demo", message: "你好 👋" };
    const token = signJwt(JSON.stringify({ header, payload }), DEMO_JWT_SECRET, algorithm);
    const body = `${toSegment(header)}.${toSegment(payload)}`;
    const expected = createHmac(`sha${algorithm.slice(2)}`, DEMO_JWT_SECRET).update(body).digest("base64url");
    expect(token).toBe(`${body}.${expected}`);
    expect(parseJwt(token)).toMatchObject({ header, payload });
    expect(inspectJwt(token, DEMO_JWT_SECRET, algorithm).details.verification).toBe("valid");
    expect(inspectJwt(token, "wrong-key", algorithm).details.verification).toBe("invalid");
    expect(inspectJwt(token, "", algorithm).details.verification).toBe("unchecked");
    const signature = token.split(".")[2];
    const changed = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
    expect(inspectJwt(`${body}.${changed}`, DEMO_JWT_SECRET, algorithm).details.verification).toBe("invalid");
  });
  it("supports a missing header and Bearer-prefixed inspection", () => {
    const token = signJwt('{"payload":{"sub":"demo"}}', DEMO_JWT_SECRET, "HS256");
    expect(parseJwt(`  Bearer ${token}  `).header).toEqual({ typ: "JWT", alg: "HS256" });
  });
  it("rejects implicit algorithm switching", () => {
    const token = signJwt('{"payload":{}}', DEMO_JWT_SECRET, "HS512");
    expect(inspectJwt(token, DEMO_JWT_SECRET, "HS256").details.verification).toBe("mismatch");
    expect(() => signJwt('{"header":{"alg":"HS512"},"payload":{}}', DEMO_JWT_SECRET, "HS256")).toThrow("jwtAlgorithm");
  });
  it("never marks an unsigned token or an unsupported algorithm as verified", () => {
    expect(inspectJwt(makeToken({ alg: "none" }, {}, ""), DEMO_JWT_SECRET, "HS256").details.verification).toBe("unsigned");
    for (const alg of ["RS256", "ES256", "toString", "__proto__"]) {
      expect(inspectJwt(makeToken({ alg, jku: "https://example.com/untrusted-key" }, {}), DEMO_JWT_SECRET, "HS256").details.verification).toBe("unsupported");
    }
  });
  it("does not claim to verify JOSE extensions it does not implement", () => {
    expect(inspectJwt(makeToken({ alg: "HS256", crit: ["custom"] }, {}), DEMO_JWT_SECRET, "HS256").details.verification).toBe("unsupported");
    expect(() => signJwt('{"header":{"crit":["custom"]},"payload":{}}', DEMO_JWT_SECRET, "HS256")).toThrow("jwtExtension");
    expect(() => signJwt('{"header":{"b64":false},"payload":{}}', DEMO_JWT_SECRET, "HS256")).toThrow("jwtExtension");
  });
  it("requires a secret of sufficient UTF-8 byte length when signing", () => {
    expect(() => signJwt('{"payload":{}}', "", "HS256")).toThrow("secretRequired");
    expect(() => signJwt('{"payload":{}}', "short", "HS256")).toThrow("weakSecret");
    expect(() => signJwt('{"payload":{}}', "a".repeat(47), "HS384")).toThrow("weakSecret");
    expect(() => signJwt('{"payload":{}}', "a".repeat(63), "HS512")).toThrow("weakSecret");
    expect(() => signJwt('{"payload":{}}', "你".repeat(11), "HS256")).not.toThrow();
  });
  it("can diagnose a legacy short-key token without hiding the weak-key warning", () => {
    const body = `${toSegment({ alg: "HS256" })}.${toSegment({})}`;
    const token = `${body}.${createHmac("sha256", "secret").update(body).digest("base64url")}`;
    expect(inspectJwt(token, "secret", "HS256").details).toMatchObject({ verification: "valid", weakSecret: true });
  });
  it.each(["bad", "a.b.c", "a.b.c.d", "..", makeToken([], {}), makeToken({ alg: "HS256" }, []), makeToken({ alg: "HS256" }, null), makeToken({ alg: "none" }, {}, "AQID"), makeToken({ alg: "HS256" }, {}, "")])("rejects malformed compact JWT %j", (input) => expect(() => parseJwt(input)).toThrow());
  it.each(["{", "[]", "null", '{"payload":[]}', '{"header":[],"payload":{}}'])("rejects invalid signing JSON %j", (input) => expect(() => signJwt(input, DEMO_JWT_SECRET, "HS256")).toThrow());
  it("evaluates exp / nbf independently of signature verification", () => {
    const inspect = (payload: unknown) => inspectJwt(makeToken({ alg: "HS256" }, payload), "", "HS256", 1000).details;
    expect(inspect({ exp: 1000 })).toMatchObject({ claims: "expired", verification: "unchecked", expiresAt: 1000 });
    expect(inspect({ nbf: 1001 })).toMatchObject({ claims: "notYetValid", notBefore: 1001 });
    expect(inspect({ exp: 1001, nbf: 999 }).claims).toBe("unchecked");
    expect(inspect({ exp: "1000" }).claims).toBe("invalid");
    expect(inspect({ nbf: 1e20 }).claims).toBe("invalid");
    expect(inspect({ exp: 0 }).claims).toBe("expired");
  });
});
