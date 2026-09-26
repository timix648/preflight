# Preflight

**Choose the right Hedera token-onboarding path. Explain it. Prove it on-chain.**

Preflight is a **scaffold-hbar template** for developers building token acquisition,
distribution, and account-readiness flows on Hedera. It combines a reusable,
framework-free TypeScript library with a working SaucerSwap testnet acquisition UI.

Hedera offers several ways to receive tokens: explicit association, automatic
association slots, sender-paid airdrops, and atomic association-plus-transfer batches.
The useful question is **which mechanism fits this account, signer, and fee budget?**
Preflight answers that question and returns a sentence your application can display.

[Quick start](#8-quick-start) · [Native SDK integration](#native-sdk-execution-and-the-evm-wallet-flow) ·
[Evidence](EVIDENCE.md) · [Quality checks](https://github.com/timix648/preflight/actions/workflows/ci.yaml)

### What you can build with it

| Your integration                 | What Preflight provides                                                                                                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A token acquisition dApp         | Live router quotes, explicit HTS association, then a SaucerSwap swap; stale quotes, wrong networks, and mismatched account/token state block submission               |
| Native token onboarding          | `ensureAssociated()` chooses a mechanism; `createHieroAssociationExecutor()` builds and submits the corresponding Hiero SDK transactions through your signer callback |
| Airdrop distribution             | Immediate-versus-pending delivery detection, recipient claim, sender cancellation, and rejection of held tokens                                                       |
| Account diagnostics              | Address form, key type, usable automatic slots, association state, and explanations for alternative mechanisms                                                        |
| A different framework or backend | Plain TypeScript modules with no React, Next.js, wagmi, database, or key-storage dependency                                                                           |

### Why the implementation is worth inspecting

- **A useful first page without credentials.** Account diagnostics, token metadata,
  network limits, and DEX quotes work before connecting a wallet.
- **Decisions and execution are separate.** The pure policy is tested across the
  full input matrix; the native adapter can use the signer your application owns.
- **The DEX path is executable.** It uses router quotes, token-specific decimals,
  integer slippage arithmetic, and explicit association before the swap.
- **Success means a successful receipt.** A transaction hash alone does not unlock
  a success message. Mirror indexing, quote age, and wallet changes are handled explicitly.
- **Evidence is inspectable.** Transaction IDs link to HashScan; refreshed reports
  include timestamps, source hashes, observed results, and assertions. Incomplete runs
  do not replace a completed report.

**Scope:** Hedera testnet, fungible token onboarding, and direct WHBAR-to-token
SaucerSwap V1 routes. Association readiness does not bypass token freeze/KYC/pause
rules, custom fees, missing liquidity, or insufficient transaction fees. This is an
experimental template, not an audited production deployment.

## Contents

1. [Create a project from this template](#1-create-a-project-from-this-template)
2. [Disclaimer](#2-disclaimer)
3. [Verify the implementation](#3-verify-the-implementation)
4. [What is in this template](#4-what-is-in-this-template)
5. [The five routes, and what to do on each](#5-the-five-routes-and-what-to-do-on-each)
6. [Architecture](#6-architecture)
7. [Prerequisites](#7-prerequisites)
8. [Quick start](#8-quick-start)
9. [Environment variables](#9-environment-variables)
10. [Networks](#10-networks)
11. [Verified testnet transactions](#11-verified-testnet-transactions)
12. [How the pattern works](#12-how-the-pattern-works)
13. [The eight traps, and what each one costs you](#13-the-eight-traps-and-what-each-one-costs-you)
14. [Extending this template](#14-extending-this-template)
15. [Testing](#15-testing)
16. [Troubleshooting](#16-troubleshooting)
17. [Running the harness gate](#17-running-the-harness-gate)
18. [Evidence index](#18-evidence-index)
19. [Licence and credits](#19-licence-and-credits)

## 1. Create a project from this template

```bash
npm create scaffold-hbar@latest -- --template timix648/preflight
```

**The `--` is required.** Without it, `npm create` consumes `--template` itself
and silently scaffolds the default project instead. Verified against
`create-scaffold-hbar@0.4.0`; see [troubleshooting](#16-troubleshooting).

## 2. Disclaimer

This template is experimental and has not been audited. Do not use it in
production without your own review. It targets Hedera **testnet** by default and
is not intended to write to mainnet.

## 3. Verify the implementation

Start with the credential-free checks below. Signed evidence generation is a
separate, explicit testnet run. Existing transaction links can be inspected without
a signer; a clean dependency install and build can take longer than five minutes.

| Claim                                                    | Check it                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The first journey is credential-free                     | `yarn install && yarn next:dev`, then open `/`. Live relay limits, DEX statistics and a decimals histogram render before you have an account.                                                                                                                                                                         |
| It reads the relay live, and says so honestly            | `/` shows a `relay/<version>` badge **only** when the relay answered. Turn off your network and reload: the badge disappears and the prose changes to say the values are not a live reading.                                                                                                                          |
| It reports slots that are **available**, not the ceiling | `/diagnose?account=0.0.10622718` → **`0 free of 1`**. Confirm independently: [`accounts/0.0.10622718`](https://testnet.mirrornode.hedera.com/api/v1/accounts/0.0.10622718) gives the ceiling, [`/tokens`](https://testnet.mirrornode.hedera.com/api/v1/accounts/0.0.10622718/tokens) shows the slot is already taken. |
| ED25519 accounts are unusable with EVM tooling           | `/diagnose?account=0.0.2` → long-zero address, ECRECOVER **not** compatible, and the reason: it returns a _different valid-looking_ address rather than failing.                                                                                                                                                      |
| Quotes come from the router, not a price feed            | `/acquire`, pick SAUCE, enter 1. The panel shows the router figure, the published feed figure, and the divergence between them — measured above 10% at times.                                                                                                                                                         |
| The association actually happened                        | [Fresh before/after evidence](EVIDENCE.md#the-pair-that-matters): failed transfer, recipient-paid association, then identical successful transfer.                                                                                                                                                                    |
| The tests are real                                       | `yarn test` — core and contract regressions, offline. `yarn workspace @sh/nextjs test:live` — 14 against live testnet.                                                                                                                                                                                                |
| It passes the bounty's own gate                          | Previous recorded run: `passed=true`, 0 findings, 7/7 routes. Re-run `yarn harness:validate` for your checkout.                                                                                                                                                                                                       |

### Two honest caveats about running the gate yourself

`packages/hardhat/.env` must **not exist** when the harness runs — the static
gate lists it as a forbidden path, and it scans the working tree rather than
what git tracks. A fresh clone is fine; a machine that has done a deploy is
not.

If the harness cannot launch its own Chromium (Windows SmartScreen blocks the
downloaded binary with `spawn UNKNOWN`), point it at the system browser:
`PLAYWRIGHT_BROWSERS_PATH=<an empty directory>`. The harness then takes its
documented system-Chrome fallback.

## 4. What is in this template

- **A framework-free core library** — `packages/nextjs/lib/onboarding/`. No
  React, no Next.js, no wagmi. Runs from a route handler, a script, a test, or
  another framework entirely.
- **The four-path association decision tree** — explicit, HIP-23 auto-slot,
  HIP-904 airdrop, HIP-551 batch — behind one `ensureAssociated()` call that
  always explains its choice.
- **Five routes.** `/`, `/diagnose` and the router quote on `/acquire` work
  with **no wallet, no key and no `.env`**. Only signing needs a wallet. The
  scaffold's Debug Contracts and Block Explorer pages are kept as shipped.
- **One small contract** — `AssociationProbe.sol`, demonstrating calls to the
  Hedera Token Service (`0x167`) and Account Service (`0x16a`) from Solidity,
  including the response-code mistake that makes those calls silently dangerous.
- **A live SaucerSwap integration** — token list, prices, decimals, liveness,
  and real router quotes, all read without credentials. The full journey is
  quote → associate → swap, in that order, against verified deployments.
- **Regression suites.** Core and native SDK tests plus 17 contract tests that run offline,
  plus 14 live-endpoint tests kept in a separate suite so a slow testnet can
  never fail the ordinary run.
- **A recorded harness gate.** The earlier `yarn harness:validate` run passed Tiers 0–2 —
  `passed=true`, 0 findings, 7/7 routes walked in a real browser with no
  console errors. An acceptance contract for Tier 3 ships in
  [`.harness/acceptance-contract.json`](.harness/acceptance-contract.json).
- Solidity flavour: **Hardhat**. Package manager: **Yarn** (vendored).

## 5. The five routes, and what to do on each

### `/` — the credential-free argument

Opens with the three-beat proof: the **same transfer** failing, the kit
associating, then succeeding, each linking to HashScan. The
elapsed time is computed from the consensus timestamps at render, never
hard-coded.

Below it, everything is read live: the relay's undocumented `/config` limits,
SaucerSwap's all-time swap count and TVL, and a histogram of how many decimal
places each listed token uses — which is the argument for `units.ts` made from
data rather than assertion.

### `/diagnose` — paste any account, no wallet

Four examples are one click away, and they are chosen to be different from one
another rather than to flatter the tool:

| Account        | What it demonstrates                                               |
| -------------- | ------------------------------------------------------------------ |
| `0.0.2`        | ED25519, long-zero address, ECRECOVER unsafe, zero slots           |
| `0.0.10608004` | ECDSA with a key-derived address and unlimited slots               |
| `0.0.10604882` | A **threshold key** — no single recovered address can speak for it |
| `0.0.10622718` | Ceiling of 1, slot already used → **`0 free of 1`**                |

The last one is the interesting case, and the reason it is included is that the
other three cannot show it: each has a ceiling equal to its free count, so a
bug that reports the ceiling as availability is invisible against them.

Every account also gets the four mechanisms judged against it, including the
ones that do **not** apply and why. An EVM address works in the box too — it is
resolved through the mirror node.

### `/acquire` — quote without a wallet, sign only to execute

The token picker, the decimals, the live router quote and the comparison
against the published price feed all render before any wallet is connected.
Only the two buttons that sign anything are gated.

Step 2 stays **disabled until step 1 completes**. Calling the router before
associating is the precise failure this template removes, so the UI does not
merely advise against it.

A quote is never displayed beside an amount it was not calculated for: change
the figure and the previous answer is withheld, not relabelled. A swap reports
success only once the **receipt** exists — "the wallet returned a hash" is not
the same claim.

### `/debug` — the scaffold's contract console, kept deliberately

Ships with scaffold-hbar and is retained because `AssociationProbe`
([`0.0.10620620`](https://hashscan.io/testnet/contract/0.0.10620620)) is worth
poking at directly. Its read functions need no wallet:

- `isLongZero(address)` — verified against the deployed contract with no
  wallet connected:

  | Input                                        | Result      | Resolves to    |
  | -------------------------------------------- | ----------- | -------------- |
  | `0x0000000000000000000000000000000000000002` | **`true`**  | `0.0.2`        |
  | `0x574c17b6d34ffb8e2993645b32f773963fc77a53` | **`false`** | `0.0.10608004` |

  The contract reaches the same judgement on-chain that `/diagnose` renders in
  prose. Paste either address and press Read.

- `recoverWithEcrecover(...)` — demonstrates the trap from inside the EVM
  rather than from a description of it.

The panel also lists the two system contracts this template calls: **HAS at
`0x16a`** and **HTS at `0x167`**. `isAuthorized` lives on the former, not the
latter — a confusion that produces code calling the wrong contract entirely.

### `/blockexplorer` — honest about its own scope

Scaffold's built-in explorer indexes a **local** chain. Pointed at testnet it
says so and directs you to HashScan rather than rendering an empty page
pretending to be an index. It is kept rather than deleted because removing
scaffold conventions is a non-goal of this template, and because a page that
states its own limits is more useful than one quietly returning nothing.

## 6. Architecture

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
a wallet, or a network. The ordinary suite includes policy invariants, adapter
serialization, failure handling, and acquisition-state regressions. And it means a developer forking this template can take the
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

The native executor accepts a caller-supplied signing callback. A backend signer
or a compatible Hedera wallet can implement that callback. The shipped EVM UI
uses shared call builders in `evm-executor.ts`; an EVM wallet is not silently
treated as a native HAPI signer.

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

A deployment survey on **19 September 2026** compared these testnet endpoints.
The ages below are historical observations from that survey, not live counters:

| Contract        | Hedera id     | Last on-chain call         |
| --------------- | ------------- | -------------------------- |
| **V1 RouterV3** | `0.0.19264`   | **8 hours ago** — chosen   |
| V2 SwapRouter   | `0.0.1414040` | 29 hours ago               |
| V2 **QuoterV2** | `0.0.1390002` | **105 days ago** — avoided |

That survey found QuoterV2 dormant despite its documented address. The template
therefore uses V1 RouterV3, whose quote endpoint is exercised again in the latest
read evidence. The historical survey does not establish today's V2 activity.

### Quote from the router, never from the price feed

Historical measurement on 19 September 2026 for HBAR → SAUCE:

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

In that measurement, price impact did not explain the feed discrepancy. A UI that quotes from the
feed and executes against the pool misleads a user by double digits and looks
like a bug in your own code. So `/acquire` shows both numbers side by side with
the divergence named — price feeds for display and ranking, the router for
execution.

## 7. Prerequisites

| Requirement    | Version                                    | Notes                           |
| -------------- | ------------------------------------------ | ------------------------------- |
| Node.js        | >= 20.18.3                                 |                                 |
| Git            | any, with `user.name` and `user.email` set |                                 |
| Yarn           | vendored at `.yarn/releases/`              | No global install needed        |
| Hedera account | **ECDSA**, funded                          | Only for `/acquire` and deploys |

Create an **ECDSA** account at [portal.hedera.com](https://portal.hedera.com) and
fund it at [the faucet](https://portal.hedera.com/faucet). **Not ED25519** —
ED25519 keys have no EVM address and fail against every EVM tool.

## 8. Quick start

### If `yarn` is not on your PATH

It very likely is not, and that is fine — Yarn 3 is **vendored in this
repository**. Every command below can be written `node
.yarn/releases/yarn-3.2.3.cjs <script>` instead of `yarn <script>`, and that
form needs no global install and no `corepack enable`, which requires
Administrator on Windows.

```bash
node .yarn/releases/yarn-3.2.3.cjs install
node .yarn/releases/yarn-3.2.3.cjs next:dev
```

### The two-command version

```bash
# 1. Install. The committed lockfile is in sync, so this works under CI too.
yarn install

# 2. Run it. No account, no key, no .env needed for this step.
yarn next:dev
```

Open <http://localhost:3000>. First compile takes a few minutes; after that it
is fast. The home page and `/diagnose` already work — try `0.0.2`.

### Dev server or production server?

`next:dev` recompiles on demand and is what you want while editing.
**`next:serve` runs the production build** and starts in about three seconds,
which is better if you only want to look at the app. Note the naming, because
it is the reverse of what it sounds like:

| Script           | What it actually runs                    |
| ---------------- | ---------------------------------------- |
| `next:dev`       | `next dev`                               |
| **`next:serve`** | **`next start`** — the production server |
| `next:start`     | `next dev` — despite the name            |

That last row has caused a real bug in this repository; the harness recipe
documents it at length so nobody wires the wrong one again.

Only continue if you want `/acquire` or contract deploys:

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

## 9. Environment variables

Mirrors [`.env.example`](.env.example) exactly.

| Name                                         | Required?    | Where it lives          | Where to get it                                                      |
| -------------------------------------------- | ------------ | ----------------------- | -------------------------------------------------------------------- |
| `HEDERA_RPC_URL`                             | no           | `packages/hardhat/.env` | Defaults to Hashio testnet                                           |
| `DEPLOYER_PRIVATE_KEY_ENCRYPTED`             | for deploys  | `packages/hardhat/.env` | Written by `yarn hardhat:account:import` — never paste a raw key     |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`      | no           | `packages/nextjs/.env`  | [cloud.reown.com](https://cloud.reown.com); a fallback works locally |
| `NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL`         | no           | `packages/nextjs/.env`  | Override the public relay                                            |
| `HEDERA_OPERATOR_ID` / `HEDERA_OPERATOR_KEY` | harness only | your shell              | Tier 3.5 chain validation; not read from any file                    |

**The first journey needs none of these.**

## 10. Networks

Testnet (**chain id 296**) is the default and the only network this template
writes to. Mainnet constants exist in `lib/onboarding/` so the library is
reusable, but no route targets mainnet and the harness recipe rejects it.

## 11. Verified testnet transactions

The latest adapter evidence was completed on **2026-09-26 UTC**.
[Consensus tables and exact assertions](EVIDENCE.md) cover the native SDK and
public read integrations. **Fresh signed EVM execution remains unverified** after a relay gas-price rejection. The runner fix is locally tested; no more funding or refund work is underway.

| Step         | Result                                                | Public proof                                                                                    |
| ------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Before       | TOKEN_NOT_ASSOCIATED_TO_ACCOUNT; zero token transfers | [failed transfer](https://hashscan.io/testnet/transaction/0.0.10727914-1790416730-714923658)    |
| Adapter acts | SUCCESS; recipient-paid explicit association          | [association](https://hashscan.io/testnet/transaction/0.0.10727916-1790416739-072577022)        |
| After        | SUCCESS; 100 smallest units delivered                 | [identical transfer](https://hashscan.io/testnet/transaction/0.0.10727914-1790416742-762508366) |

The token has **2 decimals**. The identical transfer moves **100 smallest units**
only after the adapter associates the recipient. The elapsed consensus time is
**11.464 seconds**, derived from the new records rather than reused
from an older run.

| Proof                  | What a reviewer can inspect                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Four native mechanisms | Explicit association, an existing automatic slot, raising the slot limit, pending/immediate airdrops, and an atomic batch |
| Airdrop lifecycle      | Claim, rejection of a held token, and sender cancellation, each executed through the reusable adapter                     |
| Failure safety         | Failed ordinary transfer moves nothing; failed batch leaves no association behind                                         |
| EVM acquisition        | Shared payload builders and fee selection have local tests; fresh on-chain association and swap proof is outstanding      |
| Public integrations    | New account/key/slot/balance snapshots, Hashio config, SaucerSwap metadata/quotes, and deployed probe calls               |

The EVM runner uses a local test signer funded from a browser wallet. It does
not claim that a human clicked every AcquireFlow step. Browser regressions exercise
the actual component separately, with wallet/API boundaries mocked.

Reports include source-file hashes and observed results. Current runtime behavior,
completed tests, historical deployment provenance, and work still outstanding are
kept distinct in [EVIDENCE.md](EVIDENCE.md).

## 12. How the pattern works

A file-by-file trace of one journey: _a user wants to hold a token their account
cannot currently receive._

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
     account hold this token _right now_?
   - The acquisition policy returns an explicit-association explanation, or
     reports that association already exists. Native integrations use the pure
     `selectStrategy()` decision tree with their own signer and fee context.

4. The explanation is rendered in the UI. The native API can select any of the
   four mechanisms. The `/acquire` API specifically describes **explicit
   association followed by a standalone swap**, matching what the EVM wallet executes.

5. `AcquireFlow` uses `buildAssociationCall()` from `evm-executor.ts` to call `associateToken` on the Hedera
   Token Service at `0x167` with a deliberately generous gas limit, because
   system-contract calls cost far more than they look and an under-provisioned
   limit fails with `INSUFFICIENT_GAS` — which reads like a code bug and is not.

6. Anything that throws goes through `explain()` in
   **`lib/onboarding/status.ts`**, which returns a code, a human sentence, and a
   fix. **The onboarding flow renders the explanation instead of a raw RPC error.**

7. The balance re-reads through **`lib/onboarding/consistency.ts`** and renders
   with a `SourceBadge`. If the mirror node still shows the old value, the badge
   says so rather than the UI asserting a number — mirror-node fungible balances
   come from a periodic file and legitimately lag a transfer that succeeded.

## 13. The eight traps, and what each one costs you

Some failures are explicit network reverts. Others return a plausible but wrong
value. The core handles both classes and preserves a human explanation and fix.

| #   | Trap                 | What you'd write                                  | What actually happens                                                                                                                                            | Where it's handled          |
| --- | -------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 1   | **Association**      | `transfer(token, to, amount)`                     | `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`. Nothing moves; the sender still pays the fee.                                                                                 | `association.ts`            |
| 2   | **Address duality**  | Compare `ecrecover(...)` to the account's address | For a long-zero account ECRECOVER returns a **different, valid-looking** address. It does not fail — it disagrees, and your code rejects a legitimate signature. | `address.ts`                |
| 3   | **Key type**         | Deploy with any funded account                    | ED25519 accounts have no EVM alias. Every EVM tool fails, and the error names none of this.                                                                      | `keys.ts`                   |
| 4   | **Key rotation**     | Cache the key type once                           | Hedera keys rotate. A cached "this is ECDSA" becomes wrong without any event to tell you. Re-read it.                                                            | `keys.ts`                   |
| 5   | **Decimals**         | Assume 8, or assume 18                            | The live DEX list spans many scales. Assume wrongly and the amount is still _plausible_ — off by a power of ten, not obviously broken.                           | `units.ts`, branded types   |
| 6   | **Read consistency** | Read a balance after a transfer                   | Mirror-node fungible balances come from a periodic file. The number is stale, not wrong, and looks identical either way.                                         | `mirror.ts`, `SourceBadge`  |
| 7   | **Status codes**     | `if (config.PAYMASTER_ENABLED)`                   | Every `/config` value is a **string**, and `Boolean("false")` is `true`. You conclude a paymaster exists on a relay that has it switched off.                    | `relay.ts`, `configBoolean` |
| 8   | **Relay limits**     | `eth_getLogs` over 5,000 blocks                   | Queries wider than the limit return **empty**, which is indistinguishable from "there were no events".                                                           | `relay.ts`, rendered on `/` |

### Three more this build found the hard way

**The ceiling is not the availability.** `max_automatic_token_associations` is
a maximum, not a remaining count, and the mirror node publishes no used-slot
figure. An account with a ceiling of 1 that has already used it reports `1`,
and code that trusts it picks the auto-slot path — producing the exact error
this template removes. Counting the occupied slots requires a second request;
`freeAutoSlots()` makes it, and only when the ceiling is finite.

**Symbols are not unique.** SaucerSwap testnet lists **five** tokens whose
symbol is `HBAR` — two WHBAR variants, and one at **0 decimals** actually
named something else entirely. There are three different `HBARX` at 8, 6 and 8
decimals. Any picker showing only a symbol cannot identify what the user is
about to buy, which is why every token is shown as `SYMBOL · 0.0.x · Ndp`.

**Association costs five times the swap.** Measured on testnet: associating
through the HTS precompile charged **0.79 HBAR**, the SaucerSwap router call
**0.16 HBAR** — despite the association having the _lower_ gas limit. HTS
precompile calls carry a fixed HAPI-equivalent price that dwarfs execution
gas. This is why _which_ mechanism you choose is an economic question and not
only a technical one, and why HIP-904 airdrop — where the **sender** pays —
exists at all.

## 14. Extending this template

**1. Add a new association strategy.** Add the variant to `AssociationStrategy`
in `lib/onboarding/types.ts`, add a branch to `selectStrategy()` in
`association.ts` ordered by cost to the user, and add a case to
`describeStrategy()`. The seven invariants in `association.test.ts` run against
all 192 contexts automatically — if your branch can strand an account, they fail.

**2. Support a status code you hit in production.** Add an entry to `TABLE` in
`lib/onboarding/status.ts` with a `human` sentence and a `fix` written from what
actually worked. Nothing else changes: every catch site already routes through
`explain()`.

**3. Point the kit at your own relay.** Pass `{ baseUrl }` to relay-reading
functions and `relay: { baseUrl }` to `routerQuote()`. Thread that configuration
through your API handlers too. `NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL` configures
the scaffold provider; setting it alone does not replace every core module default.
Mirror-node and SaucerSwap clients have their own explicit options.

**4. Add multi-hop routing.** The current quote encoder and execution builders
intentionally support exactly `[WHBAR, target]`. Supporting longer routes requires
updating the ABI array encoding in `routerQuote()`, path types, route selection,
and the swap builder together. Add quote/execution parity tests before exposing it
in the UI; changing only `hbarToTokenPath()` is insufficient.

**5. Reuse the core without the UI.** Import from
`packages/nextjs/lib/onboarding` and delete `app/`. There are no React imports
in the library, so nothing breaks.

## 15. Testing

### Native SDK execution and the EVM wallet flow

The four-strategy API is `ensureAssociated()` with the supplied
`createHieroAssociationExecutor()` adapter. Import the adapter directly from
`lib/onboarding/sdk-executor`; it is intentionally absent from the shared barrel
so the Hiero SDK does not enlarge the credential-free pages or EVM wallet bundle.

```ts
import { ensureAssociated } from "./lib/onboarding/association";
import { createHieroAssociationExecutor } from "./lib/onboarding/sdk-executor";

// client, signTransaction, batchPublicKey and currentContext come from your
// application's signer integration and freshly read account state.
const executor = createHieroAssociationExecutor({
  client,
  sign: signTransaction,
  batch: { supported: true, key: batchPublicKey },
});
const result = await ensureAssociated({
  accountId: recipientId,
  tokenId,
  senderId,
  amount: tokenAmountInSmallestUnits, // bigint, never a floating-point number
  context: currentContext,
  executor,
});
```

The signing callback receives a frozen SDK transaction and `{ accounts,
batchKey? }`. It must obtain all listed account signatures and, on the outer
batch, the batch-key signature, then return the signed transaction. It can use
your wallet or signing service; this adapter reads no environment variables and
stores no keys. Configure a query payer on the SDK client for the airdrop record
query. Set `batch.supported` only for a network where native HIP-551 is available.

| Mechanism | What the adapter executes                                                                          | Result                                                                 |
| --------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Explicit  | Recipient-paid `TokenAssociateTransaction`                                                         | Associated; delivery remains the caller's next operation               |
| Auto-slot | No transaction for an existing slot; otherwise recipient-paid `AccountUpdateTransaction`           | `readyToReceive: true`, `associated: false` until delivery             |
| Airdrop   | Sender-paid `TokenAirdropTransaction`                                                              | The transaction record determines whether delivery is pending          |
| Batch     | Recipient-paid native association + transfer in `BatchTransaction`; sender also signs the transfer | Atomic delivery, or an error; no smart-contract calls inside the batch |

`executor.claim()` accepts a pending airdrop as the recipient. `executor.cancel()`
withdraws it as the sender. `executor.reject()` returns a **held** token; it does
not decline a pending airdrop. A recipient without HBAR needs a funded payer
arrangement before claiming; sender-paid airdrop creation does not make a later
claim free. Batch signing can require several wallet prompts depending on your
signer; atomicity does not guarantee one prompt in every wallet.

`/acquire` deliberately uses explicit association followed by a standalone
SaucerSwap call through an EVM wallet. Its displayed strategy describes that
actual execution. Native SDK airdrops and transfers are separate integration
paths, not choices silently substituted into a DEX swap. [Hedera's September 22
notice](https://hedera.com/blog/atomic-batch-transactions-no-longer-support-smart-contract-calls/)
keeps native batches supported while deprecating contract calls inside batches.

The EVM UI and signed evidence runner share `buildAssociationCall()` and
`buildSwapCall()` from `lib/onboarding/evm-executor.ts`. A scripted signer verifies
those same payloads on-chain; it is not presented as a browser-wallet interaction.

The swap guard requires a matching account/token/network profile and a quote
less than 30 seconds old for the current amount. A pending transaction prevents
duplicate submissions. The UI checks receipt status, then re-reads association
from the mirror node before enabling the router.

### Run the checks

```bash
yarn test          # core, native SDK, and contract tests; no transaction broadcasts
yarn next:test     # core and native SDK regressions
yarn hardhat:test  # contracts and evidence-runner regressions
yarn workspace @sh/nextjs test:live   # 14 live-endpoint tests, hits real testnet
yarn test:browser  # actual AcquireFlow in Chromium; mocked wallet and API boundaries

yarn hardhat:evidence:reads  # fresh public read snapshots, no signer
yarn hardhat:evidence --browser  # wallet-funded, encrypted recovery signer; native + EVM
yarn hardhat:evidence --evm      # local encrypted keystore; native + EVM
yarn hardhat:evidence:render     # promote complete reports to docs and homepage
yarn hardhat:evidence:render --native-only # native/read proofs, explicit EVM gap

yarn harness:validate   # the bounty's own gate: static + commands + route walk
```

Live-endpoint tests live in a **separate suite on purpose**. A unit suite that
fails because testnet was slow teaches developers to ignore red.

Tests are named after the guarantee they protect, not the function they call:

| Test                                                    | Guarantee                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `never_requires_a_signature_the_recipient_cannot_give`  | Never builds a transaction nobody can complete                     |
| `never_batches_when_batching_is_unsupported`            | Never promises HIP-551 atomicity the SDK cannot deliver            |
| `always_leaves_airdrop_available_when_work_is_needed`   | Pending creation remains an option without recipient authorization |
| `long_zero_is_never_ecrecover_compatible`               | A valid signature is never wrongly rejected                        |
| `lossy_narrowing_is_never_silent`                       | 18dp → 8dp reports its remainder                                   |
| `excess_precision_is_rejected_not_rounded`              | A caller's rounding bug never hides behind a plausible number      |
| `ecrecover_returns_a_wrong_address_rather_than_failing` | Demonstrates the trap on-chain                                     |
| `points_at_0x16a_for_the_account_service_not_0x167`     | The address confusion cannot regress                               |

### Reproduce signed evidence without exporting your wallet key

Run `yarn hardhat:evidence --browser` in your own interactive terminal. Before
opening the funding page, it asks you to choose a recovery password locally,
saves an ethers encrypted JSON keystore under the gitignored
`.harness/runtime/evidence-signer.json`, and verifies it can decrypt that file.
Keep the file and password until all recovery is complete. Never put passwords
or private keys in chat, command arguments, reports, or Git.

Then open `http://127.0.0.1:3939` in the Chrome profile containing your OKX wallet.
The page displays **40 test HBAR**, the destination, and chain **296** before
asking the wallet to sign. Free test HBAR is available from the
[official faucet](https://portal.hedera.com/faucet); mainnet HBAR is not needed.
The helper verifies the chain, destination, amount and successful receipt.
Receipt retries reuse the original hash instead of submitting another payment.

The runner creates isolated fixtures, executes the actual native adapter, and
uses the shared EVM builders for small SAUCE and CLXY purchases. It attempts to
return unused HBAR to the verified funding sender, leaving small reserves.
If cleanup fails, the encrypted recovery key remains on disk. Run
`yarn hardhat:evidence --browser --refund` to unlock that same signer and retry
cleanup without creating fixtures or requesting more funding. Already-funded
signers are refused for another ordinary run, preventing accidental duplicate
funding. After recovery, retain or archive the recovery files before a new run.
Completed fixtures return their unused HBAR before the next fixture is funded,
so the test budget is reused throughout the run. Balance reads for recovery use
the EVM relay; the legacy HAPI balance query returned `BUSY` during validation.

For the specific interrupted checkpoint after all four native mechanisms passed
but before the rollback fixture was created, `yarn hardhat:evidence --browser --resume`
reuses the verified receipts and saved signer, reclaims fixture funds, and finishes
the rollback and EVM checks. It checks the source hashes and checkpoint before
continuing, and never opens a new funding request. It is not a general retry of
unknown or partially confirmed writes.

The September 26 native checkpoint is now complete. Do not use `--resume` for
that completed run. Fresh signed EVM proof remains outstanding after a gas-price
rejection; funding and refund work has been stopped at the owner's request.
The runner now selects the relay gas price explicitly, with local regression tests.

This helper is test infrastructure, not a production wallet.

The existing-keystore alternative is `yarn hardhat:evidence --evm`. It prompts
locally to unlock the encrypted deployer account; the core adapter never reads
a private key or environment variable.

| Coverage               | What a successful signed run must demonstrate                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit               | The same transfer fails before association and succeeds afterward; the adapter's recipient pays for association                                 |
| Existing auto-slot     | `ensureAssociated()` requests no signature and submits no account update; arrival creates the relationship                                      |
| Raising the slot limit | The actual adapter sends `AccountUpdateTransaction`; the relationship is created only on subsequent delivery                                    |
| Airdrop                | Pending creation moves no tokens; immediate delivery is distinguished using the transaction record                                              |
| Lifecycle              | Claim moves tokens, reject returns held tokens, cancel removes the pending entry                                                                |
| Native batch           | Association and transfer belong to one parent; a deliberately insufficient transfer rolls back association                                      |
| EVM                    | Successful HTS return code, indexed association, fresh router quote, successful swap receipt, and received units at or above the slippage floor |

Reports are saved under `evidence/runs/`. Only a successful run updates its
`evidence/latest-*.json` file. Reports include the source commit and SHA-256 hashes
of the core files, which identify the executed code even during a local uncommitted
run. Public IDs, receipts and assertions belong in evidence; private keys,
keystores and signed transaction bytes do not.

### Current limits and production work

- A ready association is not a promise that every token can transfer. Token
  restrictions, account authorization, fees, balances, and pool liquidity still apply.
- Native batches contain HTS/account transactions, not the SaucerSwap contract call.
- The native adapter's claim and slot-update operations use the recipient as payer.
  An account without funds needs an appropriate payer integration before those steps.
- Batch atomicity does not guarantee one wallet prompt; required signatures depend
  on the accounts and wallet integration.
- The DEX integration is direct-pair V1 routing on testnet. It does not implement
  multi-hop discovery, cross-chain transfers, or a mainnet configuration switch.
- CLPR is a possible future receiving-flow integration. No CLPR runtime dependency
  is included, and it is not required to use or evaluate this template.

### Where CLPR could fit

The [CLPR proposal, HIP-1535 at the reviewed revision](https://github.com/hiero-ledger/hiero-improvement-proposals/blob/dc7363d80e214956664f67c6619220906ce99931/HIP/hip-clpr.md)
is marked Draft and describes cross-ledger messaging verified through per-channel
verifier contracts. It does not remove Hedera's token association requirements.
Our proposed use is a future destination-side readiness check: after an application
authenticates a cross-ledger request, Preflight could select the appropriate local
token-receiving mechanism. This is an integration direction, not an implemented feature.

A real integration would need deployed service support, reviewed channel/verifier
trust, replay-safe application processing, and a defined signer/payer policy.
Keep it optional; the current four mechanisms work without CLPR. The proposal
alone is not evidence that the service is available on this template's testnet.

## 16. Troubleshooting

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

## 17. Running the harness gate

`hedera-harness` is the bounty's own validator. This template passes Tiers
0–2:

```
passed=true  findings=0  playwrightGate=true  routes=7
```

```bash
yarn harness:doctor     # environment check — run this first
yarn harness:validate   # the gate itself, about six minutes
```

### What it actually checks

| Tier | What runs                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 0–1  | Static gate: required files present, **forbidden files absent**, README and AGENTS content assertions, a secret scan over the tree    |
| 1    | Baseline commands: `install`, `lint`, `next:test`, `hardhat:test:ci`, `next:build` — each must exit 0                                 |
| 2    | Playwright route walk: every route in the README loaded in a real browser, checked for status, hydration, and **zero console errors** |

The route walk is the strict one. `failOnConsoleError` is on, so a single
handled `console.error` fails the gate — which is why the HBAR price helper
logs a rate-limited CoinGecko response as a _warning_. It is expected and
already handled, and treating it as an error would fail a submission over a
third party's rate limit.

### Three things that will waste your afternoon

**`packages/hardhat/.env` must not exist while it runs.** The static gate
lists that path as forbidden and scans the **working tree**, not what git
tracks. A fresh clone is fine; your machine after a deploy is not. Move it
aside and put it back.

**Stop the dev server first.** The gate starts its own production server on
port 3000. If something already holds that port the server dies, and the
failure surfaces only as `Playwright gate failed before route checks
completed` with `routes=0` — which reads like a broken app.

**If Chromium cannot launch**, point the harness at the system browser:

```bash
PLAYWRIGHT_BROWSERS_PATH=<an empty directory> yarn harness:validate
```

On Windows, SmartScreen commonly blocks Playwright's downloaded binary and it
fails with `spawn UNKNOWN`. Emptying the browsers path makes the harness take
its documented system-Chrome fallback.

### Tier 3 and 3.5 — read before enabling

Chain validation does **not** run under `validate`. It is provisioned only by
`validate-semantic`, which additionally requires `validator.enabled: true` and
a `contract:` path, and which invokes the agent — a **billed** run. Setting
`HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_KEY` and running `validate` produces
a green result that never touched the chain.

The acceptance contract is written and shipped at
[`.harness/acceptance-contract.json`](.harness/acceptance-contract.json):
thirteen assertions, ten verifiable with no credentials, and exactly one
flagged `executableWithTestSigner` so a run completes one real transaction
rather than thirteen.

```bash
yarn harness:tier35     # decrypts the keystore in memory, never prints the key
```

That script refuses up front if the spec cannot support Tier 3.5, rather than
running and reporting a pass that proves nothing.

## 18. Evidence index

| Review target                                    | Source                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Latest evidence and its limits                   | [EVIDENCE.md](EVIDENCE.md)                                                          |
| Native adapter transactions and exact assertions | [latest-native.json](evidence/latest-native.json)                                   |
| EVM execution status                             | [Incomplete attempt](evidence/runs/2026-09-26T16-09-20-105Z-evm.json)               |
| Fresh public network snapshots                   | [latest-reads.json](evidence/latest-reads.json)                                     |
| Original runs, including incomplete runs         | [evidence/runs](evidence/runs/)                                                     |
| Historical failures and explanations             | [NOTES-failures.md](NOTES-failures.md)                                              |
| Automated checks on main                         | [Quality workflow](https://github.com/timix648/preflight/actions/workflows/ci.yaml) |

Start with the before/after transfer, then the failed batch rollback. These show
the original failure, the onboarding fix, and atomicity. Fresh signed DEX delivery is still an evidence gap.

## 19. Licence and credits

MIT — see [`LICENSE`](LICENSE). Copyright 2026 0xgenzero, and BuidlGuidl and
hedera-dev for the scaffold this builds on.

Built on [scaffold-hbar](https://github.com/hedera-dev/scaffold-hbar).
Integrates [SaucerSwap](https://www.saucerswap.finance/) (token list, prices),
the [Hedera mirror node](https://docs.hedera.com/hedera/sdks-and-apis/rest-api),
and [Hashio](https://swirldslabs.com/hashio/) for JSON-RPC. Uses
[`@hiero-ledger/sdk`](https://github.com/hiero-ledger/hiero-sdk-js).
