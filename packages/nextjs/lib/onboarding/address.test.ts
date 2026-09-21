/**
 * Tests are named after the guarantee they protect, not after the function
 * they call. A test called "converts addresses" tells a reviewer nothing; a
 * test called "long_zero_is_never_ecrecover_compatible" states the invariant
 * that keeps a user's valid signature from being rejected.
 *
 * Every hex value below was read from the live testnet mirror node on
 * 18 September 2026 — see .harness/prds/fixtures.md. Hand-invented
 * "long-zero-looking" strings would not prove the classifier works on a real
 * one.
 */
import { classifyAddress, isLongZero, toAccountId, toEvmAddress } from "./address";
import { describe, expect, it } from "vitest";

// Live mirror-node fixtures.
const SYSTEM_ACCOUNT = { id: "0.0.2", evm: "0x0000000000000000000000000000000000000002" };
const ED25519_ACCOUNT = { id: "0.0.1000", evm: "0x00000000000000000000000000000000000003e8" };
const PROTOBUF_ACCOUNT = { id: "0.0.10604882", evm: "0x0000000000000000000000000000000000a1d152" };
/** A real ECDSA account whose address is derived from its public key. */
const KEY_DERIVED = "0x574c17b6d34ffb8e2993645b32f773963fc77a53";

describe("account id to EVM address", () => {
  it("matches what the mirror node reports for real accounts", () => {
    expect(toEvmAddress(SYSTEM_ACCOUNT.id)).toBe(SYSTEM_ACCOUNT.evm);
    expect(toEvmAddress(ED25519_ACCOUNT.id)).toBe(ED25519_ACCOUNT.evm);
    expect(toEvmAddress(PROTOBUF_ACCOUNT.id)).toBe(PROTOBUF_ACCOUNT.evm);
  });

  it("produces exactly 20 bytes", () => {
    expect(toEvmAddress("0.0.0")).toHaveLength(42); // 0x + 40 hex
    expect(toEvmAddress("0.0.18446744073709551615")).toHaveLength(42);
  });

  it("round trips", () => {
    for (const id of [SYSTEM_ACCOUNT.id, ED25519_ACCOUNT.id, PROTOBUF_ACCOUNT.id]) {
      expect(toAccountId(toEvmAddress(id))).toBe(id);
    }
  });

  it("overflows loudly rather than truncating an out-of-range account number", () => {
    // Truncating here would silently address a DIFFERENT account.
    expect(() => toEvmAddress(`0.0.${2n ** 64n}`)).toThrow(RangeError);
  });

  it("rejects things that are not account ids", () => {
    for (const bad of ["", "0.0", "0.0.x", "abc", KEY_DERIVED]) {
      expect(() => toEvmAddress(bad)).toThrow(TypeError);
    }
  });
});

describe("long-zero detection", () => {
  it("recognises the long-zero form the network actually returns", () => {
    expect(isLongZero(SYSTEM_ACCOUNT.evm)).toBe(true);
    expect(isLongZero(ED25519_ACCOUNT.evm)).toBe(true);
    expect(isLongZero(PROTOBUF_ACCOUNT.evm)).toBe(true);
  });

  it("does not mistake a real key-derived address for long-zero", () => {
    expect(isLongZero(KEY_DERIVED)).toBe(false);
  });

  it("treats the zero address as long-zero, because it is 0.0.0", () => {
    expect(isLongZero("0x0000000000000000000000000000000000000000")).toBe(true);
    expect(toAccountId("0x0000000000000000000000000000000000000000")).toBe("0.0.0");
  });

  it("is case insensitive, since callers mix checksummed and lowercase forms", () => {
    expect(isLongZero(SYSTEM_ACCOUNT.evm.toUpperCase().replace("0X", "0x"))).toBe(true);
  });
});

describe("EVM address to account id", () => {
  it("returns null for a key-derived address instead of guessing", () => {
    // The mapping genuinely does not exist locally — only the network knows
    // which account an alias resolves to. Guessing would produce a
    // well-formed, wrong account id that every downstream call accepts.
    expect(toAccountId(KEY_DERIVED)).toBeNull();
  });

  it("returns null for anything that is not an address at all", () => {
    expect(toAccountId("not an address")).toBeNull();
    expect(toAccountId("0x1234")).toBeNull();
  });
});

describe("the ECRECOVER guarantee", () => {
  it("long_zero_is_never_ecrecover_compatible", () => {
    // This is the invariant that stops the kit rejecting a valid signature.
    // ECRECOVER against a long-zero address returns a different, entirely
    // valid-looking address rather than failing, so nothing downstream can
    // detect the mistake once it has been made.
    for (const evm of [SYSTEM_ACCOUNT.evm, ED25519_ACCOUNT.evm, PROTOBUF_ACCOUNT.evm]) {
      const result = classifyAddress(evm);
      expect(result.form).toBe("evm-long-zero");
      expect(result.ecrecoverCompatible).toBe(false);
    }
  });

  it("account_id_form_is_never_ecrecover_compatible", () => {
    const result = classifyAddress("0.0.1234");
    expect(result.form).toBe("account-id");
    expect(result.ecrecoverCompatible).toBe(false);
  });

  it("marks a key-derived address as the only recoverable form", () => {
    const result = classifyAddress(KEY_DERIVED);
    expect(result.form).toBe("evm-from-key");
    expect(result.ecrecoverCompatible).toBe(true);
    expect(result.accountId).toBeNull();
  });

  it("classifies an account id into both of its representations", () => {
    const result = classifyAddress(SYSTEM_ACCOUNT.id);
    expect(result.accountId).toBe(SYSTEM_ACCOUNT.id);
    expect(result.evmAddress).toBe(SYSTEM_ACCOUNT.evm);
  });

  it("rejects input it cannot classify rather than defaulting", () => {
    expect(() => classifyAddress("0xdeadbeef")).toThrow(TypeError);
    expect(() => classifyAddress("")).toThrow(TypeError);
  });
});
