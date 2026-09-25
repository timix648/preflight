import { type AssociationExecutor, type StrategyContext, ensureAssociated } from "./association";
import { describe, expect, it, vi } from "vitest";

const context: StrategyContext = {
  alreadyAssociated: false,
  freeAutoSlots: 0,
  recipientCanSign: true,
  recipientHasHbarForFees: true,
  senderControlsRecipient: false,
  preferSingleApproval: true,
  batchSupported: true,
};
const params = { accountId: "0.0.123", tokenId: "0.0.456", senderId: "0.0.789", amount: 10n, context };
const executor = (status = "SUCCESS", pending = false): AssociationExecutor => ({
  supportsBatch: () => true,
  execute: vi.fn(async () => ({ status, pending, transactionId: "0.0.123@1.2" })),
});

describe("ensureAssociated execution guarantees", () => {
  it("actually calls the executor with the selected native batch", async () => {
    const adapter = executor();
    const result = await ensureAssociated({ ...params, executor: adapter });
    expect(adapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: "batch", amount: 10n, senderId: "0.0.789" }),
    );
    expect(result).toMatchObject({ associated: true, readyToReceive: true, strategyUsed: "batch" });
  });
  it("does not override the caller's network capability", async () => {
    const result = await ensureAssociated({
      ...params,
      context: { ...context, batchSupported: false },
      executor: executor(),
    });
    expect(result.strategyUsed).toBe("explicit");
  });
  it("rejects a forced batch on an unsupported network before submitting", async () => {
    const adapter = executor();
    await expect(
      ensureAssociated({
        ...params,
        strategy: "batch",
        context: { ...context, batchSupported: false },
        executor: adapter,
      }),
    ).rejects.toThrow();
    expect(adapter.execute).not.toHaveBeenCalled();
  });
  it("does not turn a failed receipt into an association", async () => {
    await expect(
      ensureAssociated({ ...params, executor: executor("INSUFFICIENT_PAYER_BALANCE") }),
    ).rejects.toMatchObject({
      explanation: { code: "INSUFFICIENT_PAYER_BALANCE" },
    });
  });
  it("does not claim a pending airdrop is delivered", async () => {
    expect(
      await ensureAssociated({ ...params, strategy: "airdrop", executor: executor("SUCCESS", true) }),
    ).toMatchObject({ associated: false, readyToReceive: false });
  });
  it("does not pay to raise an account's existing slots or claim a relationship exists", async () => {
    const adapter = executor();
    expect(
      await ensureAssociated({ ...params, context: { ...context, freeAutoSlots: 1 }, executor: adapter }),
    ).toMatchObject({ associated: false, readyToReceive: true, strategyUsed: "auto-slot" });
    expect(adapter.execute).not.toHaveBeenCalled();
  });
  it("raising slots is readiness, not an existing association", async () => {
    expect(
      await ensureAssociated({
        ...params,
        context: { ...context, senderControlsRecipient: true },
        executor: executor(),
      }),
    ).toMatchObject({ associated: false, readyToReceive: true, strategyUsed: "auto-slot" });
  });
  it("an already-associated inner batch failure must not hide an undelivered transfer", async () => {
    await expect(
      ensureAssociated({ ...params, executor: executor("TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT") }),
    ).rejects.toThrow();
    expect(
      await ensureAssociated({
        ...params,
        strategy: "explicit",
        executor: executor("TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT"),
      }),
    ).toMatchObject({ associated: true });
  });
});
