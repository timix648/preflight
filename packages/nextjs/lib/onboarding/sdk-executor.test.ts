import { type SigningRequest, createHieroAssociationExecutor } from "./sdk-executor";
import {
  AccountUpdateTransaction,
  BatchTransaction,
  Client,
  PrivateKey,
  Status,
  TokenAirdropTransaction,
  TokenAssociateTransaction,
  TokenCancelAirdropTransaction,
  TokenClaimAirdropTransaction,
  TokenRejectTransaction,
  Transaction,
  TransactionId,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const request = { accountId: "0.0.123", tokenId: "0.0.456", senderId: "0.0.789", amount: 9007199254740993n };
let client: Client;
let signatures: { transaction: Transaction; request: SigningRequest }[];
let pending: boolean;
let status: Status;
let record: ReturnType<typeof vi.fn>;
let execute: MockInstance<Transaction["execute"]>;
const key = PrivateKey.generateECDSA(); // ephemeral test key, never funded or persisted

function adapter(batchSupported = true) {
  return createHieroAssociationExecutor({
    client,
    batch: { supported: batchSupported, key: key.publicKey },
    sign: async (transaction, signing) => {
      signatures.push({ transaction, request: signing });
      return transaction.sign(key);
    },
  });
}

beforeEach(() => {
  client = Client.forNetwork({ "127.0.0.1:50211": "0.0.3" });
  signatures = [];
  pending = false;
  status = Status.Success;
  record = vi.fn(async () => ({ newPendingAirdrops: pending ? [{}] : [] }));
  execute = vi.spyOn(Transaction.prototype, "execute").mockResolvedValue({
    transactionId: TransactionId.fromString("0.0.123@1.2"),
    getReceipt: async () => ({ status }),
    getRecord: record,
  } as never);
});
afterEach(() => {
  vi.restoreAllMocks();
  client.close();
});

describe("native Hiero transaction adapter", () => {
  it("explicit association is addressed to and paid by the recipient", async () => {
    await adapter().execute({ ...request, strategy: "explicit" });
    const tx = signatures[0].transaction as TokenAssociateTransaction;
    expect(tx).toBeInstanceOf(TokenAssociateTransaction);
    expect(tx.accountId?.toString()).toBe(request.accountId);
    expect(tx.tokenIds?.map(id => id.toString())).toEqual([request.tokenId]);
    expect(tx.transactionId?.accountId?.toString()).toBe(request.accountId);
    expect(signatures[0].request.accounts).toEqual([request.accountId]);
  });
  it("auto-slot updates the recipient without inventing a transfer", async () => {
    await adapter().execute({ ...request, strategy: "auto-slot", maxAutomaticTokenAssociations: -1 });
    const tx = signatures[0].transaction as AccountUpdateTransaction;
    expect(tx).toBeInstanceOf(AccountUpdateTransaction);
    expect(tx.maxAutomaticTokenAssociations?.toString()).toBe("-1");
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])("airdrop pending=%s is derived from the actual record", async isPending => {
    pending = isPending;
    const result = await adapter().execute({ ...request, strategy: "airdrop" });
    expect(signatures[0].transaction).toBeInstanceOf(TokenAirdropTransaction);
    expect(signatures[0].transaction.transactionId?.accountId?.toString()).toBe(request.senderId);
    expect(signatures[0].request.accounts).toEqual([request.senderId]);
    expect(record).toHaveBeenCalledOnce();
    expect(result.pending).toBe(isPending);
  });
  it("a batch has independently signed native operations and one network submission", async () => {
    await adapter().execute({ ...request, strategy: "batch" });
    expect(signatures.map(s => s.transaction.constructor)).toEqual([
      TokenAssociateTransaction,
      TransferTransaction,
      BatchTransaction,
    ]);
    expect(new Set(signatures.map(s => s.transaction.transactionId?.toString())).size).toBe(3);
    expect(signatures[1].request.accounts).toEqual([request.accountId, request.senderId]);
    expect(signatures[2].request.batchKey?.toString()).toBe(key.publicKey.toString());
    const outer = signatures[2].transaction as BatchTransaction;
    // Serializing and decoding real SDK protobufs catches malformed batch bodies.
    const decoded = Transaction.fromBytes(outer.toBytes()) as BatchTransaction;
    expect(decoded.innerTransactions).toHaveLength(2);
    const transfer = decoded.innerTransactions[1] as TransferTransaction;
    const transfers = transfer.tokenTransfers?.get(request.tokenId);
    expect(transfers?.get(request.accountId)?.toString()).toBe(request.amount.toString());
    expect(transfers?.get(request.senderId)?.toString()).toBe((-request.amount).toString());
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("rejects unsupported batching without requesting signatures", async () => {
    await expect(adapter(false).execute({ ...request, strategy: "batch" })).rejects.toThrow();
    expect(signatures).toHaveLength(0);
    expect(execute).not.toHaveBeenCalled();
  });
  it.each([0n, -1n, 9223372036854775808n])("rejects invalid token amount %s before signing", async amount => {
    await expect(adapter().execute({ ...request, amount, strategy: "airdrop" })).rejects.toThrow();
    expect(signatures).toHaveLength(0);
  });
  it("does not round amounts through JavaScript Number", async () => {
    await adapter().execute({ ...request, strategy: "batch" });
    expect(request.amount > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    const tx = signatures[1].transaction as TransferTransaction;
    expect(tx.tokenTransfers?.get(request.tokenId)?.get(request.accountId)?.toString()).toBe(request.amount.toString());
  });
  it("failed receipts are human-readable errors, never success results", async () => {
    status = Status.InsufficientPayerBalance;
    await expect(adapter().execute({ ...request, strategy: "explicit" })).rejects.toMatchObject({
      explanation: { code: "INSUFFICIENT_PAYER_BALANCE" },
    });
  });
  it("claim and held-token rejection require the recipient; cancellation requires the sender", async () => {
    const sdk = adapter();
    await sdk.claim(request);
    await sdk.cancel(request);
    await sdk.reject(request);
    expect(signatures.map(s => s.transaction.constructor)).toEqual([
      TokenClaimAirdropTransaction,
      TokenCancelAirdropTransaction,
      TokenRejectTransaction,
    ]);
    expect(signatures.map(s => s.request.accounts)).toEqual([
      [request.accountId],
      [request.senderId],
      [request.accountId],
    ]);
  });
});
