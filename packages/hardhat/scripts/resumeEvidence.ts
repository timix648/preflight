/** Continue the verified native checkpoint without recreating the token or requesting funding. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { AccountCreateTransaction, Client, Hbar, PrivateKey } from "@hiero-ledger/sdk";
import { ensureAssociated } from "../../nextjs/lib/onboarding/association";
import { createHieroAssociationExecutor } from "../../nextjs/lib/onboarding/sdk-executor";
import { getTokenRelationship } from "../../nextjs/lib/onboarding/mirror";
import { browserEvidenceSigner } from "./browserEvidenceSigner";
import { ROOT, newReport, evidenceError } from "./evidenceSupport";
import { sweepFixtureFunding, refundEvidenceWallet } from "./evidenceRecovery";
import { generateEvmEvidence } from "./generateEvmEvidence";

export async function resumeEvidence() {
  const browser = await browserEvidenceSigner(); // --resume only unlocks an existing funded recovery signer.
  const previous = readdirSync(path.join(ROOT, "evidence/runs"))
    .filter(name => name.endsWith("-native.json"))
    .map(name => JSON.parse(readFileSync(path.join(ROOT, "evidence/runs", name), "utf8")))
    .filter(report => report.walletAddress === browser.wallet.address)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  assert.ok(previous && previous.complete === false, "No interrupted native run to resume");
  assert.match(previous.error ?? "", /failed precheck with status INSUFFICIENT_PAYER_BALANCE/);
  assert.equal(previous.failedTransaction?.status, "INSUFFICIENT_PAYER_BALANCE");
  assert.equal(previous.fixtures?.length, 6, "Resume is restricted to the checkpoint before the rollback fixture");
  assert.ok(previous.assertions.some((a: any) => a.name === "Batch created an explicit relationship" && a.passed));
  assert.ok(previous.assertions.every((a: any) => a.passed));
  assert.equal(previous.refundHash, undefined, "Check a previously submitted refund before resuming");
  const evidence = newReport("native");
  const startedAt = evidence.report.startedAt;
  assert.deepEqual(previous.sourceFiles, evidence.report.sourceFiles, "Core changed since the native checkpoint");
  Object.assign(evidence.report, previous, {
    startedAt,
    resumedFrom: previous.startedAt,
    complete: false,
    transactions: previous.transactions.filter((t: any) => t.verified),
    interruptedPrecheck: previous.failedTransaction,
    error: undefined,
    failedTransaction: undefined,
    cleanupError: undefined,
    cleanup: [],
  });
  evidence.save();
  const operator = String(previous.operator);
  const tokenId = String(previous.token.id);
  const key = PrivateKey.fromStringECDSA(browser.wallet.privateKey);
  const client = Client.forTestnet().setOperator(operator, key);
  try {
    await sweepFixtureFunding(client, key, operator, evidence);
    const creation = await new AccountCreateTransaction()
      .setKeyWithoutAlias(key.publicKey)
      .setInitialBalance(new Hbar(3))
      .setMaxAutomaticTokenAssociations(0)
      .execute(client);
    evidence.report.rollbackCreationId = creation.transactionId.toString();
    evidence.save();
    const receipt = await creation.getReceipt(client);
    assert.ok(receipt.accountId);
    const rollback = receipt.accountId.toString();
    evidence.report.fixtures.push(rollback);
    evidence.save();
    await evidence.transaction("Create atomic rollback fixture", creation.transactionId.toString());
    const executor = createHieroAssociationExecutor({
      client,
      batch: { supported: true, key: key.publicKey },
      sign: async (tx, request) => {
        for (const account of request.accounts) assert.ok(account === operator || account === rollback);
        return tx.sign(key);
      },
    });
    let failure: any;
    try {
      await ensureAssociated({
        accountId: rollback,
        tokenId,
        senderId: operator,
        amount: 1_000_000n,
        context: {
          alreadyAssociated: false,
          freeAutoSlots: 0,
          recipientCanSign: true,
          recipientHasHbarForFees: true,
          senderControlsRecipient: false,
          preferSingleApproval: true,
          batchSupported: true,
        },
        executor,
      });
    } catch (error) {
      failure = error;
    }
    let found = false;
    for (let error = failure, depth = 0; error && depth < 8; error = error.cause, depth++) {
      if (error.transactionId && String(error.status) === "INNER_TRANSACTION_FAILED") {
        await evidence.transaction(
          "Native adapter: intentionally failing atomic batch",
          String(error.transactionId),
          "INNER_TRANSACTION_FAILED",
        );
        found = true;
        break;
      }
    }
    assert.ok(found, "Expected an indexed INNER_TRANSACTION_FAILED rollback receipt");
    evidence.check("Failed batch left no token relationship", (await getTokenRelationship(rollback, tokenId)) === null);
    evidence.finish();
    await generateEvmEvidence(browser.wallet.privateKey, operator, evidence.report.startedAt);
  } catch (error) {
    evidence.report.error = evidenceError(error);
    evidence.save();
    throw error;
  } finally {
    try {
      await sweepFixtureFunding(client, key, operator, evidence);
      await refundEvidenceWallet(browser.wallet, browser.refundAddress, evidence);
    } catch (error) {
      evidence.report.cleanupError = evidenceError(error);
      process.exitCode = 1;
    }
    evidence.save();
    if (evidence.report.complete) evidence.finish();
    client.close();
  }
}
