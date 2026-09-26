/** Recover test fixture HBAR using relay balances; HAPI balance queries return BUSY on this network. */
import assert from "node:assert/strict";
import { JsonRpcProvider, Wallet, HDNodeWallet } from "ethers";
import { Client, Hbar, PrivateKey, TransactionId, TransferTransaction } from "@hiero-ledger/sdk";
import { toEvmAddress } from "../../nextjs/lib/onboarding/address";

type Evidence = { report: any; save: () => void };

export async function sweepFixtureFunding(client: Client, key: PrivateKey, operator: string, evidence: Evidence) {
  const provider = new JsonRpcProvider("https://testnet.hashio.io/api", 296);
  evidence.report.cleanup ??= [];
  try {
    for (const fixture of evidence.report.fixtures ?? []) {
      const balance = (await provider.getBalance(toEvmAddress(fixture), "pending")) / 10_000_000_000n;
      const available = balance - 20_000_000n; // Leave 0.2 HBAR, including the fixture's own fee.
      if (available <= 0n) continue;
      const response = await (
        await new TransferTransaction()
          .setTransactionId(TransactionId.generate(fixture))
          .setMaxTransactionFee(new Hbar("0.1"))
          .addHbarTransfer(fixture, Hbar.fromTinybars((-available).toString()))
          .addHbarTransfer(operator, Hbar.fromTinybars(available.toString()))
          .freezeWith(client)
          .sign(key)
      ).execute(client);
      const row = {
        from: fixture,
        to: operator,
        tinybar: available.toString(),
        transactionId: response.transactionId.toString(),
        confirmed: false,
      };
      evidence.report.cleanup.push(row);
      evidence.save();
      await response.getReceipt(client);
      row.confirmed = true;
      evidence.save();
      console.log(`Recovered unused fixture HBAR: ${fixture}`);
    }
  } finally {
    provider.destroy();
  }
}

export async function refundEvidenceWallet(wallet: Wallet | HDNodeWallet, refundAddress: string, evidence: Evidence) {
  const provider = new JsonRpcProvider("https://testnet.hashio.io/api", 296);
  try {
    const balance = await provider.getBalance(wallet.address, "pending");
    const fees = await provider.getFeeData();
    assert.ok(fees.gasPrice && fees.gasPrice > 0n, "Refund requires a current gas price");
    const gasLimit = await provider.estimateGas({ from: wallet.address, to: refundAddress, value: 10_000_000_000n });
    const remainder = balance - gasLimit * fees.gasPrice - 200_000_000_000_000_000n;
    const value = (remainder / 10_000_000_000n) * 10_000_000_000n;
    if (value <= 0n) return;
    const response = await wallet
      .connect(provider)
      .sendTransaction({ to: refundAddress, value, gasLimit, gasPrice: fees.gasPrice });
    evidence.report.refundHash = response.hash;
    evidence.save();
    assert.equal((await response.wait(1, 120_000))?.status, 1, "Refund receipt must succeed");
    evidence.report.cleanup ??= [];
    evidence.report.cleanup.push({
      from: wallet.address,
      to: refundAddress,
      weibar: value.toString(),
      transactionHash: response.hash,
      confirmed: true,
    });
    evidence.save();
    console.log(`Unused funding returned: ${response.hash}`);
  } finally {
    provider.destroy();
  }
}
