/**
 * Real swap quotes, read from the SaucerSwap router itself.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS MODULE EXISTS, WITH THE MEASUREMENT THAT JUSTIFIES IT
 *
 * `saucerswap.ts` can estimate an output from published USD prices. That
 * estimate is honest about being indicative, and this is why — measured on
 * testnet, 19 September 2026, for HBAR -> SAUCE:
 *
 *   published prices implied      $0.00143646 per SAUCE
 *   the router actually quoted    $0.00164407 per SAUCE
 *   divergence                    12.6%
 *
 * That gap is NOT price impact. Quoting across four orders of magnitude moved
 * the rate by only 0.13%:
 *
 *   0.01 HBAR -> 55.0993 SAUCE/HBAR
 *    100  HBAR -> 55.0277 SAUCE/HBAR
 *
 * The pool is deep; the published feed simply disagrees with it. A UI that
 * quotes from the price feed and executes against the pool would mislead a
 * user by double-digit percentages and look like a bug in your code.
 *
 * So: price feeds are for display and ranking. The router is for execution.
 * ---------------------------------------------------------------------------
 *
 * Framework-free. See AGENTS.md.
 */
import { SAUCERSWAP_TESTNET_CONTRACTS, applySlippage, hbarToTokenPath } from "./contracts";
import { RELAY_TESTNET, type RelayOptions } from "./relay";
import { explain } from "./status";
import { OnboardingError } from "./types";
import { type TokenUnits, fromTokenUnits, hbarToTinybar, tokenUnits } from "./units";

/** getAmountsOut(uint256,address[]) */
const GET_AMOUNTS_OUT_SELECTOR = "d06ca61f";

const pad = (hex: string): string => hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");

export interface RouterQuote {
  /** HBAR being spent, in tinybar. */
  amountIn: bigint;
  /** Token received, in that token's smallest unit. */
  amountOut: TokenUnits;
  /** Display string at the token's decimals. */
  amountOutFormatted: string;
  /** The minimum acceptable output after slippage — what you pass the router. */
  amountOutMin: TokenUnits;
  /** Units of output token per 1 HBAR. */
  rate: number;
  /** The path the router validated. path[0] is always WHBAR. */
  path: [string, string];
}

/**
 * Ask the router what a swap would actually return.
 *
 * A pure `eth_call` — no wallet, no signature, no gas. That means the quote is
 * available on a page a stranger opened, which is the same credential-free
 * principle the rest of this template follows.
 */
export async function routerQuote(params: {
  /** HBAR to spend, as a decimal string, e.g. "1.5". */
  hbarAmount: string;
  /** EVM address of the token to receive. */
  tokenEvmAddress: string;
  /** Decimals of that token. Read from the network — never assumed. */
  tokenDecimals: number;
  /** Slippage tolerance. 100 = 1%. */
  slippageBasisPoints?: number;
  relay?: RelayOptions;
}): Promise<RouterQuote> {
  const { hbarAmount, tokenEvmAddress, tokenDecimals, slippageBasisPoints = 100, relay = {} } = params;

  // Validates the amount against HBAR's 8 decimals and rejects excess precision.
  const amountIn = hbarToTinybar(hbarAmount) as unknown as bigint;
  if (amountIn <= 0n) {
    throw new OnboardingError(explain("INVALID_SWAP_AMOUNT"), { hbarAmount });
  }

  const path = hbarToTokenPath(tokenEvmAddress);
  const data =
    "0x" +
    GET_AMOUNTS_OUT_SELECTOR +
    pad(amountIn.toString(16)) +
    pad("40") + // offset to the array
    pad("2") + // array length
    pad(path[0]) +
    pad(path[1]);

  const { baseUrl = RELAY_TESTNET, timeoutMs = 10_000, fetchImpl = fetch } = relay;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let result: string;
  try {
    const response = await fetchImpl(`${baseUrl}/api`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: SAUCERSWAP_TESTNET_CONTRACTS.routerV1.evmAddress, data }, "latest"],
      }),
    });

    const body = (await response.json()) as { result?: string; error?: { message?: string } };

    if (body.error) {
      // The router reverts with INVALID_PATH when no pool exists for the pair,
      // which is the common case rather than an exceptional one: most listed
      // tokens have no direct WHBAR pool.
      throw new OnboardingError(explain("NO_ROUTE_FOR_PAIR"), body.error);
    }
    if (!body.result || body.result === "0x") {
      throw new OnboardingError(explain("NO_ROUTE_FOR_PAIR"), { path });
    }
    result = body.result;
  } catch (cause) {
    if (cause instanceof OnboardingError) throw cause;
    throw new OnboardingError(explain("RELAY_UNAVAILABLE"), cause);
  } finally {
    clearTimeout(timer);
  }

  // uint256[]: [offset][length][amountIn][amountOut]
  const raw = result.replace(/^0x/, "");
  if (raw.length < 256) {
    throw new OnboardingError(explain("NO_ROUTE_FOR_PAIR"), { raw });
  }
  const amountOut = BigInt("0x" + raw.slice(192, 256));

  const rate = Number(fromTokenUnits(amountOut as TokenUnits, tokenDecimals)) / Number(hbarAmount);

  return {
    amountIn,
    amountOut: amountOut as TokenUnits,
    amountOutFormatted: fromTokenUnits(amountOut as TokenUnits, tokenDecimals),
    amountOutMin: applySlippage(amountOut, slippageBasisPoints) as TokenUnits,
    rate,
    path,
  };
}

/**
 * Compare what the price feed claims against what the pool will actually pay.
 *
 * Rendered side by side in the UI. Most templates show one number and imply it
 * is the truth; showing both, with the gap named, is more honest and teaches
 * the reader something they will hit in production.
 */
export function compareQuotes(params: {
  routerAmountOut: TokenUnits;
  indicativeAmountOut: string;
  tokenDecimals: number;
}): { divergencePercent: number; verdict: string } {
  const router = Number(fromTokenUnits(params.routerAmountOut, params.tokenDecimals));
  const indicative = Number(params.indicativeAmountOut);

  if (!Number.isFinite(indicative) || indicative <= 0 || router <= 0) {
    return {
      divergencePercent: 0,
      verdict: "No published price to compare against. The router's number is the one that matters.",
    };
  }

  const divergencePercent = ((router - indicative) / indicative) * 100;
  const magnitude = Math.abs(divergencePercent);

  return {
    divergencePercent,
    verdict:
      magnitude < 1
        ? "The published price and the pool agree. Either number would have been fine."
        : magnitude < 10
          ? "The published price and the pool disagree slightly. Execute against the router's number."
          : "The published price and the pool disagree substantially. This is exactly why a quote must come from the router and not from a price feed — quoting one and executing the other would look like a bug in your code.",
  };
}

/** Re-exported so callers need only this module to build a swap. */
export {
  applySlippage,
  deadlineFromNow,
  hbarToTokenPath,
  SAUCERSWAP_TESTNET_CONTRACTS,
  SAUCERSWAP_V1_ROUTER_ABI,
} from "./contracts";
export { tokenUnits };
