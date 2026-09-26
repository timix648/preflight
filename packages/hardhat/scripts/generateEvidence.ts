/**
 * Signed testnet evidence through Preflight's actual native SDK adapter.
 * `yarn hardhat:evidence`: local keystore prompt; about 30-40 test HBAR required.
 * Fixtures use the operator's key, 3 HBAR each, and a new two-decimal token.
 * A successful run records verified transactions in evidence/latest-native.json.
 * Incomplete runs retain their public transaction IDs but never replace latest.
 */
import * as dotenv from "dotenv";
import assert from "node:assert/strict";
import { Wallet } from "ethers";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import password from "@inquirer/password";
import {
  AccountCreateTransaction,
  Client,
  Hbar,
  PrivateKey,
  TokenCreateTransaction,
  Transaction,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import { ensureAssociated, type StrategyContext } from "../../nextjs/lib/onboarding/association";
import { createHieroAssociationExecutor } from "../../nextjs/lib/onboarding/sdk-executor";
import { getAccount, getPendingAirdrops, getTokenRelationship } from "../../nextjs/lib/onboarding/mirror";
import { ROOT, indexed, mirror, newReport, evidenceError } from "./evidenceSupport";
import { browserEvidenceSigner } from "./browserEvidenceSigner";
import { generateEvmEvidence } from "./generateEvmEvidence";
import { sweepFixtureFunding, refundEvidenceWallet } from "./evidenceRecovery";
import { resumeEvidence } from "./resumeEvidence";

dotenv.config();
const context: StrategyContext = {
  alreadyAssociated: false,
  freeAutoSlots: 0,
  recipientCanSign: true,
  recipientHasHbarForFees: true,
  senderControlsRecipient: false,
  preferSingleApproval: false,
  batchSupported: true,
};

function failureDetails(error: any): { status: string; id: string; phase: "precheck" | "consensus" } {
  for (let e = error, depth = 0; e && depth < 8; e = e.cause, depth++) {
    if (e.transactionId && e.status)
      return {
        id: String(e.transactionId),
        status: String(e.status),
        phase: e.constructor?.name === "PrecheckStatusError" ? "precheck" : "consensus",
      };
  }
  throw new Error("Failure has no consensus transaction ID; it cannot be used as chain evidence.");
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(
      "yarn hardhat:evidence: native adapter paths; add --browser for wallet-funded native + EVM evidence with an encrypted recovery signer, or --evm with the local keystore. Requires about 40 test HBAR. --browser --refund retries cleanup only. Enter recovery passwords locally; never in chat.",
    );
    return;
  }
  const browserMode = process.argv.includes("--browser");
  if (process.argv.includes("--resume")) {
    assert.ok(browserMode && !process.argv.includes("--refund"), "Use --browser --resume by itself");
    return resumeEvidence();
  }
  const refundOnly = process.argv.includes("--refund");
  if (refundOnly && !browserMode)
    throw new Error("Refund mode requires --browser and its existing encrypted recovery signer.");
  const browser = browserMode ? await browserEvidenceSigner() : null;
  const wallet =
    browser?.wallet ??
    (await (async () => {
      const encrypted = process.env.DEPLOYER_PRIVATE_KEY_ENCRYPTED;
      if (!encrypted) throw new Error("Use --browser or import a funded testnet ECDSA signer first.");
      const pass = await password({
        message: "Unlock the local testnet keystore (never share this password in chat):",
      });
      return Wallet.fromEncryptedJson(encrypted, pass);
    })());
  const key = PrivateKey.fromStringECDSA(wallet.privateKey);
  const account = await indexed(
    () => mirror(`/accounts/${wallet.address}`),
    a => (refundOnly ? !!a.account : Number(a.balance?.balance) >= 35e8),
  );
  const operator = String(account.account);
  if (!refundOnly)
    assert.ok(
      Number(account.balance?.balance) >= 35e8,
      "Fund the testnet signer with at least 40 HBAR before this run.",
    );
  console.log(`Testnet only. Operator ${operator}; native fixture funding is 3 HBAR per account.`);
  const evidence = newReport("native");
  evidence.report.operator = operator;
  evidence.report.walletAddress = wallet.address;
  const client = Client.forTestnet().setOperator(operator, key);
  // Preserve the SDK's per-transaction defaults (TokenCreate uses 30 HBAR).
  // A global 5-HBAR override previously made token creation fail on testnet.
  const signed: { id: string; type: string }[] = [];
  const executor = createHieroAssociationExecutor({
    client,
    batch: { supported: true, key: key.publicKey },
    sign: async (tx, request) => {
      // All fixtures deliberately share this key. Production integrations must
      // route each requested account and batch key to its actual signer.
      for (const id of request.accounts) assert.ok(id === operator || evidence.report.fixtures?.includes(id));
      signed.push({ id: String(tx.transactionId), type: tx.constructor.name });
      return tx.sign(key);
    },
  });
  const submit = async (label: string, tx: Transaction) => {
    const response = await tx.execute(client);
    evidence.report.submissions ??= [];
    evidence.report.submissions.push({ label, transactionId: response.transactionId.toString() });
    evidence.save();
    const receipt = await response.getReceipt(client);
    await evidence.transaction(label, response.transactionId.toString());
    return receipt;
  };
  const expectedFailure = async (label: string, wanted: string, run: () => Promise<unknown>) => {
    let caught: unknown;
    try {
      await run();
    } catch (error) {
      caught = error;
    }
    assert.ok(caught, `${label}: expected ${wanted}, but the transaction succeeded`);
    const failed = failureDetails(caught);
    assert.equal(failed.phase, "consensus", "Expected failures must reach consensus to count as live evidence");
    assert.equal(failed.status, wanted, label);
    return evidence.transaction(label, failed.id, wanted);
  };
  try {
    if (refundOnly) {
      const priorFixtures = readdirSync(path.join(ROOT, "evidence/runs"))
        .filter(name => name.endsWith("-native.json"))
        .map(name => JSON.parse(readFileSync(path.join(ROOT, "evidence/runs", name), "utf8")))
        .filter(report => report.walletAddress === wallet.address && report.network === "testnet")
        .flatMap(report => report.fixtures ?? []);
      evidence.report.fixtures = [...new Set(priorFixtures)];
      return; // Finally performs cleanup only; never creates new fixtures.
    }
    const token = await submit(
      "Create isolated two-decimal evidence token",
      await new TokenCreateTransaction()
        .setTokenName("Preflight Adapter Evidence")
        .setTokenSymbol("PFE")
        .setDecimals(2)
        .setInitialSupply(100_000)
        .setTreasuryAccountId(operator)
        .setAdminKey(key.publicKey)
        .freezeWith(client)
        .sign(key),
    );
    assert.ok(token.tokenId);
    const tokenId = token.tokenId.toString();
    evidence.report.token = { id: tokenId, symbol: "PFE", decimals: 2 };
    evidence.report.fixtures = [];
    const makeAccount = async (label: string, slots = 0) => {
      // Completed fixtures no longer need their initial fee float. Recycle it
      // before allocating the next fixture instead of stranding the run's budget.
      await sweepFixtureFunding(client, key, operator, evidence);
      const receipt = await submit(
        `Create ${label} fixture`,
        new AccountCreateTransaction()
          .setKeyWithoutAlias(key.publicKey)
          .setInitialBalance(new Hbar(3))
          .setMaxAutomaticTokenAssociations(slots),
      );
      assert.ok(receipt.accountId);
      const id = receipt.accountId.toString();
      evidence.report.fixtures.push(id);
      evidence.save();
      return id;
    };
    const transfer = (recipient: string, amount = 100) =>
      new TransferTransaction()
        .addTokenTransfer(tokenId, operator, -amount)
        .addTokenTransfer(tokenId, recipient, amount);
    const ensure = (recipient: string, overrides: Partial<StrategyContext> = {}, amount = 100n) =>
      ensureAssociated({
        accountId: recipient,
        tokenId,
        senderId: operator,
        amount,
        context: { ...context, ...overrides },
        executor,
      });
    const related = (recipient: string) =>
      indexed(
        () => getTokenRelationship(recipient, tokenId),
        r => r !== null,
      );
    const received = (row: any, recipient: string, amount = 100) =>
      evidence.check(
        `${row.label}: exact token delivery`,
        row.tokenTransfers.some((t: any) => t.token_id === tokenId && t.account === recipient && t.amount === amount),
      );

    const explicit = await makeAccount("explicit association");
    evidence.report.headlineRecipient = explicit;
    const before = await expectedFailure(
      "Before: unassociated transfer",
      "TOKEN_NOT_ASSOCIATED_TO_ACCOUNT",
      async () => {
        const response = await transfer(explicit).execute(client);
        await response.getReceipt(client);
      },
    );
    evidence.check("Failed transfer moved no tokens", before.tokenTransfers.length === 0);
    const associated = await ensure(explicit);
    evidence.check(
      "Decision selects explicit association",
      associated.strategyUsed === "explicit" && associated.associated,
    );
    const act = await evidence.transaction("Native adapter: explicit association", associated.transactionId!);
    evidence.check("Recipient pays explicit association", act.payer === explicit);
    const afterResponse = await transfer(explicit).execute(client);
    await afterResponse.getReceipt(client);
    const after = await evidence.transaction("After: identical transfer", afterResponse.transactionId.toString());
    received(after, explicit);
    evidence.report.headline = { before, act, after };

    const existing = await makeAccount("existing finite auto-slot", 1);
    const signCount = signed.length;
    const ready = await ensure(existing, { freeAutoSlots: 1 });
    evidence.check(
      "Existing slot requires no transaction or signing",
      !ready.transactionId && !ready.associated && ready.readyToReceive && signed.length === signCount,
    );
    const existingTx = await transfer(existing).execute(client);
    await existingTx.getReceipt(client);
    received(await evidence.transaction("Existing auto-slot: delivery", existingTx.transactionId.toString()), existing);
    evidence.check("Arrival created an automatic relationship", (await related(existing))?.automaticAssociation);

    const raised = await makeAccount("raise auto-slot limit");
    const raisedState = await ensure(raised, { senderControlsRecipient: true });
    evidence.check(
      "Adapter raises slots without falsely reporting association",
      raisedState.strategyUsed === "auto-slot" && !raisedState.associated && raisedState.readyToReceive,
    );
    await evidence.transaction("Native adapter: raise automatic slots", raisedState.transactionId!);
    const updated = await indexed(
      () => getAccount(raised),
      a => a.maxAutomaticTokenAssociations === -1,
    );
    evidence.check("Account now accepts unlimited slots", updated.maxAutomaticTokenAssociations === -1);
    const raisedTx = await transfer(raised).execute(client);
    await raisedTx.getReceipt(client);
    received(await evidence.transaction("Raised auto-slot: delivery", raisedTx.transactionId.toString()), raised);
    evidence.check("Raised-slot delivery associated automatically", (await related(raised))?.automaticAssociation);

    const claimer = await makeAccount("pending airdrop and claim");
    const pending = await ensure(claimer, { recipientCanSign: false, recipientHasHbarForFees: false });
    await evidence.transaction("Native adapter: pending airdrop", pending.transactionId!);
    evidence.check(
      "Pending airdrop is not reported as associated",
      pending.strategyUsed === "airdrop" && !pending.associated && !pending.readyToReceive,
    );
    const pendingRows = await indexed(
      () => getPendingAirdrops(claimer),
      rows => rows.some(r => r.tokenId === tokenId && r.senderId === operator),
    );
    evidence.check(
      "Pending amount indexed by mirror",
      pendingRows.some(r => r.tokenId === tokenId && r.amount === 100n),
    );
    const pendingRequest = { senderId: operator, accountId: claimer, tokenId };
    const claim = await executor.claim(pendingRequest);
    received(await evidence.transaction("Native adapter: claim pending airdrop", claim.transactionId), claimer);
    const reject = await executor.reject({ accountId: claimer, tokenId });
    received(await evidence.transaction("Native adapter: reject held token", reject.transactionId), operator);

    const canceller = await makeAccount("pending airdrop cancellation");
    const cancelRequest = { senderId: operator, accountId: canceller, tokenId };
    const toCancel = await executor.execute({ ...cancelRequest, strategy: "airdrop", amount: 100n });
    await evidence.transaction("Native adapter: airdrop before cancellation", toCancel.transactionId);
    evidence.check("Cancellation fixture is pending", toCancel.pending);
    const cancel = await executor.cancel(cancelRequest);
    await evidence.transaction("Native adapter: cancel pending airdrop", cancel.transactionId);
    const cancelled = await indexed(
      () => getPendingAirdrops(canceller),
      rows => !rows.some(r => r.tokenId === tokenId),
    );
    evidence.check("Cancelled pending entry disappears", !cancelled.some(r => r.tokenId === tokenId));

    // Directly exercise the adapter's immediate-delivery record interpretation too.
    const delivered = await executor.execute({
      strategy: "airdrop",
      senderId: operator,
      accountId: existing,
      tokenId,
      amount: 100n,
    });
    evidence.check("Immediate airdrop is not reported pending", delivered.pending === false);
    received(
      await evidence.transaction("Native adapter: immediate airdrop delivery", delivered.transactionId),
      existing,
    );

    const batchRecipient = await makeAccount("atomic batch");
    const firstBatchSignature = signed.length;
    const batch = await ensure(batchRecipient, { preferSingleApproval: true });
    evidence.check("Decision selects native batch", batch.strategyUsed === "batch" && batch.associated);
    const outer = await evidence.transaction("Native adapter: atomic batch", batch.transactionId!);
    for (const inner of signed.slice(firstBatchSignature).filter(s => s.type !== "BatchTransaction")) {
      const row = await evidence.transaction(`Batch child: ${inner.type}`, inner.id);
      evidence.check(
        `${inner.type} belongs to the outer batch`,
        row.parentConsensusTimestamp === outer.consensusTimestamp,
      );
      if (inner.type === "TransferTransaction") received(row, batchRecipient);
    }
    evidence.check(
      "Batch created an explicit relationship",
      (await related(batchRecipient))?.automaticAssociation === false,
    );

    const rollback = await makeAccount("atomic rollback");
    await expectedFailure("Native adapter: intentionally failing atomic batch", "INNER_TRANSACTION_FAILED", () =>
      ensure(rollback, { preferSingleApproval: true }, 1_000_000n),
    );
    // The consensus failure is already indexed. A rolled-back association must not persist.
    evidence.check("Failed batch left no token relationship", (await getTokenRelationship(rollback, tokenId)) === null);
    evidence.finish();
    if (browserMode || process.argv.includes("--evm"))
      await generateEvmEvidence(wallet.privateKey, operator, evidence.report.startedAt);
  } catch (error) {
    evidence.report.error = evidenceError(error);
    try {
      const failed = failureDetails(error);
      evidence.report.failedTransaction = failed;
      evidence.save();
      if (failed.phase === "consensus")
        await evidence.transaction("Run stopped: consensus failure", failed.id, failed.status);
    } catch {
      /* Preserve the original error even when its mirror lookup fails. */
    }
    evidence.save();
    throw error;
  } finally {
    if (browser) {
      try {
        await sweepFixtureFunding(client, key, operator, evidence);
        await refundEvidenceWallet(wallet, browser.refundAddress, evidence);
      } catch (error) {
        evidence.report.cleanupError = evidenceError(error);
        console.error(
          "Cleanup failed. The encrypted key is retained; retry --browser --refund without sending more funding.",
        );
        process.exitCode = 1;
      }
      if (evidence.report.complete) evidence.finish();
    }
    evidence.save();
    client.close();
  }
}
main().catch(error => {
  console.error(evidenceError(error));
  process.exitCode = 1;
});
