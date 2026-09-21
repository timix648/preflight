/**
 * The Hedera Token Onboarding Kit — public surface.
 *
 * Import from here rather than from individual files, so the module layout
 * stays free to change without breaking anyone who forked this template.
 *
 * Everything below is framework-free: no React, no Next.js, no wagmi. It runs
 * from a route handler, a script, a test, or another framework entirely. React
 * hooks that wrap this core live in hooks/onboarding/.
 *
 * The eight traps, and where each is handled:
 *
 *   1. association      association.ts   the four-path decision tree
 *   2. address duality  address.ts       long-zero vs key-derived
 *   3. key types        keys.ts          ECDSA vs ED25519 vs threshold
 *   4. key rotation     keys.ts          by refusing to cache
 *   5. decimals         units.ts         branded Tinybar/Weibar/TokenUnits
 *   6. consistency      consistency.ts   mirror node vs JSON-RPC
 *   7. status codes     status.ts        every failure as a sentence + a fix
 *   8. relay limits     relay.ts         read live from /config
 */

// The interface contract. Import types from here.
export type {
  AccountProfile,
  AddressForm,
  AssociationState,
  AssociationStrategy,
  KeyType,
  Reading,
  RelayLimits,
  StatusExplanation,
  TokenSummary,
  VerificationRoute,
} from "./types";
export { OnboardingError } from "./types";

// Trap 2 — addresses.
export { classifyAddress, isLongZero, toAccountId, toEvmAddress } from "./address";

// Trap 5 — decimals.
export type { Tinybar, TokenUnits, Weibar } from "./units";
export {
  TINYBAR_DECIMALS,
  TINYBAR_TO_WEIBAR,
  WEIBAR_DECIMALS,
  fromTokenUnits,
  hbarToTinybar,
  hbarToWeibar,
  tinybar,
  tinybarToHbar,
  tinybarToWeibar,
  toTokenUnits,
  tokenUnits,
  weibar,
  weibarToTinybar,
} from "./units";

// Trap 7 — errors that a person can act on.
export { explain, explainedCodes, isExplained } from "./status";

// Wallet-free reads.
export type { MirrorAccount, MirrorOptions, MirrorTokenRelationship } from "./mirror";
export {
  MIRROR_MAINNET,
  MIRROR_TESTNET,
  getAccount,
  getPendingAirdrops,
  getToken,
  getTokenRelationship,
  mirrorNumber,
  mirrorTimestampToSeconds,
} from "./mirror";

// Traps 3 and 4 — keys.
export { canUseEvmTooling, describeKeySituation, detectKeyType, profileAccount, verificationRouteFor } from "./keys";

// Trap 8 — relay limits.
export type { RelayOptions } from "./relay";
export {
  RELAY_MAINNET,
  RELAY_TESTNET,
  configBoolean,
  configNumber,
  describeLimits,
  fetchRelayConfig,
  fetchRelayVersion,
  relayLimits,
} from "./relay";

// Trap 6 — read consistency.
export type { Reconciliation } from "./consistency";
export { readHbarFromMirror, readHbarFromRpc, readTokenFromMirror, reconcileHbar, sourceBadge } from "./consistency";

// Trap 1 — association. The centrepiece.
export type {
  AssociationExecutor,
  AssociationReceipt,
  AssociationRequest,
  StrategyContext,
  StrategySelection,
} from "./association";
export {
  UNLIMITED_AUTO_SLOTS,
  associationState,
  describeStrategy,
  ensureAssociated,
  hashscanUrl,
  pendingAirdropsFor,
  selectStrategy,
} from "./association";

// The ecosystem anchor.
export type { SaucerStats, SaucerSwapOptions, SaucerToken } from "./saucerswap";
export {
  SAUCERSWAP_MAINNET,
  SAUCERSWAP_TESTNET,
  decimalsHistogram,
  findToken,
  getStats,
  indicativeQuote,
  listTokens,
  rankTokens,
} from "./saucerswap";

// The swap path: verified router addresses and live quotes.
export {
  SAUCERSWAP_TESTNET_CONTRACTS,
  SAUCERSWAP_V1_ROUTER_ABI,
  applySlippage,
  deadlineFromNow,
  hbarToTokenPath,
} from "./contracts";
export type { RouterQuote } from "./swap";
export { compareQuotes, routerQuote } from "./swap";

export type { EvidenceBeat } from "./evidence";
export {
  EVIDENCE_ACCOUNTS,
  EVIDENCE_BEATS,
  EVIDENCE_TOKEN,
  evidenceElapsedSeconds,
  evidenceOffsetSeconds,
} from "./evidence";
