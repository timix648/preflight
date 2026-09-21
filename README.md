# Preflight

**Run preflight before the transfer.**

Your users acquire tokens on **[SaucerSwap](https://www.saucerswap.finance/)** — a live Hedera DEX — and
hold them without ever hitting `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`. Hedera shipped
three protocol changes at the association problem and produced four mechanisms
with **no guidance on which to use when**. This template implements all four
behind one API that picks for you and tells you, in a sentence your UI can
render, which it chose and why. It also handles the seven quieter traps that
surround it: address duality, key types, key rotation, decimals, read
consistency, status codes, and undocumented relay limits.

## 2. Create a project from this template

```bash
npm create scaffold-hbar@latest -- --template <org>/preflight
```

**The `--` is required.** Without it, `npm create` consumes `--template` itself
and silently scaffolds the default project instead. Verified against
`create-scaffold-hbar@0.4.0`; see [troubleshooting](#14-troubleshooting).

## 3. Disclaimer

This template is experimental and has not been audited. Do not use it in
production without your own review. It targets Hedera **testnet** by default and
is not intended to write to mainnet.

## 4. What is in this template

- **A framework-free core library** — `packages/nextjs/lib/onboarding/`. No
  React, no Next.js, no wagmi. Runs from a route handler, a script, a test, or
  another framework entirely.
- **The four-path association decision tree** — explicit, HIP-23 auto-slot,
  HIP-904 airdrop, HIP-551 batch — behind one `ensureAssociated()` call that
  always explains its choice.
- **Three routes.** `/` and `/diagnose` work with **no wallet and no `.env`**,
  and so does the router quote on `/acquire`. Only signing needs a wallet.
  Plus the scaffold's Debug Contracts page.
- **One small contract** — `AssociationProbe.sol`, demonstrating calls to the
  Hedera Token Service (`0x167`) and Account Service (`0x16a`) from Solidity,
  including the response-code mistake that makes those calls silently dangerous.
- **A live SaucerSwap integration** — token list, prices, decimals, liveness,
  and real router quotes, all read without credentials. The full journey is
  quote → associate → swap, in that order, against verified deployments.
- **76 tests.** 56 unit, 16 contract revert-path, plus 11 live-endpoint
  integration tests kept in a separate suite.
- Solidity flavour: **Hardhat**. Package manager: **Yarn** (vendored).

## 5. Architecture

```
SaucerSwap REST  ─┐                                    (prices, ranking)
Mirror node REST ─┼─→ lib/onboarding/ ─→ routes ─→ UI
JSON-RPC relay   ─┤    (framework-free)
SaucerSwap router ┘         │                          (real quotes + swap)
                            └─→ selectStrategy()  ── the product

              quote  ──→  associate  ──→  swap
                          (enforced, not suggested)
```

### The seam that matters

Everything of value in this template is in `packages/nextjs/lib/onboarding/`,
and **nothing in that directory imports React**. That constraint is the single
most important architectural decision here, and it is enforced by review rather
than by a bundler rule, so it is stated explicitly in `AGENTS.md`.

It buys three things. The core runs anywhere — a Next.js route handler, a
migration script, a test, a different framework. It can be tested without a DOM,
a wallet, or a network, which is why the decision tree has 24 tests that run in
84 milliseconds. And it means a developer forking this template can take the
library and throw away the UI, which is what most of them will want to do.

### Why the decision is separated from the execution

`association.ts` splits deliberately in two. `selectStrategy()` is **pure**: it
takes plain data describing a situation and returns a strategy plus a human
sentence. It performs no I/O, holds no SDK reference, and needs no signer.
Everything that actually moves value lives behind an `AssociationExecutor`
interface.

That split is what makes the product testable. The valuable part of this
template is not the ability to call `TokenAssociateTransaction` — the SDK
already does that. It is knowing **which of four mechanisms to reach for**, and
that knowledge is now a pure function with seven invariants asserted across all
192 possible input combinations. The most important of them,
`never_requires_a_signature_the_recipient_cannot_give`, catches an entire class
of bug: choosing a path that builds a transaction nobody can ever complete.

Because the executor is an interface rather than a concrete client, the same
core runs server-side against an operator key and in the browser against a
wallet, and `lib/` never learns which.

### Why state lives where it lives

There is **no database and no server-side session**, because there is nothing to
store. Every fact this template shows is derived from the network on demand:
account profiles and association state from the mirror node, limits from the
relay's `/config`, token metadata from SaucerSwap.

That is not laziness — it is trap #4. Hedera keys rotate, and an account's
address does not change when they do. Any cache of key material is correct until
someone rotates and then silently wrong forever, presenting as an
authentication failure rather than as a stale cache. `keys.ts` therefore
memoises nothing, and says so in a comment sized to stop the next person adding
a cache.

The credential-free routes are **Server Components**, so `/` and `/diagnose`
render real Hedera data with no client-side fetching, no API keys in the bundle,
and no wallet. `/diagnose` is driven by a query parameter rather than component
state, which makes a diagnosis a shareable URL that survives a refresh.

### What was deliberately not built

- **No wallet.** WalletConnect is integrated, not replaced.
- **No custody, key storage, or account creation.**
- **No gasless / paymaster path.** Not an oversight: the relay ships a paymaster
  and has it switched off. `PAYMASTER_ENABLED` is `false` on Hashio testnet, so
  a gasless path would not work on a judge's machine. The home page reads that
  flag live rather than asserting it.
- **No indexing layer.** Typed mirror-node hooks already exist elsewhere.
- **No token creation UI.** Acquiring and holding is the scope.
- **No multi-hop routing.** Only direct WHBAR pairs are quoted. A token with no
  direct pool reports `NO_ROUTE_FOR_PAIR` rather than silently returning zero —
  most of the 587 listed tokens have no direct pool, so this is the common case
  and is handled as one.

### Why the DEX proves the premise

This is not a template that invents a problem. SaucerSwap's own developer
documentation, on swapping HBAR for tokens, says:

> "Ensure that the 'to' account has the output token id associated prior to
> executing the swap. Failure to do so will result in a
> `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT` error."

The DEX documents the exact failure this kit removes. Association is not a
detail beside the swap — it is a precondition of it. That is why `/acquire`
keeps the swap button disabled until the account can hold the token, and why
the ordering is enforced rather than suggested.

### Choosing the router: check the endpoint, not the blog post

Three SaucerSwap routers are documented for testnet. All three resolve, and all
three look equally healthy in the docs. They are not:

| Contract | Hedera id | Last on-chain call |
| --- | --- | --- |
| **V1 RouterV3** | `0.0.19264` | **8 hours ago** — chosen |
| V2 SwapRouter | `0.0.1414040` | 29 hours ago |
| V2 **QuoterV2** | `0.0.1390002` | **105 days ago** — avoided |

QuoterV2 is the obvious choice for pricing, and nothing has called it in over
three months. Every address in `lib/onboarding/contracts.ts` was verified
against the live mirror node rather than copied from documentation.

### Quote from the router, never from the price feed

Measured on testnet for HBAR → SAUCE:

```
published price feed implied   $0.00143646 per SAUCE
the router actually quoted     $0.00164407 per SAUCE
divergence                     12.6%
```

That gap is **not** price impact. Quoting across four orders of magnitude moved
the rate by 0.13%:

```
  0.01 HBAR  ->  55.0993 SAUCE per HBAR
   100 HBAR  ->  55.0277 SAUCE per HBAR
```

The pool is deep; the feed simply disagrees with it. A UI that quotes from the
feed and executes against the pool misleads a user by double digits and looks
like a bug in your own code. So `/acquire` shows both numbers side by side with
the divergence named — price feeds for display and ranking, the router for
execution.

## 6. Prerequisites

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js | >= 20.18.3 | |
| Git | any, with `user.name` and `user.email` set | |
| Yarn | vendored at `.yarn/releases/` | No global install needed |
| Hedera account | **ECDSA**, funded | Only for `/acquire` and deploys |

Create an **ECDSA** account at [portal.hedera.com](https://portal.hedera.com) and
fund it at [the faucet](https://portal.hedera.com/faucet). **Not ED25519** —
ED25519 keys have no EVM address and fail against every EVM tool.

## 7. Quick start

```bash
# 1. Install. The committed lockfile is in sync, so this works under CI too.
yarn install

# 2. Run it. No account, no key, no .env needed for this step.
yarn next:dev
```

Open <http://localhost:3000>. The home page and `/diagnose` already work — try
`0.0.2`. Only continue if you want `/acquire` or contract deploys:

```bash
# 3. Import a funded ECDSA key. Prompts you; stores it ENCRYPTED at rest.
yarn hardhat:account:import
yarn hardhat:account            # confirm the derived address

# 4. Compile, test, deploy.
yarn hardhat:compile
yarn hardhat:test
yarn hardhat:deploy --network hederaTestnet
yarn hardhat:verify:testnet
```

## 8. Environment variables

Mirrors [`.env.example`](.env.example) exactly.

| Name | Required? | Where it lives | Where to get it |
| --- | --- | --- | --- |
| `HEDERA_RPC_URL` | no | `packages/hardhat/.env` | Defaults to Hashio testnet |
| `DEPLOYER_PRIVATE_KEY_ENCRYPTED` | for deploys | `packages/hardhat/.env` | Written by `yarn hardhat:account:import` — never paste a raw key |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | no | `packages/nextjs/.env` | [cloud.reown.com](https://cloud.reown.com); a fallback works locally |
| `NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL` | no | `packages/nextjs/.env` | Override the public relay |
| `HEDERA_OPERATOR_ID` / `HEDERA_OPERATOR_KEY` | harness only | your shell | Tier 3.5 chain validation; not read from any file |

**The first journey needs none of these.**

## 9. Networks

Testnet (**chain id 296**) is the default and the only network this template
writes to. Mainnet constants exist in `lib/onboarding/` so the library is
reusable, but no route targets mainnet and the harness recipe rejects it.

## 10. Verified testnet transactions

Full table in [`EVIDENCE.md`](EVIDENCE.md). Regenerate it all with
`yarn hardhat:evidence`.

### The pair that matters

The same transfer, to the same account, 2.4 seconds apart. The only thing that
changed between them is that the kit associated the token.

| | Result | Tokens moved |
| --- | --- | --- |
| [Before](https://hashscan.io/testnet/transaction/0.0.10505627-1789836087-477565839) | **`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`** | **none** |
| [The kit associates](https://hashscan.io/testnet/transaction/0.0.10505627-1789836088-273241870) | `SUCCESS` | — |
| [After](https://hashscan.io/testnet/transaction/0.0.10505627-1789836090-275408686) | `SUCCESS` | `−100` → `+100` |

The failed transfer carries **zero** token transfers: nothing moved, and the
sender still paid the fee. That is the problem this template removes, and it is
the first thing most developers hit on Hedera.

### All four mechanisms, on-chain

| Path | Mechanism | Evidence |
| --- | --- | --- |
| 1 | Explicit `TokenAssociateTransaction` | [tx](https://hashscan.io/testnet/transaction/0.0.10505627-1789836088-273241870) |
| 2 | HIP-23 auto-slot, **zero approvals** | [tx](https://hashscan.io/testnet/transaction/0.0.10505627-1789836092-919819020) |
| 3 | HIP-904 airdrop — [send](https://hashscan.io/testnet/transaction/0.0.10505627-1789836095-256339668) · [claim](https://hashscan.io/testnet/transaction/0.0.10505627-1789836093-628534669) · [reject](https://hashscan.io/testnet/transaction/0.0.10505627-1789836096-561225275) · [cancel](https://hashscan.io/testnet/transaction/0.0.10505627-1789836099-666004205) | 4 transactions |
| 4 | HIP-551 atomic batch, **one approval** | [batch](https://hashscan.io/testnet/transaction/0.0.10505627-1789836958-700023220) + [inner 1](https://hashscan.io/testnet/transaction/0.0.10620973-1789836958-708578860) + [inner 2](https://hashscan.io/testnet/transaction/0.0.10505627-1789836957-767192698) |

The airdrop and its claim are worth reading together: the **airdrop moves
nothing**, and the **claim** is what transfers the tokens. That is HIP-904's
design visible on-chain — the sender commits and pays, the recipient decides
later without needing HBAR or a prior association.

The HIP-551 batch is worth reading for a different reason. All three
transactions land at consecutive **nanoseconds** under one consensus event, and
the two inner transactions have **different fee payers**: the recipient paid
for its own association, the sender paid for the transfer. One approval over
transactions with different payers that either all land or none do — that is
the part other chains cannot express.

### Contracts

| What it proves | Link |
| --- | --- |
| `AssociationProbe` live and **source-verified** | [`0.0.10620620`](https://hashscan.io/testnet/contract/0.0.10620620) |
| Deploy transaction, 726,927 gas | [`0x48830747…b544ee`](https://hashscan.io/testnet/transaction/0x48830747afe6070ce4d1dc4ddda19a7913684d16c988b3b87501ece83bb544ee) |
| The **same contract with one line changed**, dead on Hedera — also verified, so the diff is readable on-chain | [`0.0.10620483`](https://hashscan.io/testnet/contract/0.0.10620483) |

Hedera's system contracts are precompiles, so `extcodesize` reports **zero** for
them inside the EVM. Both contracts passed identical 17-test local suites; only
one works on the network it was written for. That pair is the most useful thing
in this table, and [`NOTES-failures.md`](NOTES-failures.md) #16 explains it.

## 11. How the pattern works

A file-by-file trace of one journey: *a user wants to hold a token their account
cannot currently receive.*

1. **`app/acquire/page.tsx`** (Server Component) calls `listTokens()` and
   `rankTokens()` from **`lib/onboarding/saucerswap.ts`**. The token list,
   prices and per-token decimals render before any wallet exists. `rankTokens`
   puts due-diligence-complete tokens first and pushes fee-on-transfer tokens
   down — ordering as a safety decision, not a cosmetic one.

2. The user connects a wallet. **`app/acquire/_components/AcquireFlow.tsx`** —
   the only client component in the flow — calls
   `/api/onboarding/profile?account=…&token=…`.

3. **`app/api/onboarding/profile/route.ts`** runs server-side and calls three
   things from the core:
   - `profileAccount()` in **`lib/onboarding/keys.ts`**, which reads the account
     from **`lib/onboarding/mirror.ts`** and classifies its address through
     **`lib/onboarding/address.ts`**. This is where `ecrecoverCompatible` is
     decided, and where a quoted `"decimals"` string is coerced to a number.
   - `associationState()` in **`lib/onboarding/association.ts`** — can this
     account hold this token *right now*?
   - `selectStrategy()`, also in `association.ts`. **Pure.** Given free slots,
     whether the recipient can sign, and whether it holds HBAR for fees, it
     returns one of four strategies plus a sentence explaining the choice.

4. That sentence is rendered verbatim in the UI. It is not a debug string — it
   is the product. *"The recipient can sign and pay, so the kit batches the
   association and the transfer into one atomic transaction (HIP-551) — one
   approval instead of two."*

5. The user clicks once. `AcquireFlow` calls `associateToken` on the Hedera
   Token Service at `0x167` with a deliberately generous gas limit, because
   system-contract calls cost far more than they look and an under-provisioned
   limit fails with `INSUFFICIENT_GAS` — which reads like a code bug and is not.

6. Anything that throws goes through `explain()` in
   **`lib/onboarding/status.ts`**, which returns a code, a human sentence, and a
   fix. **No raw RPC string reaches a user anywhere in this template.**

7. The balance re-reads through **`lib/onboarding/consistency.ts`** and renders
   with a `SourceBadge`. If the mirror node still shows the old value, the badge
   says so rather than the UI asserting a number — mirror-node fungible balances
   come from a periodic file and legitimately lag a transfer that succeeded.

## 12. Extending this template

**1. Add a new association strategy.** Add the variant to `AssociationStrategy`
in `lib/onboarding/types.ts`, add a branch to `selectStrategy()` in
`association.ts` ordered by cost to the user, and add a case to
`describeStrategy()`. The seven invariants in `association.test.ts` run against
all 192 contexts automatically — if your branch can strand an account, they fail.

**2. Support a status code you hit in production.** Add an entry to `TABLE` in
`lib/onboarding/status.ts` with a `human` sentence and a `fix` written from what
actually worked. Nothing else changes: every catch site already routes through
`explain()`.

**3. Point the kit at your own relay.** Set
`NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL`, or pass `{ baseUrl }` to `relayLimits()`.
Nothing is hardcoded — limits are read from `/config` at runtime, so a
self-hosted relay with different limits displays correctly with no code change.

**4. Add multi-hop routing.** `hbarToTokenPath()` in
`lib/onboarding/contracts.ts` builds a two-element path. The router accepts
longer ones, so returning `[WHBAR, USDC, target]` enables tokens with no direct
HBAR pool. `routerQuote()` needs no change — `getAmountsOut` already handles
paths of any length.

**5. Reuse the core without the UI.** Import from
`packages/nextjs/lib/onboarding` and delete `app/`. There are no React imports
in the library, so nothing breaks.

## 13. Testing

```bash
yarn test          # 56 unit + 16 contract tests. Offline, ~14s.
yarn next:test     # unit only
yarn hardhat:test  # contract only
yarn workspace @sh/nextjs test:live   # 7 live-endpoint tests
```

Live-endpoint tests live in a **separate suite on purpose**. A unit suite that
fails because testnet was slow teaches developers to ignore red.

Tests are named after the guarantee they protect, not the function they call:

| Test | Guarantee |
| --- | --- |
| `never_requires_a_signature_the_recipient_cannot_give` | Never builds a transaction nobody can complete |
| `never_batches_when_batching_is_unsupported` | Never promises HIP-551 atomicity the SDK cannot deliver |
| `always_leaves_airdrop_available_when_work_is_needed` | No account can become unreachable |
| `long_zero_is_never_ecrecover_compatible` | A valid signature is never wrongly rejected |
| `lossy_narrowing_is_never_silent` | 18dp → 8dp reports its remainder |
| `excess_precision_is_rejected_not_rounded` | A caller's rounding bug never hides behind a plausible number |
| `ecrecover_returns_a_wrong_address_rather_than_failing` | Demonstrates the trap on-chain |
| `points_at_0x16a_for_the_account_service_not_0x167` | The address confusion cannot regress |

## 14. Troubleshooting

Real failures hit while building this, with the fix that worked. Full list in
[`NOTES-failures.md`](NOTES-failures.md).

**`npm create scaffold-hbar` ignores every flag.** `npm create` consumes flags
itself unless they follow `--`. Use
`npm create scaffold-hbar@latest -- --template owner/repo`. Without it npm runs
`create-scaffold-hbar owner repo` and scaffolds the default project.

**`corepack enable` fails with `EPERM` on Windows.** It writes shims into the
Node install directory, which needs Administrator rights. Skip it — Yarn is
vendored: `node .yarn/releases/yarn-3.2.3.cjs install`.

**`yarn install` hangs with no output.** Corepack is waiting on an interactive
"download Yarn?" prompt that never arrives in a non-TTY shell. Set
`COREPACK_ENABLE_DOWNLOAD_PROMPT=0`, or call the vendored binary directly.

**Scaffolding dies with `Z_BUF_ERROR` / `TAR_ABORT`.** An interrupted download
left a truncated tarball in the `giget` cache. `rm -rf ~/.cache/giget` and
retry. If a failed attempt left an empty project directory behind, delete that
too — otherwise every retry fails with `mkdir: File exists`.

**A balance looks wrong right after a transfer.** It is not wrong, it is
lagging. Mirror-node fungible balances come from a periodic balance file. The
`SourceBadge` tells you which source answered; `reconcileHbar()` compares both.

## 15. Licence and credits

MIT — see [`LICENSE`](LICENSE). Copyright 2026 0xgenzero, and BuidlGuidl and
hedera-dev for the scaffold this builds on.

Built on [scaffold-hbar](https://github.com/hedera-dev/scaffold-hbar).
Integrates [SaucerSwap](https://www.saucerswap.finance/) (token list, prices),
the [Hedera mirror node](https://docs.hedera.com/hedera/sdks-and-apis/rest-api),
and [Hashio](https://swirldslabs.com/hashio/) for JSON-RPC. Uses
[`@hiero-ledger/sdk`](https://github.com/hiero-ledger/hiero-sdk-js).
