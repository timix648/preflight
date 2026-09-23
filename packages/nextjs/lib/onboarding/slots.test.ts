/**
 * The guarantee these tests protect: the kit never mistakes an account's
 * automatic-association CEILING for the slots it still has.
 *
 * profileAccount used to return max_automatic_token_associations for both
 * autoAssociationSlots and freeAutoAssociationSlots — the same number twice.
 * An account with a ceiling of 1 that had already used its slot reported one
 * free, selectStrategy chose `auto-slot`, and the transfer then failed with
 * TOKEN_NOT_ASSOCIATED_TO_ACCOUNT. The code written to prevent that error
 * produced it.
 *
 * It hid because every account anyone tests with reports -1, where the
 * ceiling and the free count are genuinely equal. Live counter-example on
 * testnet: 0.0.10622718, ceiling 1, slot already occupied.
 *
 * Three separate places had to agree for this to work, so all three are
 * covered: counting the used slots, deriving the free count, and handing the
 * free count — not the ceiling — to the decision.
 */
import { UNLIMITED_AUTO_SLOTS, selectStrategy } from "./association";
import { profileAccount } from "./keys";
import { countAutomaticAssociations } from "./mirror";
import { describe, expect, it } from "vitest";

/** An ECDSA account with the given ceiling. */
const accountBody = (max: number) => ({
  account: "0.0.10622718",
  evm_address: "0x574c17b6d34ffb8e2993645b32f773963fc77a53",
  alias: null,
  key: { _type: "ECDSA_SECP256K1", key: "02".padEnd(66, "a") },
  max_automatic_token_associations: max,
  deleted: false,
  balance: { balance: 100_000_000, timestamp: `${Math.floor(Date.now() / 1000)}.000000000` },
});

const rel = (id: string, automatic: boolean) => ({
  token_id: id,
  balance: 1,
  automatic_association: automatic,
  decimals: 6,
});

/**
 * Serves the account endpoint and paged token relationships, and records every
 * path requested so a test can assert a request was NOT made.
 */
const stub = (max: number, pages: Record<string, unknown>[][]) => {
  const paths: string[] = [];
  let page = 0;
  const fetchImpl = (async (url: RequestInfo | URL) => {
    const path = String(url);
    paths.push(path);
    const body = path.includes("/tokens")
      ? {
          tokens: pages[page] ?? [],
          links: {
            next: page + 1 < pages.length ? `/api/v1/accounts/0.0.10622718/tokens?limit=100&page=${++page}` : null,
          },
        }
      : accountBody(max);
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as typeof fetch;
  return { options: { fetchImpl }, paths };
};

describe("countAutomaticAssociations counts only the automatic ones", () => {
  it("ignores explicitly associated tokens", async () => {
    const { options } = stub(5, [[rel("0.0.1", true), rel("0.0.2", false), rel("0.0.3", true)]]);
    expect(await countAutomaticAssociations("0.0.10622718", options)).toBe(2);
  });

  it("follows links.next across pages", async () => {
    const { options } = stub(5, [[rel("0.0.1", true)], [rel("0.0.2", true)], [rel("0.0.3", false)]]);
    expect(await countAutomaticAssociations("0.0.10622718", options)).toBe(2);
  });

  it("strips the /api/v1 prefix links.next repeats, or the path doubles up", async () => {
    const { options, paths } = stub(5, [[rel("0.0.1", true)], [rel("0.0.2", true)]]);
    await countAutomaticAssociations("0.0.10622718", options);
    expect(paths.some(p => p.includes("/api/v1/api/v1"))).toBe(false);
  });

  it("returns null rather than an undercount when the page budget runs out", async () => {
    const pages = Array.from({ length: 4 }, () => [rel("0.0.1", true)]);
    const { options } = stub(5, pages);
    expect(await countAutomaticAssociations("0.0.10622718", options, 2)).toBeNull();
  });

  it("handles an account with no relationships", async () => {
    const { options } = stub(5, [[]]);
    expect(await countAutomaticAssociations("0.0.10622718", options)).toBe(0);
  });
});

describe("profileAccount reports slots left, not the ceiling", () => {
  it("THE REGRESSION: ceiling 1, slot used, reports 0 free", async () => {
    const { options } = stub(1, [[rel("0.0.1183558", true)]]);
    const profile = await profileAccount("0.0.10622718", options);
    expect(profile.autoAssociationSlots).toBe(1);
    expect(profile.freeAutoAssociationSlots).toBe(0);
  });

  it("subtracts only automatic associations from the ceiling", async () => {
    const { options } = stub(5, [[rel("0.0.1", true), rel("0.0.2", false), rel("0.0.3", false)]]);
    const profile = await profileAccount("0.0.10622718", options);
    expect(profile.freeAutoAssociationSlots).toBe(4);
  });

  it("never reports a negative free count", async () => {
    const { options } = stub(1, [[rel("0.0.1", true), rel("0.0.2", true), rel("0.0.3", true)]]);
    expect((await profileAccount("0.0.10622718", options)).freeAutoAssociationSlots).toBe(0);
  });

  it("unlimited stays unlimited AND costs no extra request", async () => {
    const { options, paths } = stub(UNLIMITED_AUTO_SLOTS, [[rel("0.0.1", true)]]);
    const profile = await profileAccount("0.0.10622718", options);
    expect(profile.freeAutoAssociationSlots).toBe(UNLIMITED_AUTO_SLOTS);
    expect(paths.some(p => p.includes("/tokens"))).toBe(false);
  });

  it("a zero ceiling costs no extra request either", async () => {
    const { options, paths } = stub(0, [[]]);
    const profile = await profileAccount("0.0.10622718", options);
    expect(profile.freeAutoAssociationSlots).toBe(0);
    expect(paths.some(p => p.includes("/tokens"))).toBe(false);
  });

  it("an unknown count resolves to zero free, never to the ceiling", async () => {
    // Guessing high costs a failed transfer; guessing low costs an
    // association that may not have been needed. Only one is recoverable.
    const failing = {
      fetchImpl: (async (url: RequestInfo | URL) =>
        String(url).includes("/tokens")
          ? ({ ok: false, status: 500, json: async () => ({}) } as Response)
          : ({ ok: true, status: 200, json: async () => accountBody(5) } as Response)) as typeof fetch,
    };
    expect((await profileAccount("0.0.10622718", failing)).freeAutoAssociationSlots).toBe(0);
  });
});

describe("the free count is what reaches the decision", () => {
  it("a full account is never told to rely on an automatic slot", async () => {
    const { options } = stub(1, [[rel("0.0.1183558", true)]]);
    const profile = await profileAccount("0.0.10622718", options);

    const choice = selectStrategy({
      alreadyAssociated: false,
      freeAutoSlots: profile.freeAutoAssociationSlots,
      recipientCanSign: true,
      recipientHasHbarForFees: true,
      senderControlsRecipient: false,
      preferSingleApproval: true,
      batchSupported: true,
    });

    expect(choice.strategy).not.toBe("auto-slot");
  });

  it("passing the ceiling instead is what used to break it", async () => {
    const { options } = stub(1, [[rel("0.0.1183558", true)]]);
    const profile = await profileAccount("0.0.10622718", options);

    const context = {
      alreadyAssociated: false,
      recipientCanSign: true,
      recipientHasHbarForFees: true,
      senderControlsRecipient: false,
      preferSingleApproval: true,
      batchSupported: true,
    };

    // The old wiring, kept as an executable record of the bug.
    expect(selectStrategy({ ...context, freeAutoSlots: profile.autoAssociationSlots }).strategy).toBe("auto-slot");
    // The fixed wiring.
    expect(selectStrategy({ ...context, freeAutoSlots: profile.freeAutoAssociationSlots }).strategy).not.toBe(
      "auto-slot",
    );
  });
});
