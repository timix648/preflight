/**
 * The interface contract for the Hedera Token Onboarding Kit.
 *
 * This is the single definition of every shared type. Both sides of the
 * build import from here; neither retypes a shape locally. A frontend
 * carrying its own copy of a shared type is how a two-person build
 * silently diverges.
 *
 * ---------------------------------------------------------------------
 * ARCHITECTURAL RULE — this directory must stay framework-free.
 *
 * Nothing under `lib/onboarding/` may import React, Next.js, wagmi or any
 * hook. Hooks are a thin layer on top, in `hooks/onboarding/`. That rule
 * is what lets this core run from a route handler, a script, a test, or
 * another framework entirely — and it is what makes this a foundation
 * rather than a UI. See AGENTS.md.
 * ---------------------------------------------------------------------
 */

// =====================================================================
// Addresses
// =====================================================================

/**
 * How a Hedera address is expressed — and, critically, where it came from.
 *
 * The distinction is not cosmetic. An address derived from an account id
 * ("long-zero") is NOT recoverable from a signature, so `ecrecover` will
 * return the wrong answer instead of failing loudly. That is trap #2.
 */
export type AddressForm =
  /** Native Hedera form, `0.0.1234`. */
  | "account-id"
  /** EVM address derived from an ECDSA public key. ECRECOVER-compatible. */
  | "evm-from-key"
  /** `0x` + 12 zero bytes + account number. NOT ECRECOVER-compatible. */
  | "evm-long-zero";

/**
 * The key algorithm on an account.
 *
 * ED25519 accounts have no EVM alias and cannot be used with EVM tooling
 * or with harness Tier 3.5. This is the single most common setup failure
 * on Hedera, which is why it is a first-class type rather than a string.
 *
 * `protobuf-encoded` is a threshold key, a key list, or a contract key. It is
 * neither an oversight nor an error state: roughly one testnet account in ten
 * has one. It matters because no single ECRECOVER can speak for a multi-key
 * account, so it must route to isAuthorized rather than be treated as ECDSA.
 */
export type KeyType = "ECDSA" | "ED25519" | "protobuf-encoded" | "unknown";

/**
 * Which verification path applies to an account's key.
 *
 * ECDSA keys verify through `ecrecover`. ED25519 keys cannot, and must go
 * through `isAuthorized` / `isAuthorizedRaw` on the Hedera Account Service
 * system contract at `0x16a`.
 */
export type VerificationRoute = "ecrecover" | "is-authorized" | "unsupported";

// =====================================================================
// Association — the product
// =====================================================================

/**
 * The four mechanisms Hedera provides for letting an account hold a token.
 *
 * Hedera shipped three protocol changes at the association problem and
 * produced four mechanisms with no guidance on which to use when. Packaging
 * that decision is what this template is for. The kit never picks silently:
 * every call names its strategy and every result explains the choice.
 */
export type AssociationStrategy =
  /** `TokenAssociateTransaction`. Recipient signs and pays. Two approvals. */
  | "explicit"
  /** HIP-23 `maxAutomaticTokenAssociations`. `-1` is unlimited. One approval. */
  | "auto-slot"
  /** HIP-904 `TokenAirdropTransaction`. The SENDER pays. One approval. */
  | "airdrop"
  /** HIP-551 atomic associate + transfer. One approval. */
  | "batch";

/**
 * Everything the kit knows about one account, in one shape.
 *
 * Never cache this against a key. Hedera keys rotate, and a stale
 * key-to-address map is trap #4. Re-read it.
 */
export interface AccountProfile {
  /** Native form, `0.0.1234`. */
  accountId: string;
  /** EVM form, `0x…`. */
  evmAddress: string;
  addressForm: AddressForm;
  /** False for `evm-long-zero`. Check this before trusting `ecrecover`. */
  ecrecoverCompatible: boolean;
  keyType: KeyType;
  verificationRoute: VerificationRoute;
  /** `-1` unlimited, `0` none. HIP-23. */
  autoAssociationSlots: number;
  /** Free slots remaining right now, after existing associations. */
  freeAutoAssociationSlots: number;
}

/**
 * The result of asking the kit to make an account able to hold a token.
 *
 * `reason` is a human sentence and is not optional. It is rendered directly
 * in the UI — "Used HIP-904 airdrop: the recipient had no free
 * auto-association slots and no HBAR for fees, so the sender paid." That
 * sentence is the product thesis in one line.
 */
export interface AssociationState {
  associated: boolean;
  strategyUsed?: AssociationStrategy;
  /** Why this strategy, in plain language. Always populated. */
  reason: string;
  transactionId?: string;
  hashscanUrl?: string;
}

// =====================================================================
// Reading state
// =====================================================================

/**
 * A value plus where it came from and whether to trust its freshness.
 *
 * Mirror-node fungible balances are built from a periodic balance file and
 * can lag a transfer that has already succeeded. Returning a bare number
 * hides that; this shape forces the UI to show its source. Trap #6.
 */
export interface Reading<T> {
  value: T;
  source: "mirror-node" | "json-rpc";
  /** Unix seconds. */
  asOf: number;
  /** True for mirror-node fungible balances. Show a badge when set. */
  mayBeStale: boolean;
}

/**
 * A Hedera status code rendered as something a person can act on.
 *
 * Every failure surfaced by this template goes through here. A judge must
 * never see a raw RPC string. Trap #7.
 */
export interface StatusExplanation {
  /** e.g. `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`. */
  code: string;
  /** One sentence, no jargon. */
  human: string;
  /** What to actually do about it. */
  fix: string;
  docsUrl?: string;
}

/**
 * The relay's real limits, read from its live `/config`.
 *
 * These are not documented and not guessable — Hashio caps `eth_getLogs` at
 * 1000 blocks and ships a paymaster that is switched off. Surfacing the
 * live values stops a developer designing against limits that do not hold.
 * Trap #8.
 */
export interface RelayLimits {
  /** e.g. `relay/0.78.5`. */
  version: string;
  /** 296 testnet, 295 mainnet. */
  chainId: number;
  /** 1000 on Hashio, not unlimited. */
  getLogsBlockRangeLimit: number;
  defaultRateLimit: number;
  callDataSizeLimit: number;
  /** False on Hashio — there is no gasless path without self-hosting. */
  paymasterEnabled: boolean;
}

// =====================================================================
// Token metadata
// =====================================================================

/** A token as the picker and the diagnose route need it. */
export interface TokenSummary {
  tokenId: string;
  evmAddress: string;
  symbol: string;
  name: string;
  /** Token-native decimals. NOT 8, NOT 18 — read it, never assume. */
  decimals: number;
}

// =====================================================================
// Errors
// =====================================================================

/**
 * The only error type this kit throws.
 *
 * It carries a `StatusExplanation` so that every catch site already has a
 * human sentence and a fix to render. Nothing in the UI formats a raw error.
 */
export class OnboardingError extends Error {
  readonly explanation: StatusExplanation;
  readonly cause?: unknown;

  constructor(explanation: StatusExplanation, cause?: unknown) {
    super(`${explanation.code}: ${explanation.human}`);
    this.name = "OnboardingError";
    this.explanation = explanation;
    this.cause = cause;
  }
}
