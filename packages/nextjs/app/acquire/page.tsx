import { AcquireFlow } from "./_components/AcquireFlow";
import type { NextPage } from "next";
import { listTokens, rankTokens } from "~~/lib/onboarding";

/**
 * Acquire and hold a token from SaucerSwap.
 *
 * The token list is fetched on the SERVER so the page has real ecosystem data
 * before any wallet is connected — the picker, the prices, and the decimals
 * are all visible to a stranger. Only the association action needs a wallet.
 */
export const revalidate = 300;

const AcquirePage: NextPage = async () => {
  const tokens = await listTokens()
    .then(rankTokens)
    // The DEX being unavailable must not blank the page.
    .catch(() => []);

  // Tokens with a published price are the ones a user can reason about.
  const usable = tokens.filter(token => token.priceUsd > 0).slice(0, 60);
  // The picker has a search box, so it must say what it is NOT searching.
  // Without this a token that exists on the DEX but sits outside this cap
  // reads as "not listed" rather than "not shown here".
  const totalListed = tokens.length;

  return (
    <div className="max-w-3xl w-full mx-auto px-5 py-10 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Acquire a token</h1>
        <p className="text-sm opacity-70">
          Pick any token listed on SaucerSwap and the kit makes your account able to hold it — choosing one of four
          association mechanisms and telling you which it picked and why.
        </p>
      </div>

      {usable.length === 0 ? (
        <div className="alert alert-warning">
          <span>
            SaucerSwap&apos;s API did not answer, so there is no token list to pick from. The rest of this template does
            not depend on the DEX —{" "}
            <a className="link" href="/diagnose">
              diagnose
            </a>{" "}
            still works.
          </span>
        </div>
      ) : (
        <AcquireFlow tokens={usable} totalListed={totalListed} />
      )}

      <details className="collapse collapse-arrow bg-base-200">
        <summary className="collapse-title font-medium">Why association exists at all</summary>
        <div className="collapse-content text-sm opacity-80 flex flex-col gap-2">
          <p>
            On Hedera an account must opt in before it can hold a given token. Send a token to an account that has not
            opted in and has no free automatic slot, and the transfer fails with{" "}
            <code>TOKEN_NOT_ASSOCIATED_TO_ACCOUNT</code>. This is the single most common error new Hedera developers
            hit.
          </p>
          <p>
            Hedera shipped three protocol changes at the problem, producing four different mechanisms — and no guidance
            on which to use when. This template implements all four behind one API that picks for you, and explains its
            choice in a sentence rather than hiding it.
          </p>
        </div>
      </details>
    </div>
  );
};

export default AcquirePage;
