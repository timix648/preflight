/**
 * The guarantee these tests protect: the page never presents a compiled-in
 * constant as a live reading.
 *
 * This is not hypothetical. Hashio used to return /config flat at the top
 * level, and relay 0.78.5 moved every key under `relay.config`. The reader
 * kept looking at the top level, found nothing, and substituted its fallbacks
 * — which happen to be identical to the real values, so nothing looked wrong.
 * The home page went on claiming the numbers were read live while showing
 * constants, and no offline test could have caught it, because the only
 * coverage of the parsers lived in the live-endpoint suite.
 *
 * Hence both halves below: the shapes must be unwrapped, and the provenance
 * must be reported honestly when they cannot be.
 */
import { configBoolean, configNumber, relayLimits, unwrapConfig } from "./relay";
import { describe, expect, it } from "vitest";

/** A relay response in the 0.78.5 nested shape, trimmed to what we read. */
const nestedBody = {
  relay: {
    version: "0.78.5",
    config: {
      CHAIN_ID: "296",
      ETH_GET_LOGS_BLOCK_RANGE_LIMIT: "1000",
      DEFAULT_RATE_LIMIT: "200",
      CALL_DATA_SIZE_LIMIT: "131072",
      PAYMASTER_ENABLED: "false",
    },
  },
  upstreamDependencies: [],
};

/** The older flat shape, which self-hosted relays may still serve. */
const flatBody = {
  CHAIN_ID: "296",
  ETH_GET_LOGS_BLOCK_RANGE_LIMIT: "1000",
  DEFAULT_RATE_LIMIT: "200",
  CALL_DATA_SIZE_LIMIT: "131072",
  PAYMASTER_ENABLED: "false",
};

/** Answers /config with `body`, and web3_clientVersion with a version. */
const stubFetch = (body: unknown, ok = true): typeof fetch =>
  (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/config")) {
      return {
        ok,
        status: ok ? 200 : 503,
        json: async () => body,
      } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ result: "relay/0.78.5" }) } as Response;
  }) as typeof fetch;

describe("unwrapConfig finds the settings whatever shape they arrive in", () => {
  it("reads the 0.78.5 nested shape", () => {
    expect(unwrapConfig(nestedBody).CHAIN_ID).toBe("296");
  });

  it("still reads the older flat shape", () => {
    expect(unwrapConfig(flatBody).CHAIN_ID).toBe("296");
  });

  it("does not throw on a body that is neither", () => {
    for (const body of [null, undefined, 42, "text", []]) {
      expect(() => unwrapConfig(body)).not.toThrow();
    }
    expect(unwrapConfig(null).CHAIN_ID).toBeUndefined();
  });

  it("ignores a relay key that is not an object", () => {
    expect(unwrapConfig({ relay: "0.78.5", CHAIN_ID: "296" }).CHAIN_ID).toBe("296");
  });
});

describe("relayLimits reports whether the numbers are real", () => {
  it("marks values live when the relay answered, in the nested shape", async () => {
    const limits = await relayLimits({ fetchImpl: stubFetch(nestedBody) });
    expect(limits.live).toBe(true);
    expect(limits.chainId).toBe(296);
    expect(limits.getLogsBlockRangeLimit).toBe(1000);
    expect(limits.paymasterEnabled).toBe(false);
  });

  it("marks values live when the relay answered in the flat shape", async () => {
    const limits = await relayLimits({ fetchImpl: stubFetch(flatBody) });
    expect(limits.live).toBe(true);
    expect(limits.chainId).toBe(296);
  });

  // The regression itself: right shape absent, values still plausible.
  it("marks values NOT live when the shape hides the keys", async () => {
    const limits = await relayLimits({ fetchImpl: stubFetch({ something: "else" }) });
    expect(limits.live).toBe(false);
    // The fallbacks are indistinguishable from the real values, which is
    // precisely why the flag, and not the numbers, is what the UI must trust.
    expect(limits.chainId).toBe(296);
  });

  it("marks values NOT live when the relay is down", async () => {
    const limits = await relayLimits({ fetchImpl: stubFetch(nestedBody, false) });
    expect(limits.live).toBe(false);
  });
});

describe("every /config value is a string", () => {
  it('configBoolean("false") is false, where Boolean("false") is true', () => {
    expect(Boolean("false")).toBe(true); // the trap
    expect(configBoolean("false")).toBe(false);
    expect(configBoolean("FALSE")).toBe(false);
    expect(configBoolean(" true ")).toBe(true);
  });

  it("configBoolean falls back on anything it does not recognise", () => {
    expect(configBoolean("yes", true)).toBe(true);
    expect(configBoolean(undefined, false)).toBe(false);
    expect(configBoolean(true)).toBe(true);
  });

  it("configNumber parses strings and never yields NaN", () => {
    expect(configNumber("1000", 7)).toBe(1000);
    expect(configNumber(1000, 7)).toBe(1000);
    expect(configNumber("not a number", 7)).toBe(7);
    expect(configNumber("", 7)).toBe(7);
    expect(configNumber(undefined, 7)).toBe(7);
    expect(Number.isNaN(configNumber("abc", 7))).toBe(false);
  });
});
