/**
 * Trap #5 — decimals.
 *
 * Three different scales are in play at once on Hedera, and they look
 * identical at the type level if you model them all as `bigint`:
 *
 *   tinybar     8 decimals   the native HTS/SDK scale for HBAR
 *   weibar     18 decimals   what the JSON-RPC relay reports, for EVM parity
 *   token      n decimals    per-token, read from the network. Never assumed.
 *
 * 1 HBAR = 100_000_000 tinybar = 10^18 weibar, so tinybar -> weibar is a
 * factor of 10^10. Passing one where the other is expected does not throw; it
 * produces a balance wrong by ten billion times, and the number still looks
 * plausible on screen.
 *
 * The branded types below make that mistake a compile error. They carry no
 * runtime cost — a Tinybar IS a bigint at runtime.
 *
 * Framework-free. See AGENTS.md.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** HBAR at 8 decimals — the native scale. */
export type Tinybar = Brand<bigint, "Tinybar">;
/** HBAR at 18 decimals — what the JSON-RPC relay speaks. */
export type Weibar = Brand<bigint, "Weibar">;
/** A token amount at that token's own decimals. Meaningless without them. */
export type TokenUnits = Brand<bigint, "TokenUnits">;

export const TINYBAR_DECIMALS = 8;
export const WEIBAR_DECIMALS = 18;
/** 10 ** (18 - 8). The conversion everyone gets wrong. */
export const TINYBAR_TO_WEIBAR = 10n ** 10n;

const pow10 = (n: number): bigint => 10n ** BigInt(n);

// --- constructors -----------------------------------------------------
// The only way into a branded type, so every value has a declared scale.

export const tinybar = (value: bigint | number | string): Tinybar => BigInt(value) as Tinybar;
export const weibar = (value: bigint | number | string): Weibar => BigInt(value) as Weibar;
export const tokenUnits = (value: bigint | number | string): TokenUnits => BigInt(value) as TokenUnits;

// --- HBAR conversions -------------------------------------------------

/** Exact. Widening from 8 to 18 decimals never loses information. */
export const tinybarToWeibar = (value: Tinybar): Weibar => ((value as bigint) * TINYBAR_TO_WEIBAR) as Weibar;

/**
 * LOSSY by construction — 18 decimals do not fit in 8.
 *
 * Truncates toward zero and reports what was dropped, because silently
 * discarding a remainder is how "the balance is off by a few tinybar" bugs
 * start. Callers that must not lose value should check `remainder`.
 */
export function weibarToTinybar(value: Weibar): {
  value: Tinybar;
  remainder: bigint;
  exact: boolean;
} {
  const raw = value as bigint;
  const quotient = raw / TINYBAR_TO_WEIBAR;
  const remainder = raw % TINYBAR_TO_WEIBAR;
  return {
    value: quotient as Tinybar,
    remainder,
    exact: remainder === 0n,
  };
}

// --- token conversions ------------------------------------------------

/**
 * Decimal string -> the token's smallest unit.
 *
 * `decimals` must come from the network (mirror node or the DEX token list),
 * never a constant. Tokens on Hedera routinely use 2, 6 or 8 decimals; the
 * SaucerSwap testnet list alone contains all three.
 *
 * Extra precision is rejected rather than rounded. "1.005" at 2 decimals is a
 * caller bug, and rounding it hides a real mistake behind a plausible number.
 */
export function toTokenUnits(amount: string, decimals: number): TokenUnits {
  assertDecimals(decimals);
  const trimmed = amount.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new TypeError(`Not a decimal amount: "${amount}".`);
  }

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, fraction = ""] = unsigned.split(".");

  if (fraction.length > decimals) {
    throw new RangeError(
      `"${amount}" has ${fraction.length} decimal places but this token has ${decimals}. ` +
        `Round before calling, so the loss of precision is yours and not silent.`,
    );
  }

  const padded = fraction.padEnd(decimals, "0");
  const magnitude = BigInt(whole) * pow10(decimals) + BigInt(padded || "0");
  return (negative ? -magnitude : magnitude) as TokenUnits;
}

/** Smallest unit -> a display string. Exact; no floating point involved. */
export function fromTokenUnits(value: TokenUnits, decimals: number): string {
  assertDecimals(decimals);
  const raw = value as bigint;
  const negative = raw < 0n;
  const magnitude = negative ? -raw : raw;
  const divisor = pow10(decimals);

  const whole = magnitude / divisor;
  const sign = negative ? "-" : "";
  if (decimals === 0) return `${sign}${whole}`;

  const fraction = (magnitude % divisor).toString().padStart(decimals, "0");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${sign}${whole}.${trimmed}` : `${sign}${whole}`;
}

/** Convenience wrappers for HBAR, which is just a token with 8 decimals. */
export const tinybarToHbar = (value: Tinybar): string =>
  fromTokenUnits(value as unknown as TokenUnits, TINYBAR_DECIMALS);

export const hbarToTinybar = (amount: string): Tinybar => toTokenUnits(amount, TINYBAR_DECIMALS) as unknown as Tinybar;

export const hbarToWeibar = (amount: string): Weibar => tinybarToWeibar(hbarToTinybar(amount));

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 80) {
    throw new RangeError(
      `Token decimals must be a non-negative integer, got ${decimals}. ` +
        `Read it from the network — never assume 8 or 18.`,
    );
  }
}
