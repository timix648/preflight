/**
 * Traps #3 and #4 — key types, and key rotation.
 *
 * Which signature-verification path applies to an account depends on its key
 * algorithm, and the wrong choice fails in the worst possible way: ECRECOVER
 * against a non-ECDSA account does not error, it returns a different valid
 * address.
 *
 * ---------------------------------------------------------------------------
 * THE CACHING RULE
 *
 * Nothing in this module memoises. Hedera keys rotate — an account can change
 * its key, and its address does not change when it does. A key-to-address map
 * cached at startup is correct until someone rotates, then silently wrong
 * forever, and the bug looks like an authentication failure rather than a
 * stale cache.
 *
 * If you are about to add a cache here: don't. If a caller needs to avoid
 * repeat reads, it can hold the AccountProfile for the length of one
 * operation and re-read for the next one.
 * ---------------------------------------------------------------------------
 *
 * Framework-free. See AGENTS.md.
 */
import { classifyAddress } from "./address";
import { UNLIMITED_AUTO_SLOTS } from "./association";
import { type MirrorOptions, countAutomaticAssociations, getAccount } from "./mirror";
import type { AccountProfile, KeyType, VerificationRoute } from "./types";

/**
 * Which verification path can actually speak for this key type.
 *
 * ECDSA is the only case where ECRECOVER means anything. Everything else must
 * go through isAuthorized / isAuthorizedRaw on the Hedera Account Service
 * system contract at 0x16a — NOT the Token Service at 0x167, which is a
 * common and expensive confusion.
 */
export function verificationRouteFor(keyType: KeyType): VerificationRoute {
  switch (keyType) {
    case "ECDSA":
      return "ecrecover";
    case "ED25519":
      // ED25519 has no EVM address of its own; 0x16a is the only route.
      return "is-authorized";
    case "protobuf-encoded":
      // Threshold keys and key lists cannot be reduced to one recovered
      // address by construction. 0x16a evaluates the whole key structure.
      return "is-authorized";
    default:
      return "unsupported";
  }
}

/** Can this key type sign EVM transactions and deploy contracts? */
export function canUseEvmTooling(keyType: KeyType): boolean {
  return keyType === "ECDSA";
}

/**
 * Read an account's key type from the network. Never cached — see above.
 */
export async function detectKeyType(idOrAddress: string, options: MirrorOptions = {}): Promise<KeyType> {
  const account = await getAccount(idOrAddress, options);
  return account.keyType;
}

/**
 * The full picture of one account: both address forms, the key, the
 * verification route, and how many automatic association slots are free.
 *
 * This single call is what the /diagnose route renders, and it is the reason
 * that route can show every trap on one screen.
 */
export async function profileAccount(idOrAddress: string, options: MirrorOptions = {}): Promise<AccountProfile> {
  const account = await getAccount(idOrAddress, options);

  // Classify the EVM address the NETWORK reports, not one we derived. An
  // account with a key-derived alias has an evm_address unrelated to its id,
  // and deriving it locally would quietly produce the long-zero form instead.
  const reported = account.evmAddress ?? undefined;
  const classified = reported ? classifyAddress(reported) : classifyAddress(account.accountId);
  const max = account.maxAutomaticTokenAssociations;

  return {
    accountId: account.accountId,
    evmAddress: classified.evmAddress ?? reported ?? "",
    addressForm: classified.form,
    ecrecoverCompatible: classified.ecrecoverCompatible && account.keyType === "ECDSA",
    keyType: account.keyType,
    verificationRoute: verificationRouteFor(account.keyType),
    autoAssociationSlots: max,
    freeAutoAssociationSlots: await freeAutoSlots(account.accountId, max, options),
  };
}

/**
 * Slots still available, which is NOT the same as the ceiling.
 *
 * This used to return `max_automatic_token_associations` unchanged, so an
 * account with a ceiling of 1 that had already used its slot reported one
 * free. selectStrategy believed it, chose `auto-slot`, and the transfer then
 * failed with TOKEN_NOT_ASSOCIATED_TO_ACCOUNT — the exact error this template
 * exists to prevent, produced by the code meant to prevent it. Live example:
 * testnet 0.0.10622718, ceiling 1, one automatic association already held.
 *
 * It stayed invisible because the accounts anyone tests with report -1, where
 * the ceiling and the free count are identical.
 *
 * Unlimited and zero are answered without a second request, so the common
 * paths cost exactly what they did before. Only a finite ceiling pays for the
 * count, and only a finite ceiling can be wrong.
 */
async function freeAutoSlots(accountId: string, max: number, options: MirrorOptions): Promise<number> {
  if (max === UNLIMITED_AUTO_SLOTS) return UNLIMITED_AUTO_SLOTS;
  if (max <= 0) return 0;

  const used = await countAutomaticAssociations(accountId, options).catch(() => null);

  // Unknown resolves to zero, not to `max`. Reporting none free costs an
  // association that may have been unnecessary; reporting some free when
  // there are none costs a failed transfer. Only one of those is recoverable.
  if (used === null) return 0;

  return Math.max(0, max - used);
}

/**
 * Explain, in one sentence, why an account can or cannot be used with EVM
 * tooling. Rendered directly by /diagnose.
 */
export function describeKeySituation(profile: AccountProfile): string {
  if (profile.keyType === "ECDSA" && profile.ecrecoverCompatible) {
    return "ECDSA key with a key-derived EVM address. Works with EVM tooling, and ECRECOVER can verify its signatures.";
  }
  if (profile.keyType === "ECDSA") {
    return "ECDSA key, but this address is the long-zero form derived from the account number. ECRECOVER will return a different address instead of failing — compare against the key-derived address instead.";
  }
  if (profile.keyType === "ED25519") {
    return "ED25519 key. It has no EVM address of its own, so it cannot deploy contracts or sign EVM transactions. Verify through isAuthorized on 0x16a, and use an ECDSA account for anything EVM.";
  }
  if (profile.keyType === "protobuf-encoded") {
    return "Threshold key, key list, or contract key. No single recovered address can speak for it, so verification must go through isAuthorized on 0x16a.";
  }
  return "This account's key type could not be read, so no verification route can be chosen safely.";
}
