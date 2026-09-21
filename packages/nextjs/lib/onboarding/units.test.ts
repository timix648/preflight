/**
 * The guarantee these tests protect: a value at one decimal scale can never be
 * silently spent at another.
 *
 * tinybar (8dp) and weibar (18dp) differ by 10^10. A balance converted wrongly
 * does not throw and does not look obviously absurd on screen — it looks like
 * a different, plausible number. Types catch it at compile time; these tests
 * catch the arithmetic underneath.
 */
import {
  TINYBAR_TO_WEIBAR,
  fromTokenUnits,
  hbarToTinybar,
  hbarToWeibar,
  tinybar,
  tinybarToHbar,
  tinybarToWeibar,
  toTokenUnits,
  tokenUnits,
  weibar,
  weibarToTinybar,
} from "./units";
import { describe, expect, it } from "vitest";

describe("the 10^10 gap between tinybar and weibar", () => {
  it("one_hbar_is_the_same_value_at_both_scales", () => {
    const oneHbarTinybar = hbarToTinybar("1");
    const oneHbarWeibar = hbarToWeibar("1");
    expect(oneHbarTinybar as bigint).toBe(100_000_000n); // 10^8
    expect(oneHbarWeibar as bigint).toBe(10n ** 18n);
    expect(tinybarToWeibar(oneHbarTinybar) as bigint).toBe(oneHbarWeibar as bigint);
  });

  it("the conversion factor is exactly 10^10, not 10^9 or 10^11", () => {
    expect(TINYBAR_TO_WEIBAR).toBe(10_000_000_000n);
  });

  it("widening 8dp to 18dp is always exact", () => {
    for (const value of [0n, 1n, 100_000_000n, 123_456_789n]) {
      const back = weibarToTinybar(tinybarToWeibar(tinybar(value)));
      expect(back.exact).toBe(true);
      expect(back.value as bigint).toBe(value);
    }
  });
});

describe("narrowing 18dp to 8dp reports what it drops", () => {
  it("lossy_narrowing_is_never_silent", () => {
    // 1 weibar cannot be represented in tinybar at all. Returning 0 quietly
    // is how "the balance is off by dust" bugs begin.
    const result = weibarToTinybar(weibar(1n));
    expect(result.value as bigint).toBe(0n);
    expect(result.exact).toBe(false);
    expect(result.remainder).toBe(1n);
  });

  it("reports exact when nothing is lost", () => {
    const result = weibarToTinybar(weibar(10n ** 18n));
    expect(result.exact).toBe(true);
    expect(result.remainder).toBe(0n);
  });

  it("truncates toward zero rather than rounding up", () => {
    const result = weibarToTinybar(weibar(TINYBAR_TO_WEIBAR * 5n + 9_999_999_999n));
    expect(result.value as bigint).toBe(5n);
    expect(result.remainder).toBe(9_999_999_999n);
  });
});

describe("token decimals come from the network, never from an assumption", () => {
  it("handles the decimals real tokens actually use", () => {
    // SaucerSwap's testnet list contains 2, 6 and 8 decimal tokens.
    expect(toTokenUnits("1", 2) as bigint).toBe(100n);
    expect(toTokenUnits("1", 6) as bigint).toBe(1_000_000n);
    expect(toTokenUnits("1", 8) as bigint).toBe(100_000_000n);
    expect(toTokenUnits("1", 0) as bigint).toBe(1n);
  });

  it("excess_precision_is_rejected_not_rounded", () => {
    // "1.005" on a 2-decimal token is a caller bug. Rounding it to 1.00 or
    // 1.01 hides a real mistake behind a plausible number.
    expect(() => toTokenUnits("1.005", 2)).toThrow(RangeError);
    expect(() => toTokenUnits("0.000000001", 8)).toThrow(RangeError);
  });

  it("accepts precision exactly at the limit", () => {
    expect(toTokenUnits("1.99", 2) as bigint).toBe(199n);
    expect(toTokenUnits("0.00000001", 8) as bigint).toBe(1n);
  });

  it("round trips through the display form without floating point", () => {
    for (const [amount, decimals] of [
      ["1", 2],
      ["0.01", 2],
      ["123456.78901234", 8],
      ["0.000001", 6],
    ] as const) {
      expect(fromTokenUnits(toTokenUnits(amount, decimals), decimals)).toBe(amount);
    }
  });

  it("survives values far beyond Number.MAX_SAFE_INTEGER", () => {
    // 9 billion tokens at 18 decimals overflows a double by many orders of
    // magnitude. bigint arithmetic keeps it exact.
    const huge = "9000000000.123456789012345678";
    expect(fromTokenUnits(toTokenUnits(huge, 18), 18)).toBe(huge);
  });

  it("handles negative amounts, which transfers use for the debit side", () => {
    expect(toTokenUnits("-1.5", 2) as bigint).toBe(-150n);
    expect(fromTokenUnits(tokenUnits(-150n), 2)).toBe("-1.5");
  });

  it("trims trailing zeros in display but keeps significant ones", () => {
    expect(fromTokenUnits(tokenUnits(100n), 2)).toBe("1");
    expect(fromTokenUnits(tokenUnits(110n), 2)).toBe("1.1");
    expect(fromTokenUnits(tokenUnits(101n), 2)).toBe("1.01");
    expect(fromTokenUnits(tokenUnits(0n), 8)).toBe("0");
  });

  it("rejects a decimals value that could not have come from the network", () => {
    expect(() => toTokenUnits("1", -1)).toThrow(RangeError);
    expect(() => toTokenUnits("1", 1.5)).toThrow(RangeError);
    // Guards against the mirror node's quoted "8" arriving uncoerced.
    expect(() => toTokenUnits("1", "8" as unknown as number)).toThrow(RangeError);
  });

  it("rejects malformed amounts", () => {
    for (const bad of ["", "abc", "1.2.3", "1,5", "0x10"]) {
      expect(() => toTokenUnits(bad, 8)).toThrow(TypeError);
    }
  });
});

describe("HBAR display", () => {
  it("renders tinybar at 8 decimals", () => {
    expect(tinybarToHbar(tinybar(100_000_000n))).toBe("1");
    expect(tinybarToHbar(tinybar(1n))).toBe("0.00000001");
    // The live balance of testnet account 0.0.10608004: 1000 HBAR.
    expect(tinybarToHbar(tinybar(100_000_000_000n))).toBe("1000");
  });
});
