import { HTS_PRECOMPILE, buildAssociationCall, buildSwapCall } from "./evm-executor";
import { describe, expect, it } from "vitest";

const account = "0x0000000000000000000000000000000000000123" as const;

describe("shared EVM execution payloads", () => {
  it("rejects malformed recipients before building either transaction", () => {
    for (const account of ["0.0.123", "0x123", "0x" + "z".repeat(40)]) {
      expect(() => buildAssociationCall(account, "0.0.1183558")).toThrow(/EVM account/);
      expect(() => buildSwapCall({ account, tokenId: "0.0.1183558", hbarAmount: "1", amountOutMin: 1n })).toThrow(
        /EVM account/,
      );
    }
  });
  it("associates the recipient through HTS on testnet", () => {
    const call = buildAssociationCall(account, "0.0.1183558");
    expect(call.address).toBe(HTS_PRECOMPILE);
    expect(call.address.endsWith("0167")).toBe(true);
    expect(call.chainId).toBe(296);
    expect(call.args).toEqual([account, "0x0000000000000000000000000000000000120f46"]);
  });

  it("spends weibar while routing through the WHBAR token, with the supplied slippage floor", () => {
    const call = buildSwapCall({ account, tokenId: "0.0.1183558", hbarAmount: "0.01", amountOutMin: 543901n });
    expect(call.chainId).toBe(296);
    expect(call.value).toBe(10_000_000_000_000_000n);
    expect(call.args[0]).toBe(543901n);
    expect(call.args[1][0]).toBe("0x0000000000000000000000000000000000003ad2");
    expect(call.args[2]).toBe(account);
    expect(call.args[3]).toBeGreaterThan(BigInt(Math.floor(Date.now() / 1000)));
  });

  it("refuses a zero-output floor instead of silently removing slippage protection", () => {
    expect(() => buildSwapCall({ account, tokenId: "0.0.1183558", hbarAmount: "0.01", amountOutMin: 0n })).toThrow(
      /slippage floor/,
    );
  });

  it("refuses zero spend before asking a signer", () => {
    expect(() => buildSwapCall({ account, tokenId: "0.0.1183558", hbarAmount: "0", amountOutMin: 1n })).toThrow(
      /HBAR amount/,
    );
  });
});
