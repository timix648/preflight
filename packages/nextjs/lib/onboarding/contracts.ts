/**
 * SaucerSwap deployment addresses, and the router ABI this template calls.
 *
 * ---------------------------------------------------------------------------
 * WHY THE ROUTER IS THE RIGHT ANCHOR FOR THIS TEMPLATE
 *
 * From SaucerSwap's own developer documentation, on swapping HBAR for tokens:
 *
 *   "Ensure that the 'to' account has the output token id associated prior to
 *    executing the swap. Failure to do so will result in a
 *    TOKEN_NOT_ASSOCIATED_TO_ACCOUNT error."
 *
 * The DEX documents the exact failure this kit exists to remove. Association
 * is not a detail beside the swap — it is a precondition of it, which is why
 * `ensureAssociated()` must resolve before the router is ever called.
 * ---------------------------------------------------------------------------
 *
 * EVERY ADDRESS BELOW WAS VERIFIED AGAINST THE LIVE MIRROR NODE, not merely
 * copied from the documentation. Checked 19 September 2026:
 *
 *   contract                 hedera id      last on-chain call
 *   V1 RouterV3              0.0.19264      8 hours ago     <- chosen
 *   V2 SwapRouter            0.0.1414040    29 hours ago
 *   V2 QuoterV2              0.0.1390002    105 DAYS ago    <- dormant, avoided
 *
 * The V1 router is chosen because it is the most actively used, and because
 * its UniswapV2-style ABI is far easier for someone forking this template to
 * read than V3-style concentrated liquidity.
 *
 * QuoterV2 is deliberately NOT used. It resolves and looks perfectly healthy
 * in the documentation, but nothing has called it in over three months.
 * Building a price path on a dormant contract is the trap this project keeps
 * finding: check the endpoint, not the blog post.
 *
 * Framework-free. See AGENTS.md.
 */

/** Hedera ids and their long-zero EVM forms, both verified on-chain. */
export const SAUCERSWAP_TESTNET_CONTRACTS = {
  /** UniswapV2Router02-style router. The one this template calls. */
  routerV1: {
    hederaId: "0.0.19264",
    evmAddress: "0x0000000000000000000000000000000000004b40",
  },
  /** V1 pair factory. */
  factoryV1: {
    hederaId: "0.0.9959",
    evmAddress: "0x00000000000000000000000000000000000026e7",
  },
  /** V3-style concentrated liquidity router. Live, but not used here. */
  swapRouterV2: {
    hederaId: "0.0.1414040",
    evmAddress: "0x0000000000000000000000000000000000159398",
  },
  /**
   * The WHBAR *token*, which is what a swap path contains.
   *
   * Not to be confused with the WHBAR *contract* at 0.0.15057. They are
   * adjacent ids and picking the wrong one produces INVALID_PATH rather than
   * anything that names the mistake.
   *
   * Independently corroborated: this id also appears as tokenA in the live
   * /v2/pools response, which is how it was confirmed before the docs were
   * consulted.
   */
  whbarToken: {
    hederaId: "0.0.15058",
    evmAddress: "0x0000000000000000000000000000000000003ad2",
  },
  /** The WHBAR wrapper contract. Present for completeness; not called here. */
  whbarContract: {
    hederaId: "0.0.15057",
    evmAddress: "0x0000000000000000000000000000000000003ad1",
  },
} as const;

/**
 * The slice of the V1 router this template uses.
 *
 * `swapExactETHForTokens` is named for Ethereum ancestry — on Hedera the
 * "ETH" is HBAR, supplied as the transaction's value.
 *
 * VALUE UNITS. The `value` field of an EVM transaction is denominated in
 * weibar (18 decimals) at the JSON-RPC layer, and the network converts it to
 * tinybar (8 decimals) by dividing by 10^10. Use `hbarToWeibar()` from
 * units.ts to build it and the branded types make the mistake unrepresentable;
 * passing tinybar here would under-spend by a factor of ten billion.
 */
export const SAUCERSWAP_V1_ROUTER_ABI = [
  {
    name: "swapExactETHForTokens",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    name: "getAmountsOut",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const;

/**
 * Build the swap path for "HBAR in, this token out".
 *
 * The router requires `path[0] == WHBAR` and rejects anything else with
 * `INVALID_PATH`, so this is not a place for caller creativity.
 */
export function hbarToTokenPath(tokenEvmAddress: string): [string, string] {
  return [SAUCERSWAP_TESTNET_CONTRACTS.whbarToken.evmAddress, tokenEvmAddress];
}

/** A deadline `seconds` from now, in the unix seconds the router expects. */
export function deadlineFromNow(seconds = 300): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + seconds);
}

/**
 * Apply slippage tolerance to an expected output.
 *
 * Integer arithmetic throughout: a float here would reintroduce exactly the
 * precision loss units.ts exists to prevent.
 *
 * @param basisPoints 50 = 0.5%. Defaults to 1%, which is generous but
 *        appropriate for thin testnet pools.
 */
export function applySlippage(expectedOut: bigint, basisPoints = 100): bigint {
  if (basisPoints < 0 || basisPoints > 10_000) {
    throw new RangeError(`Slippage must be 0-10000 basis points, got ${basisPoints}.`);
  }
  return (expectedOut * BigInt(10_000 - basisPoints)) / 10_000n;
}
