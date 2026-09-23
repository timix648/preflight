import Link from "next/link";
import type { NextPage } from "next";
import { ArchitectureDiagram } from "~~/components/onboarding/ArchitectureDiagram";
import { CountUp } from "~~/components/onboarding/CountUp";
import { ProofOfAssociation } from "~~/components/onboarding/ProofOfAssociation";
import { SourceBadge } from "~~/components/onboarding/SourceBadge";
import { describeLimits, relayLimits } from "~~/lib/onboarding";
import { decimalsHistogram, getStats, listTokens } from "~~/lib/onboarding";

/**
 * The credential-free first journey.
 *
 * A Server Component on purpose. Everything here is a public read, so a
 * stranger with no wallet, no .env and no JavaScript still gets true, live
 * data from Hedera and from a real DEX. Most submissions open on a Connect
 * Wallet button and nothing else.
 *
 * Revalidated rather than cached forever: the numbers are the point.
 */
export const revalidate = 60;

const Home: NextPage = async () => {
  // Never let one slow dependency blank the page. Each panel degrades alone.
  const [limitsResult, statsResult, tokensResult] = await Promise.allSettled([relayLimits(), getStats(), listTokens()]);

  const limits = limitsResult.status === "fulfilled" ? limitsResult.value : null;
  const stats = statsResult.status === "fulfilled" ? statsResult.value : null;
  const tokens = tokensResult.status === "fulfilled" ? tokensResult.value : [];
  const histogram = decimalsHistogram(tokens);
  const maxCount = Math.max(1, ...histogram.map(entry => entry.count));

  return (
    <div className="flex flex-col grow w-full">
      {/* ---------------------------------------------------------------- */}
      {/* The pitch, and the one sentence that explains the whole template  */}
      {/* ---------------------------------------------------------------- */}
      <section className="hedera-gradient dark:bg-none dark:bg-hedera-charcoal w-full px-5 py-12">
        <div className="max-w-5xl mx-auto">
          <p className="eyebrow text-white/70">Hedera testnet · run preflight before the transfer</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            Preflight<span className="accentuate text-white/80">.</span>
          </h1>
          <p className="text-white/90 max-w-3xl text-lg leading-relaxed">
            Your users acquire and hold any Hedera token without ever hitting{" "}
            <code className="px-1 rounded bg-black/25 text-white">TOKEN_NOT_ASSOCIATED_TO_ACCOUNT</code>. Tokens are
            acquired on <strong>SaucerSwap</strong>, a live DEX on Hedera testnet, and the kit picks the right one of
            four association mechanisms and tells you why it chose it.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <Link href="/diagnose" className="btn btn-sm btn-neutral">
              Diagnose an account — no wallet needed
            </Link>
            <Link href="/acquire" className="btn btn-sm btn-ghost text-white">
              Acquire a token
            </Link>
          </div>
          <p className="text-white/70 text-sm mt-4">
            Everything on this page is live and read without a wallet, a key, or a <code>.env</code> file.
          </p>
        </div>
      </section>

      <div className="max-w-5xl w-full mx-auto px-5 py-10 flex flex-col gap-10">
        {/* -------------------------------------------------------------- */}
        {/* The proof. First, because it is the whole argument.             */}
        {/* Static, verified transactions — no network call, so it cannot   */}
        {/* fail to render and cannot be slowed by a cold endpoint.         */}
        {/* -------------------------------------------------------------- */}
        <div className="sd-zoom-in">
          <ProofOfAssociation />
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Relay limits — trap #8                                          */}
        {/* -------------------------------------------------------------- */}
        <section className="sd-left">
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
            <h2 className="text-xl font-bold">What this relay will actually let you do</h2>
            {limits?.live && <SourceBadge source="json-rpc" label={limits.version} />}
          </div>
          {/* The badge and this sentence are gated on limits.live. If the relay
              did not answer, these are compiled-in observations, and saying
              otherwise would be the exact mistake this page is about. */}
          <p className="text-sm opacity-70 mb-4">
            {limits?.live ? (
              <>
                Read live from the relay&apos;s undocumented <code>/config</code> endpoint. None of these values appear
                in the Hedera documentation, and several contradict what an Ethereum developer would assume.
              </>
            ) : (
              <>
                The relay&apos;s undocumented <code>/config</code> endpoint did not answer, so these are the values last
                observed on Hashio testnet — <strong>not</strong> a live reading. They are shown because they are still
                the right thing to design against, but do not quote them as current.
              </>
            )}
          </p>

          {limits ? (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Limit</th>
                    <th>Value</th>
                    <th>What it means for you</th>
                  </tr>
                </thead>
                <tbody>
                  {describeLimits(limits).map(row => (
                    <tr key={row.label}>
                      <td className="font-medium whitespace-nowrap">{row.label}</td>
                      <td className="font-mono whitespace-nowrap">{row.value}</td>
                      <td className="opacity-80">{row.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="alert alert-warning">
              <span>
                The relay did not answer, so its limits are unavailable. Nothing on-chain is wrong — reads through the
                mirror node still work, which is why the rest of this page rendered.
              </span>
            </div>
          )}
        </section>

        {/* -------------------------------------------------------------- */}
        {/* The ecosystem anchor                                            */}
        {/* -------------------------------------------------------------- */}
        <section className="sd-right">
          <h2 className="text-xl font-bold mb-1">SaucerSwap, right now</h2>
          <p className="text-sm opacity-70 mb-4">
            The DEX this template acquires tokens on. Remove it and there is no token to acquire and no journey — the
            integration is load-bearing, not decorative.
          </p>

          {stats ? (
            <div className="stats stats-vertical sm:stats-horizontal shadow w-full sd-stagger">
              <div className="stat">
                <div className="stat-title">Swaps, all time</div>
                <div className="stat-value text-2xl">
                  <CountUp value={stats.swapTotal}>{stats.swapTotal.toLocaleString()}</CountUp>
                </div>
                <div className="stat-desc">on testnet</div>
              </div>
              <div className="stat">
                <div className="stat-title">Total value locked</div>
                <div className="stat-value text-2xl">
                  $<CountUp value={Math.round(stats.tvlUsd)}>{Math.round(stats.tvlUsd).toLocaleString()}</CountUp>
                </div>
              </div>
              <div className="stat">
                <div className="stat-title">Tokens listed</div>
                <div className="stat-value text-2xl">
                  <CountUp value={tokens.length}>{tokens.length.toLocaleString()}</CountUp>
                </div>
                <div className="stat-desc">any of which your users may hold</div>
              </div>
            </div>
          ) : (
            <div className="alert alert-warning">
              <span>
                The SaucerSwap API did not answer, so quotes are unavailable. Everything that reads Hedera directly
                still works, because it does not depend on the DEX.
              </span>
            </div>
          )}
        </section>

        {/* -------------------------------------------------------------- */}
        {/* The decimals argument, made from live data — trap #5            */}
        {/* -------------------------------------------------------------- */}
        {histogram.length > 0 && (
          <section className="sd-zoom-out">
            <h2 className="text-xl font-bold mb-1">Why this kit never assumes decimals</h2>
            <p className="text-sm opacity-70 mb-4">
              Every token on this DEX, grouped by how many decimal places it uses. Code that assumes 8 — or 18 — is
              wrong about a large share of them, and wrong <em>silently</em>: the amount still looks plausible.
            </p>
            <div className="card bg-base-100 shadow">
              <div className="card-body gap-2 py-5 sd-stagger">
                {histogram.map(entry => (
                  <div key={entry.decimals} className="bar-row flex items-center gap-3 text-sm py-1.5">
                    <span className="font-mono w-14 shrink-0 text-right opacity-70">{entry.decimals} dp</span>
                    {/* No background track — see the note in globals.css. The bar
                        sits on the page and the row rule carries the baseline. */}
                    <div className="grow h-3" aria-hidden>
                      <div
                        className="bar-grow bg-primary h-full rounded-xs"
                        style={{ width: `${Math.max(1.5, (entry.count / maxCount) * 100)}%` }}
                      />
                    </div>
                    <span className="font-mono w-16 shrink-0 opacity-70 tabular-nums">
                      <CountUp value={entry.count}>{entry.count}</CountUp>
                    </span>
                  </div>
                ))}
                <p className="text-xs opacity-60 mt-2">
                  {histogram.length} distinct decimal scales across {tokens.length} tokens. This is why{" "}
                  <code>units.ts</code> uses branded types: an 8-decimal value cannot be passed where 18 is expected
                  without a compile error.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* -------------------------------------------------------------- */}
        {/* How it is built — for the reader who will not read the README   */}
        {/* -------------------------------------------------------------- */}
        <section className="sd-wipe">
          <h2 className="text-xl font-bold mb-1">How this is put together</h2>
          <p className="text-sm opacity-70 mb-4">
            The whole design on one screen. Everything of value sits in a framework-free core that never imports React,
            so it runs from a route handler, a script, a test, or another framework entirely.
          </p>
          <ArchitectureDiagram />
        </section>

        {/* -------------------------------------------------------------- */}
        {/* Next step                                                       */}
        {/* -------------------------------------------------------------- */}
        <section className="card bg-base-200 sd-zoom-in">
          <div className="card-body">
            <h2 className="card-title text-lg">See every trap on one screen</h2>
            <p className="text-sm opacity-80">
              Paste any Hedera account — try <code>0.0.2</code> — and the diagnose page shows its address form, whether
              ECRECOVER can be trusted on it, its key type, how many automatic association slots it has left, and what
              will break. No wallet, no key.
            </p>
            <div className="card-actions">
              <Link href="/diagnose?account=0.0.2" className="btn btn-primary btn-sm">
                Diagnose 0.0.2
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Home;
