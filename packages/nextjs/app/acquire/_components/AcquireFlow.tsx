"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import type { AccountProfile, AssociationState, SaucerToken, StrategySelection } from "~~/lib/onboarding";
import {
  SAUCERSWAP_TESTNET_CONTRACTS,
  SAUCERSWAP_V1_ROUTER_ABI,
  deadlineFromNow,
  explain,
  hashscanUrl,
  hbarToWeibar,
  toEvmAddress,
} from "~~/lib/onboarding";

/**
 * The acquire journey, end to end: quote, associate, swap.
 *
 * The ordering is the entire point of this template, and it is not a stylistic
 * choice. SaucerSwap's own documentation says so:
 *
 *   "Ensure that the 'to' account has the output token id associated prior to
 *    executing the swap. Failure to do so will result in a
 *    TOKEN_NOT_ASSOCIATED_TO_ACCOUNT error."
 *
 * So the swap button stays disabled until the account can actually hold the
 * token. The kit does not hide that step — it explains which of four
 * mechanisms it chose for it, and why.
 */

/** The Hedera Token Service. Callable from any EVM wallet on Hedera. */
const HTS_PRECOMPILE = "0x0000000000000000000000000000000000000167" as const;

const HTS_ASSOCIATE_ABI = [
  {
    name: "associateToken",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "responseCode", type: "int64" }],
  },
] as const;

interface ProfileResponse {
  profile: AccountProfile;
  association: AssociationState | null;
  selection: StrategySelection;
  hbar: { tinybar: string; source: string; asOf: number } | null;
}

interface QuoteResponse {
  amountOut: string;
  amountOutMin: string;
  amountOutFormatted: string;
  rate: number;
  indicative: string | null;
  comparison: { divergencePercent: number; verdict: string } | null;
}

type Explanation = { code: string; human: string; fix: string };

export const AcquireFlow = ({ tokens }: { tokens: SaucerToken[] }) => {
  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();

  const [tokenId, setTokenId] = useState(tokens[0]?.tokenId ?? "");
  const [hbarAmount, setHbarAmount] = useState("1");
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<Explanation | null>(null);
  const [error, setError] = useState<Explanation | null>(null);
  const [busy, setBusy] = useState(false);
  const [associateTx, setAssociateTx] = useState<string | null>(null);
  const [swapTx, setSwapTx] = useState<string | null>(null);

  const token = useMemo(() => tokens.find(t => t.tokenId === tokenId) ?? null, [tokens, tokenId]);

  /** Re-read association state. Never cached: keys and balances move. */
  const refreshProfile = useCallback(async () => {
    if (!address || !tokenId) return;
    try {
      const response = await fetch(
        `/api/onboarding/profile?account=${encodeURIComponent(address)}&token=${encodeURIComponent(tokenId)}`,
      );
      const body = await response.json();
      if (response.ok) setProfile(body);
      else setError(body.error);
    } catch (cause) {
      setError(explain(cause));
    }
  }, [address, tokenId]);

  /** Quote from the ROUTER, not from the price feed. See swap.ts. */
  const refreshQuote = useCallback(async () => {
    if (!tokenId || !hbarAmount) return;
    setQuoteError(null);
    try {
      const response = await fetch(
        `/api/onboarding/quote?token=${encodeURIComponent(tokenId)}&hbar=${encodeURIComponent(hbarAmount)}`,
      );
      const body = await response.json();
      if (response.ok) setQuote(body);
      else {
        setQuote(null);
        setQuoteError(body.error);
      }
    } catch (cause) {
      setQuote(null);
      setQuoteError(explain(cause));
    }
  }, [tokenId, hbarAmount]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    const timer = setTimeout(() => void refreshQuote(), 350); // debounce typing
    return () => clearTimeout(timer);
  }, [refreshQuote]);

  const associated = profile?.association?.associated ?? false;

  const associate = async () => {
    if (!address || !token) return;
    setError(null);
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        address: HTS_PRECOMPILE,
        abi: HTS_ASSOCIATE_ABI,
        functionName: "associateToken",
        args: [address, toEvmAddress(token.tokenId) as `0x${string}`],
        // System-contract calls cost far more than they look.
        gas: 800_000n,
      });
      setAssociateTx(hash);
      setTimeout(() => void refreshProfile(), 4000);
    } catch (cause) {
      setError(explain(cause));
    } finally {
      setBusy(false);
    }
  };

  const swap = async () => {
    if (!address || !token || !quote) return;
    setError(null);
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        address: SAUCERSWAP_TESTNET_CONTRACTS.routerV1.evmAddress as `0x${string}`,
        abi: SAUCERSWAP_V1_ROUTER_ABI,
        functionName: "swapExactETHForTokens",
        args: [
          // The slippage floor, not the quote. Passing the quote itself would
          // revert on any adverse tick between quoting and mining.
          BigInt(quote.amountOutMin),
          [SAUCERSWAP_TESTNET_CONTRACTS.whbarToken.evmAddress, toEvmAddress(token.tokenId)] as readonly `0x${string}`[],
          address,
          deadlineFromNow(300),
        ],
        // EVM transaction value is weibar (18dp); the network divides by 10^10
        // to reach tinybar. Passing tinybar here under-spends by 10 billion.
        value: hbarToWeibar(hbarAmount) as unknown as bigint,
        gas: 1_200_000n,
      });
      setSwapTx(hash);
      setTimeout(() => void refreshProfile(), 4000);
    } catch (cause) {
      setError(explain(cause));
    } finally {
      setBusy(false);
    }
  };

  // NOTE: there is deliberately no early return for a disconnected wallet.
  //
  // The token picker and the router quote need no wallet at all — the quote is
  // a pure eth_call. Hiding them behind a connect button would break the one
  // rule this template takes most seriously: a stranger opens the app and
  // immediately sees something true and useful. Only the two buttons that
  // actually sign anything are gated below.
  return (
    <div className="flex flex-col gap-5">
      {/* ------------------------- inputs ------------------------- */}
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="form-control sm:col-span-2">
          <label className="label" htmlFor="token">
            <span className="label-text font-medium">Token</span>
          </label>
          <select
            id="token"
            className="select select-bordered font-mono text-sm"
            value={tokenId}
            onChange={event => setTokenId(event.target.value)}
          >
            {tokens.map(option => (
              <option key={option.tokenId} value={option.tokenId}>
                {option.symbol} · {option.tokenId} · {option.decimals}dp
                {option.dueDiligenceComplete ? " · vetted" : ""}
                {option.isFeeOnTransfer ? " · fee-on-transfer" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="form-control">
          <label className="label" htmlFor="hbar">
            <span className="label-text font-medium">HBAR to spend</span>
          </label>
          <input
            id="hbar"
            className="input input-bordered font-mono"
            value={hbarAmount}
            onChange={event => setHbarAmount(event.target.value)}
            inputMode="decimal"
          />
        </div>
      </div>

      {/* ------------------------- the quote ------------------------- */}
      {quoteError ? (
        <div className="alert alert-warning flex-col items-start gap-1">
          <div className="font-bold">{quoteError.code}</div>
          <div>{quoteError.human}</div>
          <div className="text-sm opacity-90">{quoteError.fix}</div>
        </div>
      ) : quote ? (
        <div className="card bg-base-100 shadow">
          <div className="card-body gap-3">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <h2 className="card-title text-base">
                {hbarAmount} ℏ → {quote.amountOutFormatted} {token?.symbol}
              </h2>
              <span className="badge badge-success badge-sm">quoted by the router</span>
            </div>

            {quote.comparison && quote.indicative ? (
              <div className="text-sm flex flex-col gap-1">
                <div className="flex justify-between gap-4">
                  <span className="opacity-70">Router (what you will actually get)</span>
                  <span className="font-mono">{quote.amountOutFormatted}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="opacity-70">Published price feed says</span>
                  <span className="font-mono opacity-70">{Number(quote.indicative).toFixed(6)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="opacity-70">Divergence</span>
                  <span
                    className={`font-mono ${Math.abs(quote.comparison.divergencePercent) > 10 ? "text-warning" : ""}`}
                  >
                    {quote.comparison.divergencePercent > 0 ? "+" : ""}
                    {quote.comparison.divergencePercent.toFixed(2)}%
                  </span>
                </div>
                <p className="text-xs opacity-60 mt-1">{quote.comparison.verdict}</p>
              </div>
            ) : null}

            <p className="text-xs opacity-60">
              Minimum accepted after 1% slippage: <span className="font-mono">{quote.amountOutMin}</span> base units.
              The router receives this floor, never the quote itself.
            </p>
          </div>
        </div>
      ) : (
        <div className="skeleton h-28 w-full" />
      )}

      {/* ------------------------- step 1: association ------------------------- */}
      <ol className="steps steps-vertical sm:steps-horizontal w-full">
        <li className={`step ${associated ? "step-primary" : "step-primary"}`}>Associate</li>
        <li className={`step ${associated ? "step-primary" : ""}`}>Swap</li>
      </ol>

      {!isConnected && (
        <div className="alert">
          <span>
            Connect a wallet to go further. Everything above is already live — the token list, each token&apos;s real
            decimals, and a quote from the router itself — with no wallet, no key and no <code>.env</code>.
          </span>
        </div>
      )}

      {profile && !associated ? (
        <div className="card bg-primary text-primary-content shadow">
          <div className="card-body gap-3">
            <h2 className="card-title text-base">Step 1 — the kit will use: {profile.selection.strategy}</h2>
            <p className="leading-relaxed">{profile.selection.reason}</p>
            <p className="text-sm opacity-80">
              SaucerSwap&apos;s own documentation warns that a swap to an account without the output token associated
              fails with <code>TOKEN_NOT_ASSOCIATED_TO_ACCOUNT</code>. This step is why that will not happen to you.
            </p>
            <div className="card-actions">
              <button className="btn btn-neutral btn-sm" onClick={associate} disabled={busy || isPending}>
                {busy || isPending ? <span className="loading loading-spinner loading-sm" /> : null}
                Associate {token?.symbol}
              </button>
            </div>
          </div>
        </div>
      ) : profile && associated ? (
        <div className="alert alert-success flex-col items-start gap-1">
          <div className="font-bold">Step 1 complete — this account can hold {token?.symbol}.</div>
          <div className="text-sm">{profile.association?.reason}</div>
        </div>
      ) : null}

      {associateTx && (
        <a
          className="link link-hover font-mono text-xs break-all"
          href={hashscanUrl(associateTx)}
          target="_blank"
          rel="noreferrer"
        >
          Association transaction on HashScan ↗
        </a>
      )}

      {/* ------------------------- step 2: swap ------------------------- */}
      <button
        className="btn btn-primary"
        onClick={swap}
        disabled={!isConnected || !associated || !quote || busy || isPending}
        title={
          !isConnected
            ? "Connect a wallet first"
            : !associated
              ? "Associate first — the router would fail otherwise"
              : undefined
        }
      >
        {busy || isPending ? <span className="loading loading-spinner loading-sm" /> : null}
        Step 2 — swap {hbarAmount} ℏ for {token?.symbol}
      </button>
      {isConnected && !associated && (
        <p className="text-xs opacity-60 -mt-3">
          Disabled until step 1 completes. Calling the router before associating is the exact failure this template
          removes.
        </p>
      )}

      {swapTx && (
        <div className="alert alert-success flex-col items-start gap-1">
          <div className="font-bold">Swap submitted.</div>
          <a
            className="link link-hover font-mono text-sm break-all"
            href={hashscanUrl(swapTx)}
            target="_blank"
            rel="noreferrer"
          >
            View on HashScan ↗
          </a>
        </div>
      )}

      {error && (
        <div className="alert alert-error flex-col items-start gap-1">
          <div className="font-bold">{error.code}</div>
          <div>{error.human}</div>
          <div className="text-sm opacity-90">{error.fix}</div>
        </div>
      )}
    </div>
  );
};
