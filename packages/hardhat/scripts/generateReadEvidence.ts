/** Fresh credential-free snapshots from each external read integration. */
import { Contract, JsonRpcProvider } from "ethers";
import { profileAccount } from "../../nextjs/lib/onboarding/keys";
import { reconcileHbar } from "../../nextjs/lib/onboarding/consistency";
import { getToken } from "../../nextjs/lib/onboarding/mirror";
import { relayLimits } from "../../nextjs/lib/onboarding/relay";
import { listTokens, getStats, decimalsHistogram } from "../../nextjs/lib/onboarding/saucerswap";
import { routerQuote } from "../../nextjs/lib/onboarding/swap";
import { newReport } from "./evidenceSupport";

async function main() {
  const evidence = newReport("reads");
  const provider = new JsonRpcProvider("https://testnet.hashio.io/api", 296);
  try {
    const limits = await relayLimits();
    evidence.check("Hashio returned live testnet config", limits.live && limits.chainId === 296, limits);
    const profile = await profileAccount("0.0.2");
    evidence.check(
      "Mirror/key adapter recognizes ED25519 and routes authorization to HAS",
      profile.keyType === "ED25519" && !profile.ecrecoverCompatible && profile.verificationRoute === "is-authorized",
      profile,
    );
    const finite = await profileAccount("0.0.10622718");
    evidence.check(
      "Finite slot count never exceeds its ceiling",
      finite.freeAutoAssociationSlots >= 0 && finite.freeAutoAssociationSlots <= finite.autoAssociationSlots,
      finite,
    );
    const balances = await reconcileHbar("0.0.2", profile.evmAddress);
    evidence.check(
      "Balance reconciliation has independent mirror and RPC readings",
      balances.mirror !== null && balances.rpc !== null,
      balances,
    );
    const tokens = await listTokens();
    const stats = await getStats();
    evidence.check("SaucerSwap returned live token metadata and activity", tokens.length > 0 && stats.swapTotal > 0, {
      tokenCount: tokens.length,
      decimalHistogram: decimalsHistogram(tokens),
      stats,
    });
    for (const id of ["0.0.1183558", "0.0.5365"]) {
      const token = await getToken(id);
      const quote = await routerQuote({
        hbarAmount: "0.01",
        tokenEvmAddress: token.evmAddress,
        tokenDecimals: token.decimals,
      });
      evidence.check(
        `${token.symbol}: router quote has positive output and a lower slippage floor`,
        quote.amountOut > 0n && quote.amountOutMin > 0n && quote.amountOutMin < quote.amountOut,
        { token, quote },
      );
    }
    const probe = new Contract(
      "0x57631c41cDFB0ef2A7D4ef83b35c38558FA3e2D7",
      [
        "function inspectToken(address token) view returns (bool isHtsToken, bool isFungible)",
        "function isLongZero(address account) pure returns (bool)",
      ],
      provider,
    );
    const token = await getToken("0.0.1183558");
    const inspected = await probe.inspectToken(token.evmAddress);
    evidence.check(
      "Deployed AssociationProbe reaches the live HTS precompile",
      inspected[0] === true && inspected[1] === true,
      { contract: String(probe.target), token: token.tokenId, isHtsToken: inspected[0], isFungible: inspected[1] },
    );
    evidence.check(
      "Deployed probe recognizes long-zero addresses",
      (await probe.isLongZero(profile.evmAddress)) === true,
    );
    evidence.finish();
  } finally {
    evidence.save();
    provider.destroy();
  }
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : "Read evidence failed");
  process.exitCode = 1;
});
