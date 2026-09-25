/**
 * Native Hiero adapter. Import directly: keeping the SDK out of index.ts avoids
 * putting it in the credential-free pages and the EVM wallet bundle.
 * Signers are supplied by the caller; this module never loads or stores keys.
 */
import type { AssociationExecutor, AssociationReceipt, AssociationRequest } from "./association";
import { explain } from "./status";
import { OnboardingError } from "./types";
import {
  AccountId,
  AccountUpdateTransaction,
  BatchTransaction,
  Client,
  PendingAirdropId,
  PublicKey,
  TokenAirdropTransaction,
  TokenAssociateTransaction,
  TokenCancelAirdropTransaction,
  TokenClaimAirdropTransaction,
  TokenId,
  TokenRejectTransaction,
  Transaction,
  TransactionId,
  TransferTransaction,
} from "@hiero-ledger/sdk";

export interface SigningRequest {
  /** These accounts must authorize the operation, including its payer. */
  accounts: readonly string[];
  /** The outer batch also needs the batch-key signature. */
  batchKey?: PublicKey;
}

export interface HieroExecutorOptions {
  client: Client;
  sign: (transaction: Transaction, request: SigningRequest) => Promise<Transaction>;
  /** Explicit opt-in for a network supporting native HIP-551 operations. */
  batch?: { supported: boolean; key: PublicKey };
}

export interface PendingAirdropRequest {
  senderId: string;
  accountId: string;
  tokenId: string;
}

/** Four mechanisms plus the claim, cancel and held-token rejection lifecycle. */
export function createHieroAssociationExecutor(options: HieroExecutorOptions): AssociationExecutor & {
  claim(request: PendingAirdropRequest): Promise<AssociationReceipt>;
  cancel(request: PendingAirdropRequest): Promise<AssociationReceipt>;
  reject(request: { accountId: string; tokenId: string }): Promise<AssociationReceipt>;
} {
  const { client, sign, batch } = options;
  const supportsBatch = () => batch?.supported === true;
  const prepare = async (transaction: Transaction, payer: string, signing: SigningRequest) => {
    transaction.setTransactionId(TransactionId.generate(payer)).freezeWith(client);
    return sign(transaction, signing);
  };
  const submit = async (transaction: Transaction, payer: string, signing: SigningRequest, airdrop = false) => {
    const signed = await prepare(transaction, payer, signing);
    const response = await signed.execute(client);
    const receipt = await response.getReceipt(client);
    if (receipt.status.toString() !== "SUCCESS") throw new Error(receipt.status.toString());
    // A receipt alone cannot distinguish immediate delivery from a pending
    // airdrop. Read the actual record, never infer delivery from cached slots.
    const pending = airdrop ? (await response.getRecord(client)).newPendingAirdrops.length > 0 : false;
    return { transactionId: response.transactionId.toString(), status: receipt.status.toString(), pending };
  };
  const guarded = async (action: () => Promise<AssociationReceipt>) => {
    try {
      return await action();
    } catch (cause) {
      if (cause instanceof OnboardingError) throw cause;
      throw new OnboardingError(explain(cause), cause);
    }
  };
  const pendingId = ({ senderId, accountId, tokenId }: PendingAirdropRequest) =>
    new PendingAirdropId({
      senderId: AccountId.fromString(senderId),
      receiverId: AccountId.fromString(accountId),
      tokenId: TokenId.fromString(tokenId),
    });

  return {
    supportsBatch,
    execute: request =>
      guarded(async () => {
        const { strategy, accountId, tokenId } = request;
        if (strategy === "explicit") {
          return submit(new TokenAssociateTransaction().setAccountId(accountId).setTokenIds([tokenId]), accountId, {
            accounts: [accountId],
          });
        }
        if (strategy === "auto-slot") {
          if (request.maxAutomaticTokenAssociations === undefined) throw new Error("INVALID_ASSOCIATION_REQUEST");
          return submit(
            new AccountUpdateTransaction()
              .setAccountId(accountId)
              .setMaxAutomaticTokenAssociations(request.maxAutomaticTokenAssociations),
            accountId,
            { accounts: [accountId] },
          );
        }
        const { amount, senderId } = transferDetails(request);
        if (strategy === "airdrop") {
          return submit(
            new TokenAirdropTransaction()
              .addTokenTransfer(tokenId, senderId, -amount)
              .addTokenTransfer(tokenId, accountId, amount),
            senderId,
            { accounts: [senderId] },
            true,
          );
        }
        if (!supportsBatch() || !batch) throw new Error("BATCH_UNAVAILABLE");
        // Both inner operations and the outer batch are paid by the recipient.
        // The transfer additionally needs the sender's authorization. Each inner
        // transaction has its own ID and signatures; no ContractExecute is used.
        const associate = await prepare(
          new TokenAssociateTransaction().setAccountId(accountId).setTokenIds([tokenId]).setBatchKey(batch.key),
          accountId,
          { accounts: [accountId] },
        );
        const transfer = await prepare(
          new TransferTransaction()
            .addTokenTransfer(tokenId, senderId, -amount)
            .addTokenTransfer(tokenId, accountId, amount)
            .setBatchKey(batch.key),
          accountId,
          {
            accounts: [accountId, senderId],
          },
        );
        return submit(new BatchTransaction().addInnerTransaction(associate).addInnerTransaction(transfer), accountId, {
          accounts: [accountId],
          batchKey: batch.key,
        });
      }),
    claim: request =>
      guarded(() =>
        submit(new TokenClaimAirdropTransaction().addPendingAirdropId(pendingId(request)), request.accountId, {
          accounts: [request.accountId],
        }),
      ),
    cancel: request =>
      guarded(() =>
        submit(new TokenCancelAirdropTransaction().addPendingAirdropId(pendingId(request)), request.senderId, {
          accounts: [request.senderId],
        }),
      ),
    // Reject applies to a token already held. Pending airdrops are cancelled
    // by their sender, not rejected using TokenRejectTransaction.
    reject: request =>
      guarded(() =>
        submit(
          new TokenRejectTransaction()
            .setOwnerId(AccountId.fromString(request.accountId))
            .addTokenId(TokenId.fromString(request.tokenId)),
          request.accountId,
          { accounts: [request.accountId] },
        ),
      ),
  };
}

function transferDetails(request: AssociationRequest): { amount: bigint; senderId: string } {
  if (
    !request.senderId ||
    request.senderId === request.accountId ||
    request.amount === undefined ||
    request.amount <= 0n ||
    request.amount > 9223372036854775807n
  ) {
    throw new Error("INVALID_ASSOCIATION_REQUEST");
  }
  return { amount: request.amount, senderId: request.senderId };
}
