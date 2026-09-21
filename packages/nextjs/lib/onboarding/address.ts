/**
 * Trap #2 — address duality.
 *
 * A Hedera account has two addresses, and which one you hold changes what
 * you are allowed to assume about it. Getting this wrong does not throw; it
 * silently returns the wrong answer, which is why this module exists.
 *
 * Framework-free. See AGENTS.md.
 */
import type { AddressForm } from "./types";

/** 4-byte shard + 8-byte realm + 8-byte num = 20 bytes. */
const SHARD_HEX = 8;
const REALM_HEX = 16;
const NUM_HEX = 16;
const ADDRESS_HEX = SHARD_HEX + REALM_HEX + NUM_HEX; // 40

const ACCOUNT_ID_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const EVM_RE = /^0x[0-9a-fA-F]{40}$/;

/** The 12 leading bytes that are zero in every long-zero address. */
const LONG_ZERO_PREFIX = "0".repeat(SHARD_HEX + REALM_HEX);

const strip0x = (value: string): string => (value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value);

/**
 * Is this address the long-zero encoding of an account id?
 *
 * True when the leading 12 bytes are zero. A key-derived address could in
 * principle collide with that shape, but it requires 96 specific zero bits —
 * roughly 1 in 7.9e28. Treat the check as exact.
 */
export function isLongZero(evmAddress: string): boolean {
  if (!EVM_RE.test(evmAddress)) return false;
  return strip0x(evmAddress).toLowerCase().startsWith(LONG_ZERO_PREFIX);
}

/**
 * Account id -> its long-zero EVM address.
 *
 * Always succeeds and never needs the network: the long-zero form is a pure
 * re-encoding of the id. It does NOT tell you the account's key-derived
 * address — most accounts have one, and it is unrelated to this value.
 */
export function toEvmAddress(accountId: string): string {
  const match = ACCOUNT_ID_RE.exec(accountId.trim());
  if (!match) {
    throw new TypeError(`Not a Hedera account id: "${accountId}". Expected shard.realm.num, e.g. 0.0.1234.`);
  }
  const [, shard, realm, num] = match;
  const hex =
    BigInt(shard).toString(16).padStart(SHARD_HEX, "0") +
    BigInt(realm).toString(16).padStart(REALM_HEX, "0") +
    BigInt(num).toString(16).padStart(NUM_HEX, "0");

  if (hex.length !== ADDRESS_HEX) {
    throw new RangeError(`Account id "${accountId}" does not fit the 20-byte long-zero encoding.`);
  }
  return `0x${hex}`;
}

/**
 * EVM address -> account id, but ONLY for long-zero addresses.
 *
 * Returns null for a key-derived address. That is not a failure — the mapping
 * genuinely does not exist locally. A key-derived address is an alias, and
 * only the network knows which account it resolves to, so resolving it needs
 * a mirror-node lookup (see mirror.ts).
 *
 * Returning null rather than guessing is deliberate: a wrong account id here
 * would be silently accepted by every downstream call.
 */
export function toAccountId(evmAddress: string): string | null {
  if (!isLongZero(evmAddress)) return null;
  const hex = strip0x(evmAddress).toLowerCase();
  const shard = BigInt(`0x${hex.slice(0, SHARD_HEX)}`);
  const realm = BigInt(`0x${hex.slice(SHARD_HEX, SHARD_HEX + REALM_HEX)}`);
  const num = BigInt(`0x${hex.slice(SHARD_HEX + REALM_HEX)}`);
  return `${shard}.${realm}.${num}`;
}

/**
 * What kind of address is this, and can ECRECOVER be trusted on it?
 *
 * This is the whole point of the module. A long-zero address is derived from
 * the account NUMBER, not from a public key, so recovering a signer from a
 * signature will not produce it. `ecrecover` does not fail in that case — it
 * returns a different, valid-looking address. Any code comparing that result
 * to a long-zero address rejects a legitimate signature and cannot explain
 * why.
 */
export function classifyAddress(address: string): {
  form: AddressForm;
  ecrecoverCompatible: boolean;
  accountId: string | null;
  evmAddress: string | null;
} {
  const trimmed = address.trim();

  if (ACCOUNT_ID_RE.test(trimmed)) {
    return {
      form: "account-id",
      ecrecoverCompatible: false,
      accountId: trimmed,
      evmAddress: toEvmAddress(trimmed),
    };
  }

  if (EVM_RE.test(trimmed)) {
    if (isLongZero(trimmed)) {
      return {
        form: "evm-long-zero",
        ecrecoverCompatible: false,
        accountId: toAccountId(trimmed),
        evmAddress: trimmed.toLowerCase(),
      };
    }
    return {
      form: "evm-from-key",
      ecrecoverCompatible: true,
      accountId: null, // needs a mirror-node lookup
      evmAddress: trimmed.toLowerCase(),
    };
  }

  throw new TypeError(`Not a Hedera address: "${address}". Expected 0.0.1234 or a 0x-prefixed 20-byte address.`);
}
