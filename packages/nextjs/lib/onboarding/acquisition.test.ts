import { type AcquisitionContext, canSubmitSwap, currentQuote, sameAcquisition } from "./acquisition";
import { describe, expect, it } from "vitest";

const account: AcquisitionContext = { account: "0xabc", tokenId: "0.0.1183558", chainId: 296 };
const quote = { token: account.tokenId, hbar: "1", receivedAt: 1000 };
const ready = {
  current: account,
  profileFor: account,
  associated: true,
  quoteFor: quote,
  hbar: "1",
  pending: false,
  now: 1001,
};

describe("transaction submission guard", () => {
  it("allows a confirmed association with a matching fresh quote on testnet", () => {
    expect(canSubmitSwap(ready)).toBe(true);
  });
  it("blocks the old slippage floor immediately when the amount changes", () => {
    expect(canSubmitSwap({ ...ready, hbar: "10" })).toBe(false);
  });
  it("blocks the previous token's association even if a new quote arrives first", () => {
    expect(
      canSubmitSwap({
        ...ready,
        current: { ...account, tokenId: "0.0.5365" },
        quoteFor: { ...quote, token: "0.0.5365" },
      }),
    ).toBe(false);
  });
  it("blocks the previous wallet's association while its replacement is loading", () => {
    expect(canSubmitSwap({ ...ready, current: { ...account, account: "0xdef" } })).toBe(false);
  });
  it("fails closed when profile loading fails or a wallet disconnects", () => {
    expect(canSubmitSwap({ ...ready, profileFor: null })).toBe(false);
    expect(canSubmitSwap({ ...ready, current: null })).toBe(false);
  });
  it("never submits on mainnet, even with a matching mainnet profile", () => {
    const mainnet = { ...account, chainId: 295 };
    expect(canSubmitSwap({ ...ready, current: mainnet, profileFor: mainnet })).toBe(false);
  });
  it("blocks duplicate writes until consensus, not only until the wallet returns a hash", () => {
    expect(canSubmitSwap({ ...ready, pending: true })).toBe(false);
  });
  it("requires a real association rather than a free-slot prediction", () => {
    expect(canSubmitSwap({ ...ready, associated: false })).toBe(false);
  });
  it("expires a quote at thirty seconds and rejects clock rollback", () => {
    expect(currentQuote(quote, account.tokenId, "1", 30999)).toBe(true);
    expect(canSubmitSwap({ ...ready, now: 31000 })).toBe(false);
    expect(canSubmitSwap({ ...ready, now: 999 })).toBe(false);
  });
  it("matches address casing without confusing accounts or networks", () => {
    expect(sameAcquisition(account, { ...account, account: "0xABC" })).toBe(true);
    expect(sameAcquisition(account, { ...account, chainId: 295 })).toBe(false);
  });
});
