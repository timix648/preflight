import { NextResponse } from "next/server";
import { OnboardingError, compareQuotes, explain, findToken, indicativeQuote, routerQuote } from "~~/lib/onboarding";

/**
 * A real swap quote from the SaucerSwap router, plus the price-feed estimate
 * for comparison.
 *
 * Both numbers are returned deliberately. Measured on testnet they diverged by
 * 12.6% for HBAR/SAUCE — not from price impact, which is under 0.2% even at
 * 10,000x the trade size, but because the published feed simply disagrees with
 * the pool. Showing one number and implying it is the truth is how a UI
 * misleads someone; showing both, with the gap named, teaches them something.
 *
 * GET /api/onboarding/quote?token=0.0.1183558&hbar=1
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tokenId = searchParams.get("token");
  const hbar = searchParams.get("hbar") ?? "1";

  if (!tokenId) {
    return NextResponse.json({ error: explain("INVALID_TOKEN_ID") }, { status: 400 });
  }

  try {
    const token = await findToken(tokenId);
    if (!token) {
      return NextResponse.json({ error: explain("INVALID_TOKEN_ID") }, { status: 404 });
    }

    // The token's EVM address is the long-zero form of its id.
    const tokenEvm =
      "0x" +
      tokenId
        .split(".")
        .map((part, index) =>
          BigInt(part)
            .toString(16)
            .padStart(index === 0 ? 8 : 16, "0"),
        )
        .join("");

    const router = await routerQuote({
      hbarAmount: hbar,
      tokenEvmAddress: tokenEvm,
      // Read from the DEX. Thirteen distinct scales exist in this list.
      tokenDecimals: token.decimals,
    });

    // The price-feed estimate, for contrast only. Never executed against.
    let indicative: string | null = null;
    try {
      const whbar = await findToken("0.0.15058");
      if (whbar) {
        indicative = indicativeQuote({ from: whbar, to: token, amount: hbar }).estimatedOut;
      }
    } catch {
      // A missing estimate is cosmetic; the router's number is the real one.
    }

    const comparison = indicative
      ? compareQuotes({
          routerAmountOut: router.amountOut,
          indicativeAmountOut: indicative,
          tokenDecimals: token.decimals,
        })
      : null;

    return NextResponse.json({
      token,
      tokenEvm,
      // bigint is not JSON-serialisable.
      amountIn: router.amountIn.toString(),
      amountOut: (router.amountOut as bigint).toString(),
      amountOutMin: (router.amountOutMin as bigint).toString(),
      amountOutFormatted: router.amountOutFormatted,
      rate: router.rate,
      path: router.path,
      indicative,
      comparison,
    });
  } catch (error) {
    const explanation = error instanceof OnboardingError ? error.explanation : explain(error);
    const status = explanation.code === "NO_ROUTE_FOR_PAIR" ? 404 : 502;
    return NextResponse.json({ error: explanation }, { status });
  }
}
