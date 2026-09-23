/**
 * Integration tests against LIVE testnet endpoints.
 *
 * Excluded from the default `yarn test` run on purpose: they need the network,
 * and a unit suite that fails because testnet was slow teaches a developer to
 * ignore red. Run them deliberately:
 *
 *   yarn test:live
 *
 * They are the day-8 re-probe from the build plan, expressed as code rather
 * than as a checklist item someone has to remember.
 */
import { SAUCERSWAP_TESTNET_CONTRACTS } from "./contracts";
import { profileAccount, verificationRouteFor } from "./keys";
import { getAccount, getToken } from "./mirror";
import { relayLimits } from "./relay";
import { decimalsHistogram, getStats, listTokens, rankTokens } from "./saucerswap";
import { routerQuote } from "./swap";
import { describe, expect, it } from "vitest";

const TIMEOUT = 30_000;

describe("mirror node", () => {
  it(
    "reads the long-zero ED25519 system account 0.0.2",
    async () => {
      const account = await getAccount("0.0.2");
      expect(account.accountId).toBe("0.0.2");
      expect(account.evmAddress).toBe("0x0000000000000000000000000000000000000002");
      expect(account.keyType).toBe("ED25519");
    },
    TIMEOUT,
  );

  it(
    "profiles 0.0.2 as not ECRECOVER-compatible and routed to isAuthorized",
    async () => {
      const profile = await profileAccount("0.0.2");
      expect(profile.addressForm).toBe("evm-long-zero");
      expect(profile.ecrecoverCompatible).toBe(false);
      expect(profile.verificationRoute).toBe("is-authorized");
      expect(verificationRouteFor(profile.keyType)).toBe("is-authorized");
    },
    TIMEOUT,
  );

  it(
    "coerces the quoted decimals field to a real number",
    async () => {
      // The API returns "2", not 2. A string here poisons every amount
      // calculation downstream without throwing.
      const token = await getToken("0.0.5133110");
      expect(typeof token.decimals).toBe("number");
      expect(Number.isInteger(token.decimals)).toBe(true);
    },
    TIMEOUT,
  );
});

describe("JSON-RPC relay", () => {
  it(
    "reports testnet limits, with the paymaster correctly read as OFF",
    async () => {
      const limits = await relayLimits();
      // FIRST, before any value is trusted. Every number below has a fallback
      // identical to the real one, so this suite went on passing after relay
      // 0.78.5 moved the whole settings map under `relay.config` and the
      // reader started finding nothing. Assert that we actually read it.
      expect(limits.live).toBe(true);
      expect(limits.chainId).toBe(296);
      expect(limits.getLogsBlockRangeLimit).toBeGreaterThan(0);
      // The assertion that justifies configBoolean: the API sends the STRING
      // "false", and Boolean("false") is true. If this ever comes back true,
      // the coercion has regressed and the "no gasless" non-goal is wrong.
      expect(limits.paymasterEnabled).toBe(false);
    },
    TIMEOUT,
  );
});

describe("SaucerSwap — the ecosystem anchor", () => {
  it(
    "is alive and has real volume",
    async () => {
      const stats = await getStats();
      expect(stats.swapTotal).toBeGreaterThan(900_000);
      expect(stats.tvlUsd).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  it(
    "token_decimals_are_never_uniform",
    async () => {
      // The empirical basis for refusing to assume 8 or 18 anywhere in this
      // template. If this list ever collapses to one or two scales, the
      // argument in the README needs revisiting.
      const tokens = await listTokens();
      expect(tokens.length).toBeGreaterThan(100);

      const histogram = decimalsHistogram(tokens);
      expect(histogram.length).toBeGreaterThan(5);

      const eightDp = histogram.find(entry => entry.decimals === 8)?.count ?? 0;
      expect(eightDp).toBeLessThan(tokens.length); // 8dp is not universal
    },
    TIMEOUT,
  );

  it(
    "ranks due-diligence-complete tokens ahead of unvetted ones",
    async () => {
      const ranked = rankTokens(await listTokens());
      const firstUnvetted = ranked.findIndex(t => !t.dueDiligenceComplete);
      const lastVetted = ranked.map(t => t.dueDiligenceComplete).lastIndexOf(true);
      if (firstUnvetted !== -1 && lastVetted !== -1) {
        expect(lastVetted).toBeLessThan(firstUnvetted);
      }
    },
    TIMEOUT,
  );
});

describe("SaucerSwap router — the execution path", () => {
  // Verified deployments, cross-checked against the mirror node 19 Sep 2026.
  const SAUCE_EVM = "0x0000000000000000000000000000000000120f46"; // 0.0.1183558
  const SAUCE_DECIMALS = 6;

  it(
    "quotes HBAR to SAUCE from the router itself",
    async () => {
      const quote = await routerQuote({
        hbarAmount: "1",
        tokenEvmAddress: SAUCE_EVM,
        tokenDecimals: SAUCE_DECIMALS,
      });
      expect(quote.amountIn).toBe(100_000_000n); // 1 HBAR in tinybar
      expect(quote.amountOut as bigint).toBeGreaterThan(0n);
      expect(quote.rate).toBeGreaterThan(0);
      // path[0] must be WHBAR or the router rejects with INVALID_PATH.
      expect(quote.path[0]).toBe(SAUCERSWAP_TESTNET_CONTRACTS.whbarToken.evmAddress);
    },
    TIMEOUT,
  );

  it(
    "slippage_floor_is_always_below_the_quote",
    async () => {
      const quote = await routerQuote({
        hbarAmount: "1",
        tokenEvmAddress: SAUCE_EVM,
        tokenDecimals: SAUCE_DECIMALS,
        slippageBasisPoints: 100,
      });
      // amountOutMin is what actually gets sent to the router. If it ever
      // exceeded the quote, every swap would revert as unsatisfiable.
      expect(quote.amountOutMin as bigint).toBeLessThan(quote.amountOut as bigint);
      expect(quote.amountOutMin as bigint).toBeGreaterThan(0n);
    },
    TIMEOUT,
  );

  it(
    "price_impact_is_not_what_makes_the_feed_disagree",
    async () => {
      // The measurement that justifies swap.ts existing. Quoting across four
      // orders of magnitude barely moves the rate, so a large divergence from
      // the published price feed cannot be explained as slippage.
      const [small, large] = await Promise.all([
        routerQuote({ hbarAmount: "0.01", tokenEvmAddress: SAUCE_EVM, tokenDecimals: SAUCE_DECIMALS }),
        routerQuote({ hbarAmount: "100", tokenEvmAddress: SAUCE_EVM, tokenDecimals: SAUCE_DECIMALS }),
      ]);
      const impact = Math.abs(large.rate - small.rate) / small.rate;
      expect(impact).toBeLessThan(0.05); // under 5% across 10,000x size
    },
    TIMEOUT,
  );

  it(
    "explains a pair with no pool instead of returning a wrong number",
    async () => {
      // A token with no direct WHBAR pool is the COMMON case, not an error.
      await expect(
        routerQuote({
          hbarAmount: "1",
          tokenEvmAddress: "0x0000000000000000000000000000000000000002",
          tokenDecimals: 8,
        }),
      ).rejects.toThrow();
    },
    TIMEOUT,
  );
});
