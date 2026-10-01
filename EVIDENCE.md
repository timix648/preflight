# Fresh testnet evidence

Signed native run completed **2026-09-26T18:27:10.965Z**. EVM run completed **2026-09-26T18:28:07.031Z**. Public read snapshots completed **2026-09-26T17:39:09.947Z**.
All timestamps are UTC. These are new executions through the current adapters,
not new labels on the earlier September 19–20 transactions.

| Layer | What is proved | Machine-readable record |
| --- | --- | --- |
| Native Hiero adapter | Four mechanisms, immediate/pending delivery, claim/reject/cancel, and atomic failure | [native](evidence/latest-native.json) |
| Shared EVM builders | Verified HTS association and SAUCE/CLXY acquisition | [EVM](evidence/latest-evm.json) |
| Read adapters | Mirror account/key/slot reads, independent balances, live Hashio limits, SaucerSwap metadata/router quotes, and deployed probe calls | [reads](evidence/latest-reads.json) |

The completed runs below used the local encrypted deployer account
`0.0.10505627`; the runner signed its fixtures in memory. The browser-funded
temporary signer was used in an earlier attempt, not these latest reports.
This proves SDK/EVM payload execution, not a manual browser-wallet
journey. The actual AcquireFlow component has a separate browser regression suite
with mocked wallet/API boundaries. Those are different kinds of evidence.
The separate [recorded demo](https://youtu.be/UQkpHRn6z2U) and
[live app](https://preflight-peach-theta.vercel.app) show the presentation layer;
the machine-readable reports below establish the scripted transaction results.

## The pair that matters

Token **PFE 0.0.10733126**, **2 decimals**.
Sender **0.0.10505627**, recipient **0.0.10733127**.
The sender attempts the same 100-smallest-unit transfer before and after association.
Elapsed consensus time: **8.737 seconds**; the UI derives this from the records.

| Step | Result | Public proof |
| --- | --- | --- |
| Before | TOKEN_NOT_ASSOCIATED_TO_ACCOUNT; zero token transfers | [failed transfer](https://hashscan.io/testnet/transaction/0.0.10505627-1790447088-574838127) |
| Adapter acts | SUCCESS; recipient-paid explicit association | [association](https://hashscan.io/testnet/transaction/0.0.10733127-1790447088-916920985) |
| After | SUCCESS; 100 smallest units delivered | [identical transfer](https://hashscan.io/testnet/transaction/0.0.10505627-1790447093-654666509) |

The failure moved no tokens. The native adapter selected explicit association
because the recipient could sign and pay, and no atomic batch was requested.
Association alone did not deliver the token; the subsequent transfer did.

## All four paths, in consensus order

Each row below was independently read back from the mirror node. Expected failures
are intentional negative tests; an unexpected success fails the evidence run.
Fixture setup is labelled separately from adapter execution. Child batch rows have
a parent consensus timestamp matching their outer batch.

| Operation | Consensus result | Consensus timestamp | Proof |
| --- | --- | --- | --- |
| Create isolated two-decimal evidence token | `SUCCESS` | `1790447085.887336104` | [transaction](https://hashscan.io/testnet/transaction/0.0.10505627-1790447078-248898010) |
| Create explicit association fixture | `SUCCESS` | `1790447089.873776104` | [transaction](https://hashscan.io/testnet/transaction/0.0.10505627-1790447080-653841971) |
| Before: unassociated transfer | `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT` | `1790447094.132954104` | [transaction](https://hashscan.io/testnet/transaction/0.0.10505627-1790447088-574838127) |
| Native adapter: explicit association | `SUCCESS` | `1790447098.210820961` | [transaction](https://hashscan.io/testnet/transaction/0.0.10733127-1790447088-916920985) |
| After: identical transfer | `SUCCESS` | `1790447102.869653104` | [transaction](https://hashscan.io/testnet/transaction/0.0.10505627-1790447093-654666509) |
| Create existing finite auto-slot fixture | `SUCCESS` | `1790447110.009716500` | [transaction](https://hashscan.io/testnet/transaction/0.0.10505627-1790447101-852457372) |
| Existing auto-slot: delivery | `SUCCESS` | `1790447115.853151104` | [transaction](https://hashscan.io/testnet/transaction/0.0.10505627-1790447107-336985533) |
| Create raise auto-slot limit fixture | `SUCCESS` | `1790447124.769526076` | [transaction](https://hashscan.io/testnet/transaction/0.0.10505627-1790447119-764858076) |
| Native adapter: raise automatic slots | `SUCCESS` | `1790447128.873901104` | [transaction](https://hashscan.io/testnet/transaction/0.0.10733134-1790447123-085620102) |
| Raised auto-slot: delivery | `SUCCESS` | `1790447133.013155104` | [transaction](https://hashscan.io/testnet/transaction/0.0.10505627-1790447126-927597473) |
| Create pending airdrop and claim fixture | `SUCCESS` | `1790447143.330605146` | [transaction](https://hashscan.io/testnet/transaction/0.0.10505627-1790447135-353430353) |
| Native adapter: pending airdrop | `SUCCESS` | `1790447147.470818326` | [transaction](https://hashscan.io/testnet/transaction/0.0.10505627-1790447139-269416862) |
| Native adapter: claim pending airdrop | `SUCCESS` | `1790447155.755168805` | [transaction](https://hashscan.io/testnet/transaction/0.0.10733137-1790447148-093598927) |
| Native adapter: reject held token | `SUCCESS` | `1790447159.353706590` | [transaction](https://hashscan.io/testnet/transaction/0.0.10733137-1790447150-805900228) |
| Create pending airdrop cancellation fixture | `SUCCESS` | `1790447168.590718207` | [transaction](https://hashscan.io/testnet/transaction/0.0.10505627-1790447162-399807790) |
| Native adapter: airdrop before cancellation | `SUCCESS` | `1790447172.313563084` | [transaction](https://hashscan.io/testnet/transaction/0.0.10505627-1790447166-847257919) |
| Native adapter: cancel pending airdrop | `SUCCESS` | `1790447177.269768104` | [transaction](https://hashscan.io/testnet/transaction/0.0.10505627-1790447168-086462777) |
| Native adapter: immediate airdrop delivery | `SUCCESS` | `1790447183.989799104` | [transaction](https://hashscan.io/testnet/transaction/0.0.10505627-1790447178-596065327) |
| Create atomic batch fixture | `SUCCESS` | `1790447193.373034104` | [transaction](https://hashscan.io/testnet/transaction/0.0.10505627-1790447184-199414324) |
| Native adapter: atomic batch | `SUCCESS` | `1790447199.315253412` | [transaction](https://hashscan.io/testnet/transaction/0.0.10733151-1790447192-578612312) |
| Batch child: TokenAssociateTransaction | `SUCCESS` | `1790447199.315253413` | [transaction](https://hashscan.io/testnet/transaction/0.0.10733151-1790447190-794626299) |
| Batch child: TransferTransaction | `SUCCESS` | `1790447199.315253414` | [transaction](https://hashscan.io/testnet/transaction/0.0.10733151-1790447192-328714931) |
| Create atomic rollback fixture | `SUCCESS` | `1790447218.753094104` | [transaction](https://hashscan.io/testnet/transaction/0.0.10505627-1790447210-884878355) |
| Native adapter: intentionally failing atomic batch | `INNER_TRANSACTION_FAILED` | `1790447224.932954104` | [transaction](https://hashscan.io/testnet/transaction/0.0.10733156-1790447218-045879143) |

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

Account **0.0.10505627**, EVM address **0xF20e290D493EDC83bade49DC4bF54A925f5ddA8a**.
Each purchase spends **0.01 test HBAR**. Quotes are requested immediately before
submission. The proof includes successful EVM receipts, the HTS SUCCESS response
code, indexed association, and received units meeting the integer slippage floor.

| Operation | Consensus result | Consensus timestamp | Proof |
| --- | --- | --- | --- |
| EVM adapter: SAUCE association | `SUCCESS` | `1790447244.853110104` | [transaction](https://hashscan.io/testnet/transaction/0x0a64fd0c793b6ebf533a195126d3aa3876ff93f39a056e770c608aacb3f94009) |
| EVM adapter: SAUCE acquisition | `SUCCESS` | `1790447256.375167152` | [transaction](https://hashscan.io/testnet/transaction/0x19e17a043d6580cc03bdef4059b96d850b827bbf5962554acdb1736810b5b15a) |
| EVM adapter: CLXY association | `SUCCESS` | `1790447269.069771104` | [transaction](https://hashscan.io/testnet/transaction/0xd4b4a29ab937b613925de1dbb9d5784db6860c0cb9f140fcad19fe8bfe79d0a0) |
| EVM adapter: CLXY acquisition | `SUCCESS` | `1790447282.535384928` | [transaction](https://hashscan.io/testnet/transaction/0xa4abd667824b3c62d94750fcc10b1d0ea73569c164e79377c1ce7005c5085c6f) |

See the EVM report's assertions for exact quoted, minimum, and received units.
Token amounts are kept in smallest units plus their actual metadata decimals.

## Fresh public read snapshots

| Assertion | Result |
| --- | --- |
| Hashio returned live testnet config | Passed |
| Mirror/key adapter recognizes ED25519 and routes authorization to HAS | Passed |
| Finite slot count never exceeds its ceiling | Passed |
| Balance reconciliation has independent mirror and RPC readings | Passed |
| SaucerSwap returned live token metadata and activity | Passed |
| SAUCE: router quote has positive output and a lower slippage floor | Passed |
| CLXY: router quote has positive output and a lower slippage floor | Passed |
| Deployed AssociationProbe reaches the live HTS precompile | Passed |
| Deployed probe recognizes long-zero addresses | Passed |

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
runs may be retained locally under gitignored `evidence/runs/`; that history is
not included in a fresh clone. The three committed `latest-*.json` files are the
public evidence, and incomplete runs never replace a latest successful report.
Public transaction IDs and consensus results can be independently
checked via HashScan or the testnet mirror API. Client transaction-ID timestamps
are not consensus timestamps; chronology above uses the latter.

## Funding and remaining validation

The native report records recovery of unused fixture funding. Transaction fees
and EVM purchases consume test HBAR; the reports should be read for their own run,
without mixing in balances or refunds from earlier temporary-signer attempts.
No further funding or refund is needed to inspect this evidence.

Earlier development attempts encountered failed cleanup and a relay fee rejection.
Those failures motivated encrypted recovery and explicit EVM fee selection. They
are distinct from the completed September 26 runs shown above; local run history
is not a downloadable audit attachment in this repository.

This evidence does not certify mainnet operation, audit token-specific restrictions,
or replace a clean-machine scaffold installation or a fresh full harness gate.
It does not claim CLPR integration. A demo recording and scripted proof do not
replace a clean-machine scaffold test or an independent production audit.
