import { describe, expect, it } from "vitest";
import { MAX_ROW_PROTOCOLS, MAX_TEST_RETRIES } from "./app.js";
import { MAX_PING_BATCH_SIZE } from "./ping.js";

const CF_FREE_EXTERNAL_SUBREQUEST_LIMIT = 50;
const ROW_TRANSPORTS_PER_PROTOCOL = 2;
const MAX_MODELS_CANDIDATES_PLUS_FALLBACK = 3;

describe("Cloudflare Free external subrequest invariants", () => {
  it("keeps worst-case row probes under 50 external subrequests", () => {
    const worstCase = MAX_ROW_PROTOCOLS * ROW_TRANSPORTS_PER_PROTOCOL * (MAX_TEST_RETRIES + 1);
    expect(worstCase).toBe(44);
    expect(worstCase).toBeLessThanOrEqual(CF_FREE_EXTERNAL_SUBREQUEST_LIMIT);
  });

  it("keeps ping batches under 50 external subrequests even when every entry is a unique connection", () => {
    const worstCase = MAX_PING_BATCH_SIZE * MAX_MODELS_CANDIDATES_PLUS_FALLBACK;
    expect(worstCase).toBe(30);
    expect(worstCase).toBeLessThanOrEqual(CF_FREE_EXTERNAL_SUBREQUEST_LIMIT);
  });
});
