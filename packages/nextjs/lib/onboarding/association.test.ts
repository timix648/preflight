/**
 * The decision tree is the product, so it carries the heaviest tests in this
 * repository. Each one is named after the guarantee it protects.
 *
 * The invariants at the bottom matter more than the individual branches: they
 * hold for EVERY possible context, including combinations nobody thought to
 * write a case for.
 */
import {
  type StrategyContext,
  UNLIMITED_AUTO_SLOTS,
  describeStrategy,
  hashscanUrl,
  selectStrategy,
} from "./association";
import { describe, expect, it } from "vitest";

/** A recipient in the hardest situation: cannot sign, cannot pay, no slots. */
const BASE: StrategyContext = {
  alreadyAssociated: false,
  freeAutoSlots: 0,
  recipientCanSign: false,
  recipientHasHbarForFees: false,
  senderControlsRecipient: false,
  preferSingleApproval: false,
  batchSupported: true,
};

const ctx = (overrides: Partial<StrategyContext> = {}): StrategyContext => ({
  ...BASE,
  ...overrides,
});

describe("doing nothing is always the first choice", () => {
  it("never_pays_to_associate_something_already_associated", () => {
    const result = selectStrategy(ctx({ alreadyAssociated: true }));
    expect(result.strategy).toBe("none");
    expect(result.paidBy).toBe("nobody");
    expect(result.recipientApprovals).toBe(0);
  });

  it("prefers doing nothing even when every other path is available", () => {
    const result = selectStrategy(
      ctx({
        alreadyAssociated: true,
        freeAutoSlots: UNLIMITED_AUTO_SLOTS,
        recipientCanSign: true,
        recipientHasHbarForFees: true,
      }),
    );
    expect(result.strategy).toBe("none");
  });
});

describe("a free automatic slot costs the user nothing", () => {
  it("unlimited_slots_require_no_approval", () => {
    const result = selectStrategy(ctx({ freeAutoSlots: UNLIMITED_AUTO_SLOTS }));
    expect(result.strategy).toBe("auto-slot");
    expect(result.recipientApprovals).toBe(0);
    expect(result.reason).toContain("unlimited");
  });

  it("uses an existing finite slot without asking for a signature", () => {
    const result = selectStrategy(ctx({ freeAutoSlots: 3 }));
    expect(result.strategy).toBe("auto-slot");
    expect(result.recipientApprovals).toBe(0);
    expect(result.reason).toContain("3 free");
  });

  it("gets the singular right for one slot, because the UI renders this", () => {
    expect(selectStrategy(ctx({ freeAutoSlots: 1 })).reason).toContain("1 free automatic association slot (HIP-23)");
    expect(selectStrategy(ctx({ freeAutoSlots: 2 })).reason).toContain("2 free automatic association slots (HIP-23)");
  });

  it("treats zero slots as no slots, not as falsy-unlimited", () => {
    // 0 and -1 are both "not a positive number". Conflating them would send
    // every slotless account down the free path and fail on transfer.
    const result = selectStrategy(ctx({ freeAutoSlots: 0, recipientCanSign: true, recipientHasHbarForFees: true }));
    expect(result.strategy).not.toBe("auto-slot");
  });
});

describe("when the sender controls the recipient, fix it permanently", () => {
  it("raises the slot limit once instead of associating per token", () => {
    const result = selectStrategy(ctx({ senderControlsRecipient: true, recipientCanSign: true }));
    expect(result.strategy).toBe("auto-slot");
    expect(result.recipientApprovals).toBe(1);
    expect(result.reason).toContain("Every future token");
  });

  it("does not take that path when the account cannot sign anyway", () => {
    const result = selectStrategy(ctx({ senderControlsRecipient: true, recipientCanSign: false }));
    expect(result.strategy).toBe("airdrop");
  });
});

describe("batching collapses two approvals into one", () => {
  it("batches when the recipient can pay and wants one click", () => {
    const result = selectStrategy(
      ctx({
        recipientCanSign: true,
        recipientHasHbarForFees: true,
        preferSingleApproval: true,
      }),
    );
    expect(result.strategy).toBe("batch");
    expect(result.recipientApprovals).toBe(1);
  });

  it("never_batches_when_the_sdk_cannot", () => {
    // If HIP-551 is unavailable, promising atomicity would be a lie that only
    // surfaces at execution time.
    const result = selectStrategy(
      ctx({
        recipientCanSign: true,
        recipientHasHbarForFees: true,
        preferSingleApproval: true,
        batchSupported: false,
      }),
    );
    expect(result.strategy).toBe("explicit");
  });

  it("falls back to explicit when a single approval was not requested", () => {
    const result = selectStrategy(ctx({ recipientCanSign: true, recipientHasHbarForFees: true }));
    expect(result.strategy).toBe("explicit");
    expect(result.recipientApprovals).toBe(2);
  });
});

describe("the airdrop path is the answer when the recipient cannot act", () => {
  it("sender_pays_when_recipient_cannot_sign", () => {
    const result = selectStrategy(ctx({ recipientCanSign: false }));
    expect(result.strategy).toBe("airdrop");
    expect(result.paidBy).toBe("sender");
    expect(result.recipientApprovals).toBe(0);
  });

  it("sender_pays_when_recipient_has_no_hbar", () => {
    // The case that traps people: the recipient CAN sign, so every
    // signature-based path looks available, but it cannot pay the fee.
    const result = selectStrategy(ctx({ recipientCanSign: true, recipientHasHbarForFees: false }));
    expect(result.strategy).toBe("airdrop");
    expect(result.paidBy).toBe("sender");
    expect(result.reason).toContain("no HBAR");
  });

  it("gives a different explanation for each of those two reasons", () => {
    const cannotSign = selectStrategy(ctx({ recipientCanSign: false })).reason;
    const cannotPay = selectStrategy(ctx({ recipientCanSign: true, recipientHasHbarForFees: false })).reason;
    expect(cannotSign).not.toBe(cannotPay);
    expect(cannotSign).toContain("cannot be asked to sign");
  });
});

describe("invariants that must hold for every possible context", () => {
  /** All 64 combinations of the six booleans, across three slot values. */
  const everyContext = (): StrategyContext[] => {
    const out: StrategyContext[] = [];
    for (const alreadyAssociated of [true, false]) {
      for (const freeAutoSlots of [UNLIMITED_AUTO_SLOTS, 0, 5]) {
        for (const recipientCanSign of [true, false]) {
          for (const recipientHasHbarForFees of [true, false]) {
            for (const senderControlsRecipient of [true, false]) {
              for (const preferSingleApproval of [true, false]) {
                for (const batchSupported of [true, false]) {
                  out.push({
                    alreadyAssociated,
                    freeAutoSlots,
                    recipientCanSign,
                    recipientHasHbarForFees,
                    senderControlsRecipient,
                    preferSingleApproval,
                    batchSupported,
                  });
                }
              }
            }
          }
        }
      }
    }
    return out;
  };

  it("always_returns_a_human_reason", () => {
    // AssociationState.reason is non-optional precisely so the UI can render
    // it unconditionally. An empty one would surface as a blank panel.
    for (const context of everyContext()) {
      const result = selectStrategy(context);
      expect(result.reason.length).toBeGreaterThan(20);
      expect(result.reason.trim()).toBe(result.reason);
    }
  });

  it("always_picks_a_strategy_and_never_throws", () => {
    for (const context of everyContext()) {
      const result = selectStrategy(context);
      expect(["none", "explicit", "auto-slot", "airdrop", "batch"]).toContain(result.strategy);
    }
  });

  it("never_requires_a_signature_the_recipient_cannot_give", () => {
    // The load-bearing invariant. Choosing explicit or batch for an account
    // that cannot sign produces a transaction that can never be completed.
    for (const context of everyContext()) {
      if (context.recipientCanSign) continue;
      const result = selectStrategy(context);
      expect(result.recipientApprovals).toBe(0);
      expect(["explicit", "batch"]).not.toContain(result.strategy);
    }
  });

  it("never_charges_a_recipient_that_cannot_pay", () => {
    for (const context of everyContext()) {
      if (context.alreadyAssociated) continue;
      const hasSlot = context.freeAutoSlots === UNLIMITED_AUTO_SLOTS || context.freeAutoSlots > 0;
      // A free slot is already paid for; only new spending is in question.
      if (hasSlot || context.recipientHasHbarForFees) continue;
      const result = selectStrategy(context);
      if (result.strategy !== "auto-slot") {
        expect(result.paidBy).toBe("sender");
      }
    }
  });

  it("never_batches_when_batching_is_unsupported", () => {
    for (const context of everyContext()) {
      if (context.batchSupported) continue;
      expect(selectStrategy(context).strategy).not.toBe("batch");
    }
  });

  it("never_offers_the_chosen_strategy_as_its_own_alternative", () => {
    for (const context of everyContext()) {
      const result = selectStrategy(context);
      expect(result.alternatives).not.toContain(result.strategy);
    }
  });

  it("always_leaves_airdrop_available_when_work_is_needed", () => {
    // The airdrop path needs nothing from the recipient, so it is always a
    // viable fallback. If it ever disappears, some account becomes unreachable.
    for (const context of everyContext()) {
      if (context.alreadyAssociated) continue;
      const result = selectStrategy(context);
      const viable = [result.strategy, ...result.alternatives];
      expect(viable).toContain("airdrop");
    }
  });
});

describe("evidence links", () => {
  it("builds a testnet HashScan URL and encodes the id", () => {
    const url = hashscanUrl("0.0.1234@1695000000.000000000");
    expect(url).toContain("hashscan.io/testnet/transaction/");
    expect(url).not.toContain("@"); // encoded, so the link is not broken
  });

  it("can target mainnet explicitly, but never does so by default", () => {
    expect(hashscanUrl("0.0.1")).toContain("/testnet/");
    expect(hashscanUrl("0.0.1", "mainnet")).toContain("/mainnet/");
  });
});

describe("every strategy can describe itself for the comparison table", () => {
  it("covers all four mechanisms with no gaps", () => {
    for (const strategy of ["explicit", "auto-slot", "airdrop", "batch"] as const) {
      const described = describeStrategy(strategy);
      expect(described.name).toBeTruthy();
      expect(described.mechanism).toBeTruthy();
      expect(described.useWhen.length).toBeGreaterThan(20);
    }
  });
});
