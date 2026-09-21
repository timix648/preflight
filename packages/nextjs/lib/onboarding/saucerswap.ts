/**
 * The ecosystem anchor: SaucerSwap.
 *
 * This is what makes the template an application rather than a library. A user
 * holding only HBAR acquires a real token on a real DEX and holds it, with
 * every association trap handled invisibly. Remove SaucerSwap and there is no
 * token to acquire, no journey, and no template — the integration is
 * load-bearing by construction rather than decorative.
 *
 * All reads here are public and wallet-free, which is what lets the home route
 * show live ecosystem data to a stranger with no .env at all.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS MODULE REFUSES TO ASSUME DECIMALS
 *
 * Read from the live testnet token list on 18 September 2026: 587 tokens
 * across THIRTEEN distinct decimal scales —
 *
 *   0dp  39   1dp   3   2dp  65   3dp  17   4dp   9   5dp   4
 *   6dp 131   7dp   2   8dp 292   9dp   9  11dp   1  13dp  1  18dp 14
 *
 * Only half are 8-decimal. Fourteen are 18-decimal. Code that assumes either
 * is wrong about roughly half of this DEX, and wrong silently: the amount
 * still looks plausible.
 *
 * Note also that SaucerSwap returns `decimals` as a NUMBER while the mirror
 * node returns the same field as a STRING. Both are coerced at their boundary.
 * ---------------------------------------------------------------------------
 *
 * Framework-free. See AGENTS.md.
 */
import { explain } from "./status";
import { OnboardingError } from "./types";
import { type TokenUnits, fromTokenUnits, toTokenUnits } from "./units";

export const SAUCERSWAP_TESTNET = "https://test-api.saucerswap.finance";
export const SAUCERSWAP_MAINNET = "https://api.saucerswap.finance";

export interface SaucerSwapOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface SaucerToken {
  tokenId: string;
  symbol: string;
  name: string;
  /** Read from the API. Never assumed. See the header. */
  decimals: number;
  priceUsd: number;
  /**
   * The token charges a fee on every transfer, so the recipient receives LESS
   * than the sender sent. Any code that asserts sent === received breaks on
   * these, and the failure looks like an accounting bug rather than a feature.
   */
  isFeeOnTransfer: boolean;
  /** The team completed SaucerSwap's due-diligence process. Only 15 of 587. */
  dueDiligenceComplete: boolean;
  inTopPools: boolean;
}

export interface SaucerStats {
  swapTotal: number;
  tvlUsd: number;
  circulatingSauce: string;
}

async function get<T>(path: string, options: SaucerSwapOptions = {}): Promise<T> {
  const { baseUrl = SAUCERSWAP_TESTNET, timeoutMs = 10_000, fetchImpl = fetch } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new OnboardingError(explain("SAUCERSWAP_UNAVAILABLE"), {
        path,
        status: response.status,
      });
    }
    return (await response.json()) as T;
  } catch (cause) {
    if (cause instanceof OnboardingError) throw cause;
    throw new OnboardingError(explain("SAUCERSWAP_UNAVAILABLE"), cause);
  } finally {
    clearTimeout(timer);
  }
}

/** Coerce a numeric field regardless of whether this API quoted it. */
function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/** Protocol liveness. Rendered on the home route as proof this is a real DEX. */
export async function getStats(options: SaucerSwapOptions = {}): Promise<SaucerStats> {
  const raw = await get<Record<string, unknown>>("/stats", options);
  return {
    swapTotal: num(raw.swapTotal),
    tvlUsd: num(raw.tvlUsd),
    circulatingSauce: String(raw.circulatingSauce ?? "0"),
  };
}

/** Every token SaucerSwap knows about on this network. 587 on testnet. */
export async function listTokens(options: SaucerSwapOptions = {}): Promise<SaucerToken[]> {
  const raw = await get<Record<string, unknown>[]>("/tokens", options);
  return raw.map(entry => ({
    tokenId: String(entry.id ?? ""),
    // Some testnet listings carry stray whitespace, e.g. " TIOT dev".
    symbol: String(entry.symbol ?? "").trim(),
    name: String(entry.name ?? "").trim(),
    decimals: num(entry.decimals, 0),
    priceUsd: num(entry.priceUsd),
    isFeeOnTransfer: entry.isFeeOnTransferToken === true,
    dueDiligenceComplete: entry.dueDiligenceComplete === true,
    inTopPools: entry.inTopPools === true,
  }));
}

/**
 * The tokens worth putting in front of a user first.
 *
 * Ordering is a safety decision, not a cosmetic one. Due-diligence-complete
 * tokens come first, and fee-on-transfer tokens are pushed down because their
 * amount arithmetic surprises people. Nothing is hidden — a template that
 * silently filters the ecosystem is lying about it — but the default order
 * leads with the ones least likely to confuse.
 */
export function rankTokens(tokens: SaucerToken[]): SaucerToken[] {
  return [...tokens].sort((a, b) => {
    if (a.dueDiligenceComplete !== b.dueDiligenceComplete) {
      return a.dueDiligenceComplete ? -1 : 1;
    }
    if (a.inTopPools !== b.inTopPools) return a.inTopPools ? -1 : 1;
    if (a.isFeeOnTransfer !== b.isFeeOnTransfer) return a.isFeeOnTransfer ? 1 : -1;
    return b.priceUsd - a.priceUsd;
  });
}

/** Find one token by id, or null. */
export async function findToken(tokenId: string, options: SaucerSwapOptions = {}): Promise<SaucerToken | null> {
  const tokens = await listTokens(options);
  return tokens.find(token => token.tokenId === tokenId) ?? null;
}

/**
 * An indicative quote from published USD prices.
 *
 * DELIBERATELY NOT AN EXECUTION PRICE. It ignores pool depth, slippage, and
 * the router's actual path, so it is honest about being an estimate. Calling
 * this a quote and then executing against it is how users get surprised; the
 * real amount comes from the router at swap time.
 */
export function indicativeQuote(params: { from: SaucerToken; to: SaucerToken; amount: string }): {
  amountIn: TokenUnits;
  estimatedOut: string;
  rate: number;
  caveats: string[];
} {
  const { from, to, amount } = params;

  // Validates precision against the SOURCE token's real decimals.
  const amountIn = toTokenUnits(amount, from.decimals);

  const caveats: string[] = [
    "Indicative only — derived from published USD prices, not from pool depth. The router decides the real amount at swap time.",
  ];

  if (from.isFeeOnTransfer || to.isFeeOnTransfer) {
    caveats.push(
      "One of these tokens charges a fee on transfer, so the amount that arrives will be less than the amount sent. This is the token's design, not an error.",
    );
  }
  if (!to.dueDiligenceComplete) {
    caveats.push("This token has not completed SaucerSwap's due-diligence process. Anyone can list a token on a DEX.");
  }
  if (from.priceUsd <= 0 || to.priceUsd <= 0) {
    caveats.push(
      "At least one of these tokens has no published price, so no estimate is possible. The router may still be able to route it.",
    );
    return { amountIn, estimatedOut: "0", rate: 0, caveats };
  }

  const rate = from.priceUsd / to.priceUsd;

  // Scale through integers so no float ever touches a token amount. 1e12 is
  // ample for a display estimate and cannot overflow a double at these sizes.
  const PRECISION = 1_000_000_000_000n;
  const scaledRate = BigInt(Math.round(rate * 1e12));
  const decimalShift = 10n ** BigInt(Math.abs(to.decimals - from.decimals));

  let out = ((amountIn as bigint) * scaledRate) / PRECISION;
  out = to.decimals >= from.decimals ? out * decimalShift : out / decimalShift;

  return {
    amountIn,
    estimatedOut: fromTokenUnits(out as TokenUnits, to.decimals),
    rate,
    caveats,
  };
}

/** The decimal spread across a token list. Rendered on the home route. */
export function decimalsHistogram(tokens: SaucerToken[]): {
  decimals: number;
  count: number;
}[] {
  const counts = new Map<number, number>();
  for (const token of tokens) {
    counts.set(token.decimals, (counts.get(token.decimals) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([decimals, count]) => ({ decimals, count }))
    .sort((a, b) => a.decimals - b.decimals);
}
