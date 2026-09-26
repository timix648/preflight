# Fresh testnet evidence

Signed native run completed **2026-09-26T16:09:52.475Z**. **Fresh EVM execution remains unverified.** The first submission was rejected by the relay for an insufficient gas price. The fee-selection fix has local tests, but has not been rerun on chain. Funding and refund work is stopped at the owner's request. Public read snapshots completed **2026-09-26T09:48:44.468Z**.
All timestamps are UTC. These are new executions through the current adapters,
not new labels on the earlier September 19–20 transactions.

| Layer                | What is proved                                                                                                                       | Machine-readable record                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Native Hiero adapter | Four mechanisms, immediate/pending delivery, claim/reject/cancel, and atomic failure                                                 | [native](evidence/latest-native.json)                                 |
| Shared EVM builders  | Locally tested; fresh signed association and swaps remain unverified                                                                 | [Incomplete attempt](evidence/runs/2026-09-26T16-09-20-105Z-evm.json) |
| Read adapters        | Mirror account/key/slot reads, independent balances, live Hashio limits, SaucerSwap metadata/router quotes, and deployed probe calls | [reads](evidence/latest-reads.json)                                   |

The wallet funds a temporary testnet signer; the runner signs its fixtures in
memory. This proves SDK/EVM payload execution, not a manual browser-wallet
journey. The actual AcquireFlow component has a separate browser regression suite
with mocked wallet/API boundaries. Those are different kinds of evidence.

## The pair that matters

Token **PFE 0.0.10727915**, **2 decimals**.
Sender **0.0.10727914**, recipient **0.0.10727916**.
The sender attempts the same 100-smallest-unit transfer before and after association.
Elapsed consensus time: **11.464 seconds**; the UI derives this from the records.

| Step         | Result                                                | Public proof                                                                                    |
| ------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Before       | TOKEN_NOT_ASSOCIATED_TO_ACCOUNT; zero token transfers | [failed transfer](https://hashscan.io/testnet/transaction/0.0.10727914-1790416730-714923658)    |
| Adapter acts | SUCCESS; recipient-paid explicit association          | [association](https://hashscan.io/testnet/transaction/0.0.10727916-1790416739-072577022)        |
| After        | SUCCESS; 100 smallest units delivered                 | [identical transfer](https://hashscan.io/testnet/transaction/0.0.10727914-1790416742-762508366) |

The failure moved no tokens. The native adapter selected explicit association
because the recipient could sign and pay, and no atomic batch was requested.
Association alone did not deliver the token; the subsequent transfer did.

## All four paths, in consensus order

Each row below was independently read back from the mirror node. Expected failures
are intentional negative tests; an unexpected success fails the evidence run.
Fixture setup is labelled separately from adapter execution. Child batch rows have
a parent consensus timestamp matching their outer batch.

| Operation                                          | Consensus result                  | Consensus timestamp    | Proof                                                                                    |
| -------------------------------------------------- | --------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| Create isolated two-decimal evidence token         | `SUCCESS`                         | `1790416729.563354196` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727914-1790416718-876227842) |
| Create explicit association fixture                | `SUCCESS`                         | `1790416734.606684104` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727914-1790416728-289757222) |
| Before: unassociated transfer                      | `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT` | `1790416739.759866188` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727914-1790416730-714923658) |
| Native adapter: explicit association               | `SUCCESS`                         | `1790416746.183871104` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727916-1790416739-072577022) |
| After: identical transfer                          | `SUCCESS`                         | `1790416751.223717030` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727914-1790416742-762508366) |
| Create existing finite auto-slot fixture           | `SUCCESS`                         | `1790416759.205475302` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727914-1790416751-690533045) |
| Existing auto-slot: delivery                       | `SUCCESS`                         | `1790416764.187202104` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727914-1790416758-670208229) |
| Create raise auto-slot limit fixture               | `SUCCESS`                         | `1790416768.625746280` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727914-1790416760-563692524) |
| Native adapter: raise automatic slots              | `SUCCESS`                         | `1790416772.940023357` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727923-1790416763-409639538) |
| Raised auto-slot: delivery                         | `SUCCESS`                         | `1790416777.147118603` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727914-1790416767-257097931) |
| Create pending airdrop and claim fixture           | `SUCCESS`                         | `1790416784.340373104` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727914-1790416775-920624087) |
| Native adapter: pending airdrop                    | `SUCCESS`                         | `1790416788.780026366` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727914-1790416782-129345848) |
| Native adapter: claim pending airdrop              | `SUCCESS`                         | `1790416794.547270236` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727931-1790416786-790731496) |
| Native adapter: reject held token                  | `SUCCESS`                         | `1790416801.380189104` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727931-1790416795-783954793) |
| Create pending airdrop cancellation fixture        | `SUCCESS`                         | `1790416805.400165108` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727914-1790416795-926398331) |
| Native adapter: airdrop before cancellation        | `SUCCESS`                         | `1790416810.147516068` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727914-1790416803-834330998) |
| Native adapter: cancel pending airdrop             | `SUCCESS`                         | `1790416815.486537117` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727914-1790416807-576938000) |
| Native adapter: immediate airdrop delivery         | `SUCCESS`                         | `1790416821.665287834` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727914-1790416814-554881035) |
| Create atomic batch fixture                        | `SUCCESS`                         | `1790416827.006591366` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727914-1790416819-576489616) |
| Native adapter: atomic batch                       | `SUCCESS`                         | `1790416832.825372639` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727942-1790416826-614589144) |
| Batch child: TokenAssociateTransaction             | `SUCCESS`                         | `1790416832.825372640` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727942-1790416822-844025493) |
| Batch child: TransferTransaction                   | `SUCCESS`                         | `1790416832.825372641` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727942-1790416826-446138345) |
| Create atomic rollback fixture                     | `SUCCESS`                         | `1790438949.008567960` | [transaction](https://hashscan.io/testnet/transaction/0.0.10727914-1790438942-403213632) |
| Native adapter: intentionally failing atomic batch | `INNER_TRANSACTION_FAILED`        | `1790438954.408346104` | [transaction](https://hashscan.io/testnet/transaction/0.0.10731737-1790438948-537993321) |

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

No fresh successful signed EVM transaction is claimed. The relay rejected the first association before submission: ethers selected 218 weibar against a reported minimum of 1,140,000,000,000 weibar. The runner now requests eth_gasPrice and explicitly applies legacy pricing with 10% headroom. Local tests cover the fee selection and safe error reporting. Historical September swap proofs remain in Git history; they do not validate this refreshed builder implementation.

## Fresh public read snapshots

| Assertion                                                             | Result |
| --------------------------------------------------------------------- | ------ |
| Hashio returned live testnet config                                   | Passed |
| Mirror/key adapter recognizes ED25519 and routes authorization to HAS | Passed |
| Finite slot count never exceeds its ceiling                           | Passed |
| Balance reconciliation has independent mirror and RPC readings        | Passed |
| SaucerSwap returned live token metadata and activity                  | Passed |
| SAUCE: router quote has positive output and a lower slippage floor    | Passed |
| CLXY: router quote has positive output and a lower slippage floor     | Passed |
| Deployed AssociationProbe reaches the live HTS precompile             | Passed |
| Deployed probe recognizes long-zero addresses                         | Passed |

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

Run `yarn hardhat:evidence:reads` for public snapshots, then
`yarn hardhat:evidence --browser` for a wallet-funded native + EVM run, or
`yarn hardhat:evidence --evm` to use the local encrypted keystore.
After all reports complete, run `yarn hardhat:evidence:render` to regenerate
this page, the README's proof summary, and the homepage's three-beat data.
Use `yarn hardhat:evidence:render --native-only` to publish completed native/read
proofs with the EVM gap stated explicitly. Neither render command sends transactions.

Every report contains the source commit and core-file SHA-256 hashes. Original
runs are retained under `evidence/runs/`; incomplete runs never replace a latest
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
