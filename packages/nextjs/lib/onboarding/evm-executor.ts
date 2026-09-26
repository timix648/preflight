/** Shared testnet call builders for the EVM UI and signed evidence runner. */
import { toEvmAddress } from "./address";
import { SAUCERSWAP_TESTNET_CONTRACTS, SAUCERSWAP_V1_ROUTER_ABI, deadlineFromNow } from "./contracts";
import { hbarToWeibar } from "./units";

export const HTS_PRECOMPILE = "0x0000000000000000000000000000000000000167" as const;
export const HTS_ASSOCIATE_ABI = [
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

function evmAccount(account: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{40}$/.test(account)) throw new TypeError("A valid EVM account address is required.");
  return account as `0x${string}`;
}

export function buildAssociationCall(account: string, tokenId: string) {
  return {
    address: HTS_PRECOMPILE,
    abi: HTS_ASSOCIATE_ABI,
    functionName: "associateToken" as const,
    chainId: 296 as const,
    args: [evmAccount(account), toEvmAddress(tokenId) as `0x${string}`] as const,
    gas: 800_000n,
  };
}

/** Call only after confirming association and a fresh quote for these inputs. */
export function buildSwapCall(params: { account: string; tokenId: string; hbarAmount: string; amountOutMin: bigint }) {
  if (params.amountOutMin <= 0n) throw new RangeError("A positive slippage floor is required.");
  const value = hbarToWeibar(params.hbarAmount) as unknown as bigint;
  if (value <= 0n) throw new RangeError("A positive HBAR amount is required.");
  return {
    address: SAUCERSWAP_TESTNET_CONTRACTS.routerV1.evmAddress as `0x${string}`,
    abi: SAUCERSWAP_V1_ROUTER_ABI,
    functionName: "swapExactETHForTokens" as const,
    chainId: 296 as const,
    args: [
      params.amountOutMin,
      [SAUCERSWAP_TESTNET_CONTRACTS.whbarToken.evmAddress, toEvmAddress(params.tokenId)] as readonly `0x${string}`[],
      evmAccount(params.account),
      deadlineFromNow(300),
    ] as const,
    value,
    gas: 1_200_000n,
  };
}
