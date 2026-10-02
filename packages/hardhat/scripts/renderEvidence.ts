/** Promote verified reports; --native-only explicitly leaves EVM execution unverified. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./evidenceSupport";

if (process.argv.includes("--help")) {
  console.log(
    "Regenerate public evidence from complete matching reports. --native-only publishes native/read proofs with an explicit EVM gap. No transactions are sent.",
  );
  process.exit(0);
}

const read = (kind: string) => JSON.parse(readFileSync(path.join(ROOT, `evidence/latest-${kind}.json`), "utf8"));
const native = read("native");
const nativeOnly = process.argv.includes("--native-only");
const evm = nativeOnly ? null : read("evm");
const reads = read("reads");
for (const [file, hash] of Object.entries(native.sourceFiles)) {
  assert.equal(
    createHash("sha256")
      .update(readFileSync(path.join(ROOT, file)))
      .digest("hex"),
    hash,
    `Core source changed since the native proof: ${file}`,
  );
}
for (const report of [native, reads, ...(evm ? [evm] : [])]) {
  assert.equal(report.complete, true, `${report.kind} run is incomplete`);
  assert.ok(report.assertions.length > 0 && report.assertions.every((a: any) => a.passed));
  assert.ok(report.transactions.every((t: any) => t.verified));
}
assert.deepEqual(native.sourceFiles, reads.sourceFiles, "Native and read reports must prove the same core source");
if (evm) {
  assert.equal(evm.accountId, native.operator, "Native and EVM reports must use the same run's signer");
  assert.equal(
    evm.nativeRun,
    native.startedAt,
    "Native and EVM evidence must come from the same execution, not an older run of the same account",
  );
  assert.deepEqual(native.sourceFiles, evm.sourceFiles, "Native and EVM must prove the same core source");
}
const { before, act, after } = native.headline;
assert.equal(before.result, "TOKEN_NOT_ASSOCIATED_TO_ACCOUNT");
assert.equal(act.result, "SUCCESS");
assert.equal(after.result, "SUCCESS");
assert.equal(before.tokenTransfers.length, 0);
const nanos = (timestamp: string) => {
  const [seconds, fraction] = timestamp.split(".");
  return BigInt(seconds) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
};
const elapsed = Number(nanos(after.consensusTimestamp) - nanos(before.consensusTimestamp)) / 1e9;
/** A consensus timestamp is Unix seconds + nanoseconds. Judges read dates, not epochs. */
const utc = (timestamp: string) =>
  new Date(Number(timestamp.split(".")[0]) * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC");
const rows = (transactions: any[]) =>
  transactions
    .map(
      t =>
        `| ${t.label} | \`${t.result}\` | ${utc(t.consensusTimestamp)} · \`${t.consensusTimestamp}\` | [transaction](${t.hashscanUrl}) |`,
    )
    .join("\n");
const headlineTable = `| Step | Result | Public proof |\n| --- | --- | --- |\n| Before | TOKEN_NOT_ASSOCIATED_TO_ACCOUNT; zero token transfers | [failed transfer](${before.hashscanUrl}) |\n| Adapter acts | SUCCESS; recipient-paid explicit association | [association](${act.hashscanUrl}) |\n| After | SUCCESS; 100 smallest units delivered | [identical transfer](${after.hashscanUrl}) |`;
const content = `# Fresh testnet evidence

Signed native run completed **${native.finishedAt}**. ${evm ? `EVM run completed **${evm.finishedAt}**.` : "**Fresh EVM execution remains unverified.** The first submission was rejected by the relay for an insufficient gas price. The fee-selection fix has local tests, but has not been rerun on chain. Funding and refund work is stopped at the owner's request."} Public read snapshots completed **${reads.finishedAt}**.
All timestamps are UTC. These are new executions through the current adapters.

| Layer | What is proved | Machine-readable record |
| --- | --- | --- |
| Native Hiero adapter | Four mechanisms, immediate/pending delivery, claim/reject/cancel, and atomic failure | [native](evidence/latest-native.json) |
| Shared EVM builders | ${evm ? "Verified HTS association and SAUCE/CLXY acquisition" : "Locally tested; fresh signed association and swaps remain unverified"} | ${evm ? "[EVM](evidence/latest-evm.json)" : "[Incomplete attempt](evidence/runs/2026-09-26T16-09-20-105Z-evm.json)"} |
| Read adapters | Mirror account/key/slot reads, independent balances, live Hashio limits, SaucerSwap metadata/router quotes, and deployed probe calls | [reads](evidence/latest-reads.json) |

The wallet funds a temporary testnet signer; the runner signs its fixtures in
memory. This proves SDK/EVM payload execution, not a manual browser-wallet
journey. The actual AcquireFlow component has a separate browser regression suite
with mocked wallet/API boundaries. Those are different kinds of evidence.

## The pair that matters

Token **${native.token.symbol} ${native.token.id}**, **${native.token.decimals} decimals**.
Sender **${native.operator}**, recipient **${native.headlineRecipient}**.
The sender attempts the same 100-smallest-unit transfer before and after association.
Elapsed consensus time: **${elapsed.toFixed(3)} seconds**; the UI derives this from the records.

${headlineTable}

The failure moved no tokens. The native adapter selected explicit association
because the recipient could sign and pay, and no atomic batch was requested.
Association alone did not deliver the token; the subsequent transfer did.

## All four paths, in consensus order

Each row below was independently read back from the mirror node. Expected failures
are intentional negative tests; an unexpected success fails the evidence run.
Fixture setup is labelled separately from adapter execution. Child batch rows have
a parent consensus timestamp matching their outer batch.

| Operation | Consensus result | Consensus time (UTC · raw) | Proof |
| --- | --- | --- | --- |
${rows([...native.transactions].sort((a, b) => a.consensusTimestamp.localeCompare(b.consensusTimestamp)))}

### Semantics the tests check

- An existing auto-slot causes no adapter transaction or signing request. Receipt
  of the transfer creates the automatic relationship.
- Raising slots submits a real AccountUpdateTransaction. Readiness is true, but
  association stays false until a token arrives.
- A pending airdrop is not an association. Claim performs delivery; its payer must
  be funded. Reject returns a held token. Cancel removes a pending entry.
- The adapter reads the airdrop transaction record to distinguish immediate delivery.
- The native batch has recipient-paid inner association and transfer operations;
  the sender also authorizes the transfer. This adapter's payer policy differs
  from the older hand-built demonstration. Wallet prompt count is signer-dependent.
- A deliberately oversized batch transfer fails, and no association remains.

## EVM acquisition through the shared builders

${
  evm
    ? `Account **${evm.accountId}**, EVM address **${evm.walletAddress}**.
Each purchase spends **0.01 test HBAR**. Quotes are requested immediately before
submission. The proof includes successful EVM receipts, the HTS SUCCESS response
code, indexed association, and received units meeting the integer slippage floor.

| Operation | Consensus result | Consensus time (UTC · raw) | Proof |
| --- | --- | --- | --- |
${rows(evm.transactions)}

See the EVM report's assertions for exact quoted, minimum, and received units.
Token amounts are kept in smallest units plus their actual metadata decimals.`
    : `No fresh successful signed EVM transaction is claimed. The relay rejected the first association before submission: ethers selected 218 weibar against a reported minimum of 1,140,000,000,000 weibar. The runner now requests eth_gasPrice and explicitly applies legacy pricing with 10% headroom. Local tests cover the fee selection and safe error reporting. Earlier swap proofs remain in Git history; they do not validate this refreshed builder implementation.`
}

## Fresh public read snapshots

| Assertion | Result |
| --- | --- |
${reads.assertions.map((a: any) => `| ${a.name} | Passed |`).join("\n")}

The JSON snapshot contains the actual values and observation times. Prices,
activity counts, balances, and slot availability are snapshots, not permanent promises.

## Deployed contract provenance

The existing [AssociationProbe 0.0.10620620](https://hashscan.io/testnet/contract/0.0.10620620)
was called again in the read run. Its deployment is historical; this refresh did
not redeploy it. The earlier source-verification result applies to its original
published source. Correcting a NatSpec author comment changes local compilation
metadata, so this document does not claim a fresh exact-source verification of
the edited source against that old deployment.

## Reproduce and verify

Run \`yarn hardhat:evidence:reads\` for public snapshots, then
\`yarn hardhat:evidence --browser\` for a wallet-funded native + EVM run, or
\`yarn hardhat:evidence --evm\` to use the local encrypted keystore.
After all reports complete, run \`yarn hardhat:evidence:render\` to regenerate
this page, the README's proof summary, and the homepage's three-beat data.
Use \`yarn hardhat:evidence:render --native-only\` to publish completed native/read
proofs with the EVM gap stated explicitly. Neither render command sends transactions.

Every report contains the source commit and core-file SHA-256 hashes. Original
runs are retained under \`evidence/runs/\`; incomplete runs never replace a latest
successful report. Public transaction IDs and consensus results can be independently
checked via HashScan or the testnet mirror API. Client transaction-ID timestamps
are not consensus timestamps; chronology above uses the latter.

## Funding and remaining validation

The native report lists fixture funding recovery and the return of unused HBAR.
A small reserve is left in each fixture; transaction fees are consumed.
Any cleanup error is recorded explicitly.
The completed refund returned 15.11924709 test HBAR; no further funding or refund
work is in progress. The earlier memory-only attempt left 39.99871842 test HBAR
in an inaccessible signer after cleanup failed. See the retained
[incident audit](evidence/runs/2026-09-26T09-13-26-977Z-native.json).

This evidence does not certify mainnet operation, audit token-specific restrictions,
or replace a clean-machine scaffold installation or a fresh full harness gate.
It does not claim CLPR integration or a new manual browser-wallet demo.
`;

const baseSecond = BigInt(before.consensusTimestamp.split(".")[0]);
const relativeTime = (timestamp: string) => Number(nanos(timestamp) - baseSecond * 1_000_000_000n) / 1e9;
const beats = [
  {
    phase: "before",
    label: "Before",
    transactionId: before.transactionId.replace("@", "-").replace(/\.(\d+)$/, "-$1"),
    consensus: relativeTime(before.consensusTimestamp),
    status: before.result,
    ok: false,
    tokensMoved: null,
    note: "Zero token transfers are attached. Nothing moved, and the sender still paid the fee.",
  },
  {
    phase: "act",
    label: "The kit acts",
    transactionId: act.transactionId.replace("@", "-").replace(/\.(\d+)$/, "-$1"),
    consensus: relativeTime(act.consensusTimestamp),
    status: act.result,
    ok: true,
    tokensMoved: null,
    note: "The native adapter explicitly associated the token. The recipient authorized and paid for its association.",
  },
  {
    phase: "after",
    label: "After",
    transactionId: after.transactionId.replace("@", "-").replace(/\.(\d+)$/, "-$1"),
    consensus: relativeTime(after.consensusTimestamp),
    status: after.result,
    ok: true,
    tokensMoved: `${native.operator} −100 → ${native.headlineRecipient} +100`,
    note: "The identical transfer, to the identical account. The only required state change was the association.",
  },
];
const corePath = path.join(ROOT, "packages/nextjs/lib/onboarding/evidence.ts");
let core = readFileSync(corePath, "utf8").replace(/\r\n/g, "\n");
const from = core.indexOf("/** The token used for the run");
const until = core.indexOf("/**\n * Seconds between", from);
assert.ok(from >= 0 && until > from);
core =
  core.slice(0, from) +
  `/** The token used for the run — generated from verified native evidence. */\nexport const EVIDENCE_TOKEN = ${JSON.stringify(native.token, null, 2)} as const;\nexport const EVIDENCE_ACCOUNTS = ${JSON.stringify({ sender: native.operator, recipient: native.headlineRecipient }, null, 2)} as const;\nexport const EVIDENCE_BEATS: readonly EvidenceBeat[] = ${JSON.stringify(beats, null, 2)} as const;\n\n` +
  core.slice(until);

const readmePath = path.join(ROOT, "README.md");
let readme = readFileSync(readmePath, "utf8");
const summary = `## 11. Verified testnet transactions

The latest adapter evidence was completed on **${native.finishedAt.slice(0, 10)} UTC**.
[Consensus tables and exact assertions](EVIDENCE.md) cover the native SDK and
public read integrations. ${evm ? "The shared EVM builders also have fresh signed proof." : "**Fresh signed EVM execution remains unverified** after a relay gas-price rejection. The runner fix is locally tested; no more funding or refund work is underway."}

${headlineTable}

The token has **2 decimals**. The identical transfer moves **100 smallest units**
only after the adapter associates the recipient. The elapsed consensus time is
**${elapsed.toFixed(3)} seconds**, derived from the new records rather than reused
from an older run.

| Proof | What a reviewer can inspect |
| --- | --- |
| Four native mechanisms | Explicit association, an existing automatic slot, raising the slot limit, pending/immediate airdrops, and an atomic batch |
| Airdrop lifecycle | Claim, rejection of a held token, and sender cancellation, each executed through the reusable adapter |
| Failure safety | Failed ordinary transfer moves nothing; failed batch leaves no association behind |
| EVM acquisition | ${evm ? "HTS association and two 0.01-HBAR swaps through the AcquireFlow payload builders" : "Shared payload builders and fee selection have local tests; fresh on-chain association and swap proof is outstanding"} |
| Public integrations | New account/key/slot/balance snapshots, Hashio config, SaucerSwap metadata/quotes, and deployed probe calls |

The EVM runner uses a local test signer funded from a browser wallet. It does
not claim that a human clicked every AcquireFlow step. Browser regressions exercise
the actual component separately, with wallet/API boundaries mocked.

Reports include source-file hashes and observed results. Current runtime behavior,
completed tests, historical deployment provenance, and work still outstanding are
kept distinct in [EVIDENCE.md](EVIDENCE.md).

`;
readme = readme.replace(/## 11\. Verified testnet transactions[\s\S]*?(?=## 12\.)/, summary);
readme = readme.replace(
  /## 18\. Evidence index[\s\S]*?(?=## 19\.)/,
  `## 18. Evidence index

| Review target | Source |
| --- | --- |
| Latest evidence and its limits | [EVIDENCE.md](EVIDENCE.md) |
| Native adapter transactions and exact assertions | [latest-native.json](evidence/latest-native.json) |
| EVM execution status | ${evm ? "[latest-evm.json](evidence/latest-evm.json)" : "[Incomplete attempt](evidence/runs/2026-09-26T16-09-20-105Z-evm.json)"} |
| Fresh public network snapshots | [latest-reads.json](evidence/latest-reads.json) |
| Original runs, including incomplete runs | [evidence/runs](evidence/runs/) |
| Historical failures and explanations | [NOTES-failures.md](NOTES-failures.md) |
| Automated checks on main | [Quality workflow](https://github.com/timix648/preflight/actions/workflows/ci.yaml) |

Start with the before/after transfer, then the failed batch rollback. These show
the original failure, the onboarding fix, and atomicity. ${evm ? "The EVM assertions also verify actual DEX delivery." : "Fresh signed DEX delivery is still an evidence gap."}

`,
);
readme = readme.replace(
  /\| The association actually happened[^\n]*/,
  `| The association actually happened | [Fresh before/after evidence](EVIDENCE.md#the-pair-that-matters): failed transfer, recipient-paid association, then identical successful transfer. |`,
);
writeFileSync(path.join(ROOT, "EVIDENCE.md"), content);
writeFileSync(corePath, core);
writeFileSync(readmePath, readme);
console.log(
  `Updated public proofs from complete ${evm ? "native, EVM, and read" : "native and read"} reports${evm ? "" : "; EVM gap explicitly retained"}.`,
);
