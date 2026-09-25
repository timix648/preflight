import { readHbarFromRpc, reconcileHbar } from "./consistency";
import { tinybar } from "./units";
import { describe, expect, it, vi } from "vitest";

vi.mock("./mirror", () => ({
  getAccount: vi.fn(async () => ({
    hbar: { value: tinybar(500n), source: "mirror-node", asOf: 1000, mayBeStale: true },
  })),
  getTokenRelationship: vi.fn(),
}));

const reply = (body: unknown, status = 200): typeof fetch =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

describe("RPC balance integrity", () => {
  it.each([
    { error: { code: -32005, message: "rate limited" } },
    {},
    { result: null },
    { result: "" },
    { result: "garbage" },
    { result: -1 },
    { result: "0x0", error: { message: "upstream failed" } },
  ])("never presents an invalid response as a live zero: %j", async body => {
    await expect(readHbarFromRpc("0xabc", { fetchImpl: reply(body) })).rejects.toMatchObject({
      explanation: { code: "RELAY_UNAVAILABLE" },
    });
  });
  it("rejects an HTTP failure even with a plausible result", async () => {
    await expect(readHbarFromRpc("0xabc", { fetchImpl: reply({ result: "0x0" }, 503) })).rejects.toThrow();
  });
  it("accepts a genuine zero", async () => {
    expect(await readHbarFromRpc("0xabc", { fetchImpl: reply({ result: "0x0" }) })).toMatchObject({
      value: 0n,
      source: "json-rpc",
    });
  });
  it("retains the mirror balance and source when the relay reports an error", async () => {
    const result = await reconcileHbar("0.0.123", "0xabc", { relay: { fetchImpl: reply({ error: { code: -1 } }) } });
    expect(result.rpc).toBeNull();
    expect(result.preferred).toMatchObject({ value: 500n, source: "mirror-node", mayBeStale: true });
  });
});
