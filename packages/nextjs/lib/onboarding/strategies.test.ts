/**
 * The guarantee these tests protect: the four-candidate view and the kit's
 * actual choice can never disagree.
 *
 * /diagnose shows a developer all four mechanisms and marks one as chosen. If
 * that mark ever drifts from what execute() would really do, the page becomes
 * confidently wrong — which is worse than showing nothing, because a developer
 * would act on it.
 */
import { type StrategyContext, evaluateStrategies, selectStrategy } from "./association";
import { describe, expect, it } from "vitest";

/** A recipient that can do everything. Override one field per case. */
const capable: StrategyContext = {
  alreadyAssociated: false,
  freeAutoSlots: 0,
  recipientCanSign: true,
  recipientHasHbarForFees: true,
  senderControlsRecipient: false,
  preferSingleApproval: true,
  batchSupported: true,
};

/** Every meaningful combination of the five booleans that drive the tree. */
const situations: { name: string; context: StrategyContext }[] = [
  { name: "capable recipient, no slots", context: capable },
  { name: "unlimited slots", context: { ...capable, freeAutoSlots: -1 } },
  { name: "one free slot", context: { ...capable, freeAutoSlots: 1 } },
  { name: "cannot sign", context: { ...capable, recipientCanSign: false } },
  { name: "no hbar", context: { ...capable, recipientHasHbarForFees: false } },
  { name: "cannot sign and no hbar", context: { ...capable, recipientCanSign: false, recipientHasHbarForFees: false } },
  { name: "sender controls recipient", context: { ...capable, senderControlsRecipient: true } },
  { name: "no batch support", context: { ...capable, batchSupported: false } },
  { name: "prefers two approvals", context: { ...capable, preferSingleApproval: false } },
];

describe("the view never contradicts the decision", () => {
  it.each(situations)("marks_the_same_winner_as_selectStrategy — $name", ({ context }) => {
    const chosen = selectStrategy(context).strategy;
    const marked = evaluateStrategies(context).filter(e => e.verdict === "chosen");

    // "none" means already associated; no candidate should be marked then.
    if (chosen === "none") {
      expect(marked).toHaveLength(0);
      return;
    }
    expect(marked).toHaveLength(1);
    expect(marked[0].strategy).toBe(chosen);
  });
});

describe("all four are always shown", () => {
  it.each(situations)("never_hides_a_mechanism — $name", ({ context }) => {
    const evaluated = evaluateStrategies(context);
    expect(evaluated).toHaveLength(4);
    expect(new Set(evaluated.map(e => e.strategy))).toEqual(new Set(["explicit", "auto-slot", "airdrop", "batch"]));
  });

  it.each(situations)("every_candidate_explains_itself — $name", ({ context }) => {
    for (const evaluation of evaluateStrategies(context)) {
      // A rejected candidate with no reason is the failure mode this guards.
      expect(evaluation.reason.length).toBeGreaterThan(20);
    }
  });
});

describe("the airdrop is the floor", () => {
  it.each(situations)("is_never_unavailable — $name", ({ context }) => {
    // HIP-904 asks nothing of the recipient, so there is no situation in which
    // it cannot be used. If this ever fails, the decision tree has a hole.
    const airdrop = evaluateStrategies(context).find(e => e.strategy === "airdrop");
    expect(airdrop?.verdict).not.toBe("unavailable");
  });

  it("is_chosen_when_the_recipient_can_neither_sign_nor_pay", () => {
    const stranded = { ...capable, recipientCanSign: false, recipientHasHbarForFees: false };
    expect(selectStrategy(stranded).strategy).toBe("airdrop");
    const airdrop = evaluateStrategies(stranded).find(e => e.strategy === "airdrop");
    expect(airdrop?.verdict).toBe("chosen");
    expect(airdrop?.paidBy).toBe("sender");
  });
});

describe("verdicts match the situation", () => {
  it("batch_is_unavailable_when_the_sdk_lacks_it", () => {
    const evaluated = evaluateStrategies({ ...capable, batchSupported: false });
    const batch = evaluated.find(e => e.strategy === "batch");
    expect(batch?.verdict).toBe("unavailable");
    expect(batch?.reason).toContain("HIP-551");
  });

  it("explicit_is_unavailable_to_an_account_that_cannot_sign", () => {
    const evaluated = evaluateStrategies({ ...capable, recipientCanSign: false });
    expect(evaluated.find(e => e.strategy === "explicit")?.verdict).toBe("unavailable");
  });

  it("auto_slot_is_available_when_the_sender_can_raise_the_limit", () => {
    const evaluated = evaluateStrategies({ ...capable, senderControlsRecipient: true });
    const slot = evaluated.find(e => e.strategy === "auto-slot");
    expect(slot?.verdict).not.toBe("unavailable");
    expect(slot?.recipientApprovals).toBe(1);
  });

  it("unlimited_slots_cost_the_recipient_no_approval", () => {
    const evaluated = evaluateStrategies({ ...capable, freeAutoSlots: -1 });
    const slot = evaluated.find(e => e.strategy === "auto-slot");
    expect(slot?.verdict).toBe("chosen");
    expect(slot?.recipientApprovals).toBe(0);
  });

  it("carries_the_hip_that_introduced_each_mechanism", () => {
    const byName = Object.fromEntries(evaluateStrategies(capable).map(e => [e.strategy, e.hip]));
    expect(byName["auto-slot"]).toBe("HIP-23");
    expect(byName["airdrop"]).toBe("HIP-904");
    expect(byName["batch"]).toBe("HIP-551");
    // Explicit association predates the HIPs — it has always been there.
    expect(byName["explicit"]).toBeNull();
  });
});
