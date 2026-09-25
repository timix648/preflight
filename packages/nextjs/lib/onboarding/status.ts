/**
 * Trap #7 — status codes.
 *
 * Hedera's failure modes are distinctive, and handling them by name is the
 * difference between a template that reads as fluent and one that reads as a
 * wrapper. Every error surfaced anywhere in this project goes through here, so
 * no raw RPC string can reach a user.
 *
 * Deliberately NOT an enumeration of the protocol. These are the codes this
 * template actually hits; a wall of 300 unreachable cases would be dead code.
 * Add a case when you genuinely hit one, and write the fix from what actually
 * worked.
 *
 * Framework-free. See AGENTS.md.
 */
import type { StatusExplanation } from "./types";

const DOCS = "https://docs.hedera.com/hedera/core-concepts/smart-contracts";
const PORTAL = "https://portal.hedera.com";

const TABLE: Record<string, Omit<StatusExplanation, "code">> = {
  TOKEN_NOT_ASSOCIATED_TO_ACCOUNT: {
    human: "This account has not opted in to receive that token, and it has no free automatic association slots.",
    fix: "Associate first, or send through a path that does it for them. ensureAssociated() picks one and tells you which and why.",
    docsUrl: "https://docs.hedera.com/hedera/sdks-and-apis/sdks/token-service/associate-tokens-to-an-account",
  },

  INVALID_SIGNATURE: {
    human: "The network rejected the signature on this transaction.",
    fix: "On Hedera this is usually an address-form problem rather than a bad key: a long-zero address is derived from the account number, not from a public key, so ECRECOVER cannot produce it. Check ecrecoverCompatible before comparing recovered addresses.",
  },

  INSUFFICIENT_PAYER_BALANCE: {
    human: "The paying account cannot cover this transaction's fee.",
    fix: `Fund it at ${PORTAL}/faucet. Note that on the airdrop path the SENDER pays the association fee, so the account that ran out is often not the one you expected.`,
  },

  INSUFFICIENT_GAS: {
    human: "The transaction ran out of gas.",
    fix: "Calls that touch a Hedera system contract cost far more than the same call would on Ethereum. Raise the gas limit before assuming the call is wrong.",
    docsUrl: DOCS,
  },

  CONTRACT_REVERT_EXECUTED: {
    human: "The contract reverted.",
    fix: "Read the revert reason before changing anything. If it is empty and the call touched a system contract, suspect gas before logic.",
    docsUrl: DOCS,
  },

  INVALID_ACCOUNT_ID: {
    human: "That account does not exist on this network.",
    fix: "Check you are on testnet rather than mainnet. Account numbers are not shared between networks, so a valid mainnet id looks exactly like an invalid testnet one.",
  },

  ACCOUNT_DELETED: {
    human: "That account has been deleted.",
    fix: "Deleted accounts cannot receive tokens or HBAR. Use a different recipient.",
  },

  TRANSACTION_EXPIRED: {
    human: "The transaction expired before the network processed it.",
    fix: "Hedera's validity window is short and unforgiving of clock drift. Check your system clock is synchronised, then retry.",
  },

  DUPLICATE_TRANSACTION: {
    human: "A transaction with this id was already submitted.",
    fix: "Usually a double-submitted click. Check whether the first one actually succeeded before retrying.",
  },

  TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT: {
    human: "This account is already able to hold that token.",
    fix: "Nothing to do — treat this as success. associationState() checks first so the kit never pays for a redundant association.",
  },

  NO_REMAINING_AUTOMATIC_ASSOCIATIONS: {
    human: "This account's automatic association slots are all used up.",
    fix: "Raise maxAutomaticTokenAssociations (-1 is unlimited), or use the airdrop path, where the sender pays and the recipient claims.",
  },

  MAX_CHILD_RECORDS_EXCEEDED: {
    human: "This transaction produced more child records than the network allows.",
    fix: "Split the batch. One atomic associate plus transfer is fine; dozens in a single call are not.",
  },

  INVALID_TOKEN_ID: {
    human: "That token does not exist on this network.",
    fix: "Check the network. A mainnet token id is a perfectly well-formed, non-existent testnet id.",
  },

  ACCOUNT_FROZEN_FOR_TOKEN: {
    human: "This account is frozen for that token and cannot send or receive it.",
    fix: "Only the token's freeze key can unfreeze it. Nothing done on the recipient side will help.",
  },

  INVALID_PENDING_AIRDROP_ID: {
    human: "That pending airdrop no longer exists.",
    fix: "It was already claimed, rejected, or cancelled by the sender. Re-read pending airdrops before acting on one.",
  },
};

/** Fallbacks for failures that never produce a Hedera status code at all. */
const NON_STATUS: Record<string, Omit<StatusExplanation, "code">> = {
  ED25519_KEY_FOR_EVM: {
    human: "This account uses an ED25519 key, which has no EVM address of its own.",
    fix: `EVM tooling, contract deploys and harness chain validation all need ECDSA. Create an ECDSA account at ${PORTAL} — the key type is chosen at creation and cannot be changed afterwards.`,
  },

  LONG_ZERO_NOT_RECOVERABLE: {
    human: "This address is the long-zero form, derived from the account number rather than from a public key.",
    fix: "ECRECOVER cannot return this address. It returns a different, valid-looking one instead of failing, so compare against the key-derived address or verify through isAuthorized on the Account Service at 0x16a.",
  },

  ACCOUNT_NOT_YET_CREATED: {
    human:
      "This wallet address has no Hedera account yet. On Hedera an EVM address does not exist as an account until it first receives HBAR.",
    fix: "Send it some HBAR — the network creates the account automatically on first receipt (a hollow account). A brand-new burner wallet always looks like this until it is funded, which is why a fresh wallet appears to 'not exist' rather than showing a zero balance.",
    docsUrl: "https://docs.hedera.com/hedera/core-concepts/accounts/account-properties",
  },

  MIRROR_NODE_UNAVAILABLE: {
    human: "The mirror node did not answer.",
    fix: "Reads are unavailable but nothing on-chain is wrong. Retry; if it persists, check https://status.hedera.com.",
  },

  RELAY_RATE_LIMITED: {
    human: "The JSON-RPC relay is rate limiting this client.",
    fix: "Public Hashio allows roughly 200 requests per IP per window. Slow down, or point the app at your own relay.",
  },

  RELAY_UNAVAILABLE: {
    human: "The JSON-RPC relay did not answer.",
    fix: "Mirror-node reads still work, so wallet-free pages keep rendering. Retry, or set NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL to a relay you control.",
  },

  NO_ROUTE_FOR_PAIR: {
    human: "SaucerSwap has no direct pool for that pair, so the router cannot quote it.",
    fix: "Most listed tokens have no direct WHBAR pool — this is the common case, not an error. Pick a token that does, or route through an intermediate hop.",
  },

  INVALID_SWAP_AMOUNT: {
    human: "That is not a usable amount of HBAR to swap.",
    fix: "Enter a positive amount with at most 8 decimal places. HBAR has 8 decimals, and more precision than that cannot be expressed on-chain.",
  },

  MISSING_ACCOUNT: {
    human: "No account was supplied.",
    fix: "Pass an account id (0.0.x) or an EVM address.",
  },

  BATCH_UNAVAILABLE: {
    human: "Native atomic batching is not enabled for this executor and network.",
    fix: "Use explicit association, or configure a supported native batch executor and its batch signing key.",
  },

  INVALID_ASSOCIATION_REQUEST: {
    human: "The association request is missing valid transaction details.",
    fix: "For airdrop or batch, supply distinct sender and recipient ids and a positive token amount within signed 64-bit range. For an account update, supply the new slot limit.",
  },

  SAUCERSWAP_UNAVAILABLE: {
    human: "The SaucerSwap API did not answer.",
    fix: "Token prices and the token list are unavailable, so /acquire cannot quote. Everything that reads Hedera directly — / and /diagnose — still works, because they do not depend on the DEX.",
  },

  NOT_FOUND_404: {
    // An internal sentinel: the mirror node returns a bare 404 without saying
    // WHICH id was wrong, so callers re-map this to INVALID_ACCOUNT_ID or
    // INVALID_TOKEN_ID, which they can distinguish and a user can act on.
    human: "The network has no record of that id.",
    fix: "Check the id, and check you are on the network you think you are on.",
  },

  UNKNOWN: {
    human: "Something failed and the network did not say why in a form this kit recognises.",
    fix: "The raw detail is preserved on the error's cause. If you hit this repeatedly, add the code to lib/onboarding/status.ts with a fix that actually worked.",
  },
};

/**
 * Turn a status code — or anything at all — into something a person can act on.
 *
 * Accepts a bare code, a message with a code buried in it, or an arbitrary
 * thrown value, because that is the real range of things that arrive at a catch
 * site. Always returns an explanation and never throws: an error handler that
 * can itself fail is not an error handler.
 */
export function explain(input: unknown): StatusExplanation {
  const code = extractCode(input);
  const known = TABLE[code] ?? NON_STATUS[code];
  if (known) return { code, ...known };
  return { code: code || "UNKNOWN", ...NON_STATUS.UNKNOWN };
}

/** Does the kit explain this properly, rather than falling back to UNKNOWN? */
export function isExplained(input: unknown): boolean {
  const code = extractCode(input);
  return Boolean(TABLE[code] ?? NON_STATUS[code]);
}

/** Every code this template can explain. Rendered by the /diagnose route. */
export function explainedCodes(): string[] {
  return [...Object.keys(TABLE), ...Object.keys(NON_STATUS)].sort();
}

/**
 * Pull a Hedera status code out of whatever was thrown.
 *
 * SDK errors carry `.status`, JSON-RPC errors bury the code inside a message,
 * and plenty of things arrive as plain strings.
 */
function extractCode(input: unknown): string {
  if (typeof input === "string") return normalise(input);

  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;

    const status = record.status;
    if (typeof status === "string") return normalise(status);
    if (status && typeof status === "object") {
      const asString = String((status as { toString?: () => string }).toString?.() ?? "");
      if (asString && asString !== "[object Object]") return normalise(asString);
    }

    for (const key of ["code", "name", "message"] as const) {
      const value = record[key];
      if (typeof value === "string") {
        const found = normalise(value);
        // Error.name is normally "Error", which normalises to UNKNOWN. Do
        // not let that fallback hide the useful status in Error.message.
        if (found !== "UNKNOWN" && (TABLE[found] || NON_STATUS[found])) return found;
      }
    }
  }

  return "UNKNOWN";
}

/** Find a SCREAMING_SNAKE code inside a longer message, if there is one. */
function normalise(value: string): string {
  const trimmed = value.trim();
  if (/^[A-Z][A-Z0-9_]*$/.test(trimmed)) return trimmed;

  const embedded = trimmed.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g);
  if (embedded) {
    for (const candidate of embedded) {
      if (TABLE[candidate] || NON_STATUS[candidate]) return candidate;
    }
    return embedded[0];
  }
  return "UNKNOWN";
}
