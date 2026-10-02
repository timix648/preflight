# Preflight

A scaffold-hbar template for developers building **HTS token onboarding and
acquisition on Hedera**. Diagnose account readiness, choose among four native
association mechanisms, and acquire tokens through SaucerSwap on testnet.

[Live app](https://preflight-peach-theta.vercel.app) ·
[Demo video](https://youtu.be/UQkpHRn6z2U) ·
[Testnet evidence](EVIDENCE.md) · [Developer guide](docs/DEVELOPER_GUIDE.md)

## 1. Create a project from this template

Prerequisites: **Node.js 20.18.3 or newer and Git**. Yarn 3 is vendored.

```bash
npm create scaffold-hbar@latest -- --template timix648/preflight
```

Choose a project name when prompted, then **change into that generated folder**.
From its root, run:

```bash
node .yarn/releases/yarn-3.2.3.cjs install
node .yarn/releases/yarn-3.2.3.cjs next:dev
```

Open [localhost:3000](http://localhost:3000), then
[/diagnose?account=0.0.2](http://localhost:3000/diagnose?account=0.0.2).
Expected result: a rendered homepage and an account diagnosis from public
network data, without a wallet, private key, `.env`, or contract deployment.
Internet access is required; upstream failures are not offline fixtures.

Already cloned this repository? Run the same two commands from the clone root.
The `--` in the scaffold command passes `--template` to the generator.

## 2. Scope

Experimental, MIT-licensed, and not independently audited. The onboarding and
SaucerSwap workflow targets **Hedera testnet, chain 296** and fungible HTS tokens.
Association readiness does not bypass freeze, KYC, pause, custom fees, account
permissions, insufficient balances, or unavailable DEX liquidity.

## 3. Verify the implementation

Start with [EVIDENCE.md](EVIDENCE.md): a failed transfer, explicit association,
then the identical successful transfer, followed by the four native mechanisms,
atomic rollback and two EVM token acquisitions.

The September 26 reports contain **24 native transaction rows, 4 EVM transactions
and 47 assertions** (25 native, 13 EVM, 9 public reads). Counts include fixture
setup and expected failure cases. Source hashes identify the core that was tested.
These are saved testnet results, not a new execution each time you open the page.

## 4. What is in this template

- A framework-free TypeScript policy and native Hiero SDK executor.
- Explicit association, automatic slots, airdrop lifecycle and native atomic batches.
- Account/address/key diagnostics and token-specific integer amount handling.
- An EVM wallet flow using shared HTS association and SaucerSwap swap builders.
- Tests, public transaction evidence, and Hedera Harness spec/validators.

## 5. Routes

| Route | Use it for | Wallet needed? |
| --- | --- | --- |
| `/` | Network data, proof and architecture overview | No |
| `/diagnose` | Account identity, free slots and mechanism explanations | No |
| `/acquire` | Router quote, explicit association, then swap | Only to sign |
| `/debug` | Scaffold contract console | For writes |
| `/blockexplorer` | Scaffold explorer entry point; public testnet links use HashScan | No for public reads |

## 6. Architecture and integration value

`packages/nextjs/lib/onboarding/` contains reusable logic with no React, Next.js
or wagmi imports. Server Components and API handlers consume it; `AcquireFlow`
handles browser-wallet interaction. Contracts and scripts live in `packages/hardhat/`.

**SaucerSwap provides the actual acquisition:** its metadata supplies the picker,
its V1 router supplies executable quotes, and its pool delivers the acquired token.
Removing it removes the quote-and-buy workflow; public account diagnosis remains.
Mirror nodes supply account/relationship/receipt data and Hashio supplies EVM RPC.

[Architecture and adapter interfaces](docs/DEVELOPER_GUIDE.md#6-architecture)

## 7. Wallet prerequisites

For `/acquire`, connect an EVM-compatible wallet on **Hedera Testnet (296)**
with test HBAR for the purchase and fees. The [Hedera faucet](https://portal.hedera.com/faucet)
provides test funds. Keep keys in the wallet: **browser acquisition does not require
importing a deployer key or creating a `.env` file**.

Native SDK integrations supply their own signing callback. Supporting an ED25519
account through that adapter is distinct from driving the EVM wallet UI.

## 8. Run the acquisition workflow

1. Open `/acquire`, select a priced token and enter an HBAR amount.
2. Read the router quote and minimum received amount; connect your testnet wallet.
3. If the token is unassociated, approve **Associate** and wait for confirmation.
4. Refresh an expired quote, approve the swap, and inspect its receipt/HashScan link.

Quotes must match the current account, token and amount and expire after 30 seconds.
Changing the token or wallet invalidates the previous transaction state.
The UI deliberately uses explicit association; it does not execute all four native
mechanisms through an EVM wallet. An account with free automatic slots may already
be able to receive tokens without that explicit step.

For a production-mode local preview:

```bash
node .yarn/releases/yarn-3.2.3.cjs next:build
node .yarn/releases/yarn-3.2.3.cjs next:serve
```

`next:serve` runs `next start`; the legacy `next:start` script runs the dev server.

## 9. Configuration and optional deployment

No configuration is needed for the first journey. Optional settings are documented
in [`.env.example`](.env.example) and the per-package examples. In particular:

| Setting | Location | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | `packages/nextjs/.env` | Your own Reown project for a hosted deployment |
| `NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL` | `packages/nextjs/.env` | Browser EVM RPC override |
| `HEDERA_MIRROR_TESTNET_URL` | Next.js server environment | Mirror origin override, without `/api/v1` |
| `DEPLOYER_PRIVATE_KEY_ENCRYPTED` | `packages/hardhat/.env` | Written by the local account-import tool for deployments/scripts |

To deploy your own probe, follow [the deployment steps](docs/DEPLOYMENT.md).
The import script writes the encrypted setting itself. Deployment generates
`packages/hardhat/deployments/hederaTestnet/AssociationProbe.json` and updates
`packages/nextjs/contracts/deployedContracts.ts`; no address needs to be pasted
into a frontend environment variable. Never commit a real `.env`.

## 10. Networks

The supported onboarding/acquisition journey and saved evidence use testnet.
The inherited scaffold also exposes mainnet/local network configuration and
Hardhat deployment targets; that does **not** make this a validated mainnet product.
Do not infer whole-repository mainnet protection from the `/acquire` chain check.

## 11. Verified testnet transactions

The latest adapter evidence was completed on **2026-09-26 UTC**.
[Consensus tables and exact assertions](EVIDENCE.md) cover the native SDK and
public read integrations. The shared EVM builders also have fresh signed proof.

| Step | Result | Public proof |
| --- | --- | --- |
| Before | TOKEN_NOT_ASSOCIATED_TO_ACCOUNT; zero token transfers | [failed transfer](https://hashscan.io/testnet/transaction/0.0.10505627-1790447088-574838127) |
| Adapter acts | SUCCESS; recipient-paid explicit association | [association](https://hashscan.io/testnet/transaction/0.0.10733127-1790447088-916920985) |
| After | SUCCESS; 100 smallest units delivered | [identical transfer](https://hashscan.io/testnet/transaction/0.0.10505627-1790447093-654666509) |

The token has **2 decimals**. The identical transfer moves **100 smallest units**
only after the adapter associates the recipient. The elapsed consensus time is
**8.737 seconds**, derived from the new records rather than reused
from an older run.

| Proof | What a reviewer can inspect |
| --- | --- |
| Four native mechanisms | Explicit association, an existing automatic slot, raising the slot limit, pending/immediate airdrops, and an atomic batch |
| Airdrop lifecycle | Claim, rejection of a held token, and sender cancellation, each executed through the reusable adapter |
| Failure safety | Failed ordinary transfer moves nothing; failed batch leaves no association behind |
| EVM acquisition | HTS association and two 0.01-HBAR swaps through the AcquireFlow payload builders |
| Public integrations | New account/key/slot/balance snapshots, Hashio config, SaucerSwap metadata/quotes, and deployed probe calls |

The EVM runner uses a local test signer funded from a browser wallet. It does
not claim that a human clicked every AcquireFlow step. Browser regressions exercise
the actual component separately, with wallet/API boundaries mocked.

Reports include source-file hashes and observed results. Current runtime behavior,
completed tests, historical deployment provenance, and work still outstanding are
kept distinct in [EVIDENCE.md](EVIDENCE.md).

## 12. How the pattern works

The native API separates `selectStrategy()`/`evaluateStrategies()` from execution
through `ensureAssociated()` and `createHieroAssociationExecutor()`. The caller
supplies fresh account context and the required signers. Results distinguish
readiness, association and pending delivery.

The EVM UI uses `buildAssociationCall()` then `buildSwapCall()`. The signed evidence
runner uses those same builders, while browser regressions mock wallet boundaries.
See the [native integration example](docs/DEVELOPER_GUIDE.md#native-sdk-execution-and-the-evm-wallet-flow).

## 13. Hedera details this template handles

Free slots are the ceiling minus used automatic relationships. Long-zero addresses
are not interchangeable with key-derived EVM aliases. Token decimals are dynamic;
HBAR transfer values use the appropriate tinybar/weibar boundary. Quotes come from
the router, not the display price feed. A submitted hash is not a successful receipt.

[Detailed traps and failure explanations](docs/DEVELOPER_GUIDE.md#13-the-eight-traps-and-what-each-one-costs-you)

## 14. Extend the template

Start with `lib/onboarding/types.ts`, then the policy and the adapter you need.
Use the native signer callback to integrate account authorization; keep credentials
outside the core. Change network endpoints, token sources or routing with the
corresponding tests rather than only changing display labels.

[Customization guide](docs/DEVELOPER_GUIDE.md#14-extending-this-template)

## 15. Testing

Run from the repository root; these commands do not broadcast testnet transactions:

```bash
node .yarn/releases/yarn-3.2.3.cjs lint
node .yarn/releases/yarn-3.2.3.cjs test
node .yarn/releases/yarn-3.2.3.cjs next:build
node .yarn/releases/yarn-3.2.3.cjs test:browser
```

`test` includes core/native SDK tests and Hardhat tests. The recorded September 26
run had 219 core tests and 21 Hardhat tests, including evidence-runner regressions.
Browser checks exercise the real component with mocked wallet/API boundaries.
[Live reads and signed evidence commands](docs/DEVELOPER_GUIDE.md#run-the-checks)
are separate; signed runs spend test HBAR and are not required to inspect the proof.

## 16. Troubleshooting

| Symptom | First check |
| --- | --- |
| `yarn` is not found | Use the vendored `node .yarn/releases/yarn-3.2.3.cjs` commands above |
| Wrong network or insufficient payer balance | Select chain 296 and check test HBAR before signing |
| Token unavailable in picker | The UI shows a capped list of priced tokens; it is not an exhaustive token search |
| Empty acquire page token list | Check upstream availability and whether tokens have usable prices; the current warning conflates those causes |
| Quote expired or wallet request rejected | Refresh the quote or retry the user action after resolving the wallet issue |
| Tokens look stale after confirmation | Compare the transaction receipt with mirror indexing; balances may lag |

[Extended troubleshooting](docs/DEVELOPER_GUIDE.md#16-troubleshooting) ·
[Failures encountered during development](NOTES-failures.md)

## 17. Running the harness gate

The repository includes [the spec](.harness/spec.yaml),
[validators](.harness/validators/) and [acceptance contract](.harness/acceptance-contract.json).
Run `node .yarn/releases/yarn-3.2.3.cjs harness:doctor`, then
`node .yarn/releases/yarn-3.2.3.cjs harness:validate` from the root.

The recorded gate passed with zero findings and seven routes. That is historical
validation, not certification of an arbitrary new checkout. `validate` does not
perform the optional paid semantic/on-chain tier. A fresh anonymous scaffold/install
check is a separate submission check. [Harness details](docs/DEVELOPER_GUIDE.md#17-running-the-harness-gate)

## 18. Evidence index

| Review target | Source |
| --- | --- |
| Latest evidence and its limits | [EVIDENCE.md](EVIDENCE.md) |
| Native adapter transactions and exact assertions | [latest-native.json](evidence/latest-native.json) |
| EVM execution status | [latest-evm.json](evidence/latest-evm.json) |
| Fresh public network snapshots | [latest-reads.json](evidence/latest-reads.json) |
| Original runs, including incomplete runs | [evidence/runs](evidence/runs/) |
| Historical failures and explanations | [NOTES-failures.md](NOTES-failures.md) |
| Automated checks on main | [Quality workflow](https://github.com/timix648/preflight/actions/workflows/ci.yaml) |

Start with the before/after transfer, then the failed batch rollback. These show
the original failure, the onboarding fix, and atomicity. The EVM assertions also verify actual DEX delivery.

## 19. Licence and credits

[MIT](LICENSE). Preflight: **0xgenzero**. Upstream scaffold copyrights are retained.
Built on [scaffold-hbar](https://github.com/hedera-dev/scaffold-hbar), integrating
[SaucerSwap](https://www.saucerswap.finance/), Hedera Mirror Node, Hashio and
[Hiero SDK](https://github.com/hiero-ledger/hiero-sdk-js).
