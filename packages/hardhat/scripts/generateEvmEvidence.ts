/** Scripted EVM execution of the exact builders used by AcquireFlow. Not a browser-wallet UX claim. */
import { Interface, JsonRpcProvider, Wallet } from "ethers";
import { buildAssociationCall, buildSwapCall } from "../../nextjs/lib/onboarding/evm-executor";
import { toEvmAddress } from "../../nextjs/lib/onboarding/address";
import { getToken, getTokenRelationship } from "../../nextjs/lib/onboarding/mirror";
import { routerQuote } from "../../nextjs/lib/onboarding/swap";
import { canSubmitSwap } from "../../nextjs/lib/onboarding/acquisition";
import { indexed, newReport, evidenceError } from "./evidenceSupport";
import { evidenceEvmFees } from "./evidenceEvmFees";

export async function generateEvmEvidence(privateKey: string, accountId: string, nativeRun: string) {
  const provider = new JsonRpcProvider("https://testnet.hashio.io/api", 296);
  const wallet = new Wallet(privateKey, provider);
  const account = wallet.address as `0x${string}`;
  const evidence = newReport("evm");
  evidence.report.nativeRun = nativeRun;
  evidence.report.signing =
    "Local script signer; shared production EVM builders. Browser wallet UX is tested separately.";
  evidence.report.accountId = accountId;
  evidence.report.walletAddress = account;
  try {
    evidence.check("Relay chain ID is Hedera testnet", (await provider.getNetwork()).chainId === 296n);
    // Two known testnet pools. Metadata and decimals are read anew for this run.
    for (const tokenId of ["0.0.1183558", "0.0.5365"]) {
      const token = await getToken(tokenId);
      const existing = await getTokenRelationship(accountId, tokenId);
      if (!existing) {
        const call = buildAssociationCall(account, tokenId);
        const tx = await wallet.sendTransaction({
          ...(await evidenceEvmFees(provider)),
          to: call.address,
          data: new Interface(call.abi).encodeFunctionData(call.functionName, call.args),
          gasLimit: call.gas,
          chainId: call.chainId,
        });
        evidence.report.submittedHash = tx.hash;
        evidence.save();
        const receipt = await tx.wait(1, 120_000);
        evidence.check(`${token.symbol}: association receipt succeeded`, receipt?.status === 1, { hash: tx.hash });
        const contractResult = await indexed(
          async () => {
            const response = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/contracts/results/${tx.hash}`);
            if (!response.ok) throw new Error(`Mirror HTTP ${response.status}`);
            return response.json() as Promise<any>;
          },
          r => !!r.timestamp,
        );
        evidence.report.transactions.push({
          label: `EVM adapter: ${token.symbol} association`,
          verified: true,
          hash: tx.hash,
          result: contractResult.result,
          consensusTimestamp: contractResult.timestamp,
          hashscanUrl: `https://hashscan.io/testnet/transaction/${tx.hash}`,
        });
        evidence.check(
          `${token.symbol}: HTS returned SUCCESS (22)`,
          BigInt(
            contractResult.call_result.startsWith("0x")
              ? contractResult.call_result
              : `0x${contractResult.call_result}`,
          ) === 22n,
        );
      }
      await indexed(
        () => getTokenRelationship(accountId, tokenId),
        r => r !== null,
      );
      const quote = await routerQuote({
        hbarAmount: "0.01",
        tokenEvmAddress: toEvmAddress(tokenId),
        tokenDecimals: token.decimals,
      });
      const receivedAt = Date.now();
      const current = { account, tokenId, chainId: 296 };
      evidence.check(
        `${token.symbol}: production swap guard accepts current association and quote`,
        canSubmitSwap({
          current,
          profileFor: current,
          associated: true,
          quoteFor: { token: tokenId, hbar: "0.01", receivedAt },
          hbar: "0.01",
          pending: false,
        }),
      );
      const call = buildSwapCall({ account, tokenId, hbarAmount: "0.01", amountOutMin: quote.amountOutMin });
      const tx = await wallet.sendTransaction({
        ...(await evidenceEvmFees(provider)),
        to: call.address,
        data: new Interface(call.abi).encodeFunctionData(call.functionName, call.args),
        value: call.value,
        gasLimit: call.gas,
        chainId: call.chainId,
      });
      evidence.report.submittedHash = tx.hash;
      evidence.save();
      const receipt = await tx.wait(1, 120_000);
      evidence.check(`${token.symbol}: swap receipt succeeded`, receipt?.status === 1, { hash: tx.hash });
      const result = await indexed(
        async () => {
          const response = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/contracts/results/${tx.hash}`);
          if (!response.ok) throw new Error(`Mirror HTTP ${response.status}`);
          return response.json() as Promise<any>;
        },
        r => !!r.timestamp,
      );
      evidence.check(`${token.symbol}: mirror confirms successful router execution`, result.result === "SUCCESS");
      // ERC-20 Transfer events are receipt evidence, independent of stale balance files.
      const erc20 = new Interface(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
      const received = receipt!.logs
        .filter(log => log.address.toLowerCase() === toEvmAddress(tokenId).toLowerCase())
        .reduce((total, log) => {
          try {
            const event = erc20.parseLog(log);
            if (!event) return total;
            return [account.toLowerCase(), toEvmAddress(accountId).toLowerCase()].includes(event?.args.to.toLowerCase())
              ? total + BigInt(event.args.value)
              : total;
          } catch {
            return total;
          }
        }, 0n);
      evidence.check(`${token.symbol}: actual received tokens meet slippage floor`, received >= quote.amountOutMin, {
        tokenId,
        decimals: token.decimals,
        hbarSpent: "0.01",
        quotedUnits: quote.amountOut,
        minimumUnits: quote.amountOutMin,
        receivedUnits: received,
      });
      evidence.report.transactions.push({
        label: `EVM adapter: ${token.symbol} acquisition`,
        hash: tx.hash,
        hashscanUrl: `https://hashscan.io/testnet/transaction/${tx.hash}`,
        consensusTimestamp: result.timestamp,
        result: result.result,
        verified: true,
        receivedUnits: received,
        tokenId,
        decimals: token.decimals,
      });
      evidence.save();
    }
    evidence.finish();
    return evidence;
  } catch (error) {
    evidence.report.error = evidenceError(error);
    throw error;
  } finally {
    evidence.save();
    provider.destroy();
  }
}
