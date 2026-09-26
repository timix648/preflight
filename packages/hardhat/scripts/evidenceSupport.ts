/** Public evidence only: no keys, signatures, keystores or signed transaction bytes. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "../../..");
export const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1";
export const json = (value: unknown) =>
  JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v), 2);
export const mirrorId = (id: string) => id.replace("@", "-").replace(/\.(\d+)$/, "-$1");
export const link = (id: string) => `https://hashscan.io/testnet/transaction/${mirrorId(id)}`;

/** Never persist ethers' raw-transaction payload or a serialized secret-bearing error. */
export function evidenceError(error: any): string {
  const message = error?.shortMessage ?? (error instanceof Error ? error.message : "Evidence operation failed");
  const detail = typeof error?.error?.message === "string" ? error.error.message : "";
  return [message, detail]
    .filter(Boolean)
    .join(": ")
    .replace(/0x[0-9a-f]{64,}/gi, "[hex payload omitted]");
}

export async function mirror(route: string): Promise<any> {
  const response = await fetch(`${MIRROR}${route}`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Mirror HTTP ${response.status}: ${route}`);
  return response.json();
}

/** Retry indexing reads only. Never retry a signed write automatically. */
export async function indexed<T>(read: () => Promise<T>, accepts: (result: T) => boolean): Promise<T> {
  let last = "No indexed result";
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const result = await read();
      if (accepts(result)) return result;
      last = "Indexed state has not met the assertion";
    } catch (error) {
      last = error instanceof Error ? error.message : "Read failed";
    }
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }
  throw new Error(last);
}

export function newReport(kind: string) {
  const startedAt = new Date().toISOString();
  const runId = `${startedAt.replace(/[:.]/g, "-")}-${kind}`;
  const directory = path.join(ROOT, "evidence/runs");
  mkdirSync(directory, { recursive: true });
  const sources = [
    "association",
    "sdk-executor",
    "evm-executor",
    "mirror",
    "keys",
    "relay",
    "saucerswap",
    "swap",
    "units",
    "consistency",
  ];
  const report: any = {
    schemaVersion: 1,
    kind,
    network: "testnet",
    chainId: 296,
    startedAt,
    complete: false,
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
    sourceFiles: Object.fromEntries(
      sources.map(name => {
        const file = `packages/nextjs/lib/onboarding/${name}.ts`;
        return [
          file,
          createHash("sha256")
            .update(readFileSync(path.join(ROOT, file)))
            .digest("hex"),
        ];
      }),
    ),
    transactions: [],
    assertions: [],
  };
  const output = path.join(directory, `${runId}.json`);
  const save = () => writeFileSync(output, json(report) + "\n");
  save();
  return {
    report,
    save,
    output,
    check(name: string, condition: unknown, details?: unknown) {
      report.assertions.push({ name, passed: !!condition, checkedAt: new Date().toISOString(), details });
      save();
      assert.ok(condition, name);
    },
    async transaction(label: string, id: string, expected = "SUCCESS") {
      // Save the known ID before waiting: interruption must not lose broadcast evidence.
      const row: any = { label, transactionId: id, hashscanUrl: link(id), expected, verified: false };
      report.transactions.push(row);
      save();
      const body = await indexed(
        () => mirror(`/transactions/${mirrorId(id)}`),
        b => b.transactions?.some((t: any) => t.result !== "DUPLICATE_TRANSACTION"),
      );
      const candidates = body.transactions.filter((t: any) => t.result !== "DUPLICATE_TRANSACTION");
      const tx = candidates.find((t: any) => t.nonce === 0) ?? candidates[0];
      Object.assign(row, {
        verified: tx.result === expected,
        result: tx.result,
        consensusTimestamp: tx.consensus_timestamp,
        payer: tx.transaction_id?.split("-")[0],
        type: tx.name,
        tokenTransfers: tx.token_transfers ?? [],
        automaticAssociations: tx.automatic_associations ?? [],
        chargedFeeTinybar: tx.charged_tx_fee,
        parentConsensusTimestamp: tx.parent_consensus_timestamp,
      });
      save();
      assert.equal(tx.result, expected, label);
      console.log(`${label}: ${tx.result} ${row.hashscanUrl}`);
      return row;
    },
    finish() {
      report.complete = true;
      report.finishedAt = new Date().toISOString();
      save();
      writeFileSync(path.join(ROOT, `evidence/latest-${kind}.json`), json(report) + "\n");
      console.log(`Verified evidence: ${output}`);
    },
  };
}
