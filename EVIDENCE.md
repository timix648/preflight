# Evidence

Every row is a real transaction on **Hedera testnet**, linked to HashScan so it
can be checked rather than taken on trust. Reverted transactions here are
**evidence, not defects** — they are the failure this template removes,
captured on-chain.

Regenerate the whole set with `yarn hardhat:evidence`.

Deployer: [`0.0.10505627`](https://hashscan.io/testnet/account/0.0.10505627) ·
Token: [`0.0.10620849`](https://hashscan.io/testnet/token/0.0.10620849) (OKE, **2 decimals**)

---

## The pair that matters

The same transfer, to the same account, 2.4 seconds apart. The only thing that
changed between them is that the kit associated the token.

| | Transaction | Result | Tokens moved |
| --- | --- | --- | --- |
| **Before** | [`…092.918`](https://hashscan.io/testnet/transaction/0.0.10505627-1789836087-477565839) | **`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`** | **none** |
| *The kit acts* | [`…093.938`](https://hashscan.io/testnet/transaction/0.0.10505627-1789836088-273241870) | `SUCCESS` — association | — |
| **After** | [`…095.284`](https://hashscan.io/testnet/transaction/0.0.10505627-1789836090-275408686) | `SUCCESS` | `0.0.10505627: −100` → `0.0.10620850: +100` |

The failed transfer has **zero** token transfers attached: nothing moved, and
the sender still paid the fee. That is the entire problem this template exists
to remove, and it is the first thing a developer hits on Hedera.

---

## All four paths, in consensus order

| # | What it proves | Service | Result | Link |
| --- | --- | --- | --- | --- |
| 1 | HTS token created — **2 decimals**, deliberately not 8 | HTS | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.10505627-1789836085-532299932) |
| 2 | Recipient created with **zero** auto-association slots (`0.0.10620850`) | HIP-23 | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.10505627-1789836082-989962081) |
| 3 | **A transfer that correctly FAILS** — nothing moves | HTS | **`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`** | [tx](https://hashscan.io/testnet/transaction/0.0.10505627-1789836087-477565839) |
| 4 | **Path 1** — explicit association | HTS | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.10505627-1789836088-273241870) |
| 5 | **The SAME transfer SUCCEEDING** after the kit handled it | HTS | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.10505627-1789836090-275408686) |
| 6 | Recipient created with unlimited slots (`0.0.10620854`) | HIP-23 | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.10505627-1789836089-100416471) |
| 7 | **Path 2** — auto-slot consumed on arrival, **zero approvals** | HIP-23 | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.10505627-1789836092-919819020) |
| 8 | Airdrop recipient created, zero slots (`0.0.10620855`) | HIP-23 | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.10505627-1789836091-023808970) |
| 9 | **Path 3** — HIP-904 airdrop, **sender** pays. Moves nothing: it is pending | HIP-904 | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.10505627-1789836095-256339668) |
| 10 | Path 3 — recipient **CLAIMS**. *This* is what moves the tokens | HIP-904 | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.10505627-1789836093-628534669) |
| 11 | Path 3 — recipient **REJECTS** and hands the token back | HIP-904 | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.10505627-1789836096-561225275) |
| 12 | Airdrop recipient for the cancel case (`0.0.10620857`) | HIP-23 | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.10505627-1789836097-273509768) |
| 13 | Path 3 — **sender CANCELS** a pending airdrop before it is claimed | HIP-904 | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.10505627-1789836099-666004205) |
| 14 | Second token for the batch run (`0.0.10620972`) | HTS | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.10505627-1789836955-348592241) |
| 15 | Batch recipient created, zero slots (`0.0.10620973`) | HIP-23 | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.10505627-1789836959-744812307) |
| 16 | **Path 4** — HIP-551 atomic associate + transfer, **one approval** | HIP-551 | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.10505627-1789836958-700023220) |
| 17 | ↳ inner 1 — the association, paid by the **recipient** | HIP-551 | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.10620973-1789836958-708578860) |
| 18 | ↳ inner 2 — the transfer, paid by the **sender** | HIP-551 | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.10505627-1789836957-767192698) |

### What the transfer counts show

Read the `token_transfers` on rows 9 and 10 together. The **airdrop moves
nothing** — it creates a pending airdrop. The **claim** is what actually
transfers the tokens. That is HIP-904's whole design visible on-chain: the
sender commits and pays, and the recipient decides later, without ever needing
HBAR or a prior association.

Row 13 is absent from most write-ups of HIP-904. A sender can withdraw a
pending airdrop that was never claimed, which matters if you airdrop to the
wrong address.

### What atomicity looks like on-chain

Rows 16–18 are one unit. The mirror node shows all three at consecutive
**nanoseconds**, with both inner transactions nested under the batch:

```
1789836965.486023845  ATOMICBATCH      payer 0.0.10505627
1789836965.486023846  TOKENASSOCIATE   payer 0.0.10620973   parent = ...845
1789836965.486023847  CRYPTOTRANSFER   payer 0.0.10505627   parent = ...845
                                       tokens  -100 -> +100
```

Two details worth reading twice.

The inner transactions carry **different payers**. The recipient paid for its
own association; the sender paid for the transfer. That is HIP-551's real
value — not just one approval, but one approval over transactions with
*different fee payers* that either all land or none do.

And there is no window. Compare rows 3–5, where the association and the
transfer are separate transactions a second apart: anything failing in between
leaves an account that has paid for an association it never used. Here that
gap does not exist, because it is measured in nanoseconds inside a single
consensus event.

---

## Contracts

| What it proves | Link |
| --- | --- |
| `AssociationProbe` live and source-verified | [`0.0.10620620`](https://hashscan.io/testnet/contract/0.0.10620620) · [Sourcify `exact_match`](https://repo.sourcify.dev/contracts/full_match/296/0x57631c41cDFB0ef2A7D4ef83b35c38558FA3e2D7/) |
| Deploy transaction, 726,927 gas | [`0x48830747…b544ee`](https://hashscan.io/testnet/transaction/0x48830747afe6070ce4d1dc4ddda19a7913684d16c988b3b87501ece83bb544ee) |
| The **broken** predecessor, also verified so the diff is readable | [`0.0.10620483`](https://hashscan.io/testnet/contract/0.0.10620483) · [Sourcify `exact_match`](https://repo.sourcify.dev/contracts/full_match/296/0x5be7aAD2cC81C721e595406399da30f7B68BCf62/) |

### Two contracts, one line apart

Both are source-verified, so the difference can be read on-chain:

| | `0.0.10620483` | `0.0.10620620` |
| --- | --- | --- |
| Guard | `target.code.length == 0` | `block.chainid` |
| `inspectToken(SAUCE)` | **reverts** `SystemContractUnreachable(0x167)` | `isHtsToken=true, isFungible=true` |
| Local tests | 17 passing | 17 passing |

Hedera's system contracts are precompiles, so `extcodesize` reports **zero**
for them inside the EVM. Both versions passed identical local suites; only one
works on the network it was written for. Write-up in
[`NOTES-failures.md`](NOTES-failures.md) #16.

Verifying them needed a workaround — `yarn hardhat:verify:testnet` is broken
because Sourcify retired the V1 API the bundled plugin calls. Use
`yarn hardhat:verify:sourcify <address>`, and see #17.

### Calls into the real HTS precompile

Read back from `0.0.10620620` — Solidity calling `0x167`:

```
inspectToken(SAUCE  0.0.1183558) -> isHtsToken=true   isFungible=true
inspectToken(USDC   0.0.5449)    -> isHtsToken=true   isFungible=true
inspectToken(WHBAR  0.0.15058)   -> isHtsToken=true   isFungible=true
inspectToken(the probe itself)   -> isHtsToken=false  isFungible=false
```

---

## Ecosystem, no credentials required

| What it proves | How to re-run |
| --- | --- |
| SaucerSwap V1 router quotes a live swap | `getAmountsOut(1 HBAR, [WHBAR, SAUCE])` on [`0.0.19264`](https://hashscan.io/testnet/contract/0.0.19264) → 55.098662 SAUCE |
| Router and price feed diverge by 12.6%, and it is not slippage | `yarn workspace @sh/nextjs test:live` |
| The relay paymaster really is disabled | `curl -s https://testnet.hashio.io/config \| grep PAYMASTER` |
| 587 tokens across 13 decimal scales | the histogram on `/` |

---

## A note on reading these links

A Hedera transaction id (`0.0.10505627@1789836087.477565839`) carries the
timestamp the **client** assigned when it built the transaction, not when the
network reached consensus. Under concurrency those ids are not in chronological
order — rows 9 and 10 above look reversed by id. The table is ordered by
**consensus timestamp**, which is the network's own ordering and the only one
that means anything.

## The browser journey, end to end

Signed in a browser with an EVM wallet (OKX) on `0.0.10474072`, 20 September
2026. Two different tokens, each associated and then acquired on the live DEX.

| # | What it proves | Result | Link |
| --- | --- | --- | --- |
| 19 | Explicit association of SAUCE, signed in the UI | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.7314364-1789930492-934015409) |
| 20 | **SAUCE acquired on SaucerSwap** through RouterV3 `0.0.19264` | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.7314364-1789930509-902591374) |
| 21 | Explicit association of CLXY, a second token | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.7314364-1789933935-912556937) |
| 22 | **CLXY acquired**, proving the journey is not token-specific | `SUCCESS` | [tx](https://hashscan.io/testnet/transaction/0.0.7314364-1789933958-462833689) |

### The quote was not approximately right, it was exactly right

The router quoted these amounts before signing; the mirror node reports these
balances after. They agree to the last digit, which is the claim `/acquire`
makes about quoting from the router rather than the price feed:

| Token | Quoted | Held now | Decimals |
| --- | --- | --- | --- |
| SAUCE `0.0.1183558` | 54.961799 | **54.961799** | 6 |
| CLXY `0.0.5365` | 51.240166 | **51.240166** | 6 |

Neither is 8dp or 18dp. Code that assumes either is wrong about both, and
wrong silently — the amount still looks plausible.

### Both associations were explicit, and that is the interesting part

The mirror node reports `automatic_association: false` for both tokens. The
signing account accepts **unlimited** automatic associations, so the transfer
would have associated them on arrival by itself. The kit associated first
anyway, because the alternative is trusting that every downstream path agrees
about slot state — and `/diagnose` exists precisely because that assumption is
where accounts get it wrong.

### What association actually costs

| Step | Gas limit | Charged |
| --- | --- | --- |
| Association (HTS precompile `0x167`) | 800,000 | **0.79 HBAR** |
| Swap (RouterV3) | 1,200,000 | **0.16 HBAR** |

The association costs five times the swap despite the lower gas limit: HTS
precompile calls carry a fixed HAPI-equivalent price that dwarfs execution
gas. This is the whole reason the choice of mechanism matters. Association is
not free, so *who pays* is a real question — which is what HIP-904 airdrop
answers by putting the cost on the sender.

## Still outstanding

Nothing on-chain. All four association mechanisms and the full browser journey
are captured above.

What remains is publication, not evidence:

| What it needs | Blocked on |
| --- | --- |
| Clean-machine `npm create scaffold-hbar` check (gate item G1) | The repository being public |
| Harness Tier 3.5 chain validation | `HEDERA_OPERATOR_ID` / `HEDERA_OPERATOR_KEY` exported in the shell |
