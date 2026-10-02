# Preflight developer guide

Start with the [README quick start](../README.md#1-create-a-project-from-this-template).
This reference covers integration, architecture, tests and troubleshooting.
All commands run from the repository root. `yarn <script>` below is shorthand for
`node .yarn/releases/yarn-3.2.3.cjs <script>` when Yarn is not on PATH.

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

An earlier deployment survey compared these testnet endpoints. The ages below
are historical observations from that survey, not live counters:

| Contract        | Hedera id     | Last on-chain call         |
| --------------- | ------------- | -------------------------- |
| **V1 RouterV3** | `0.0.19264`   | **8 hours ago** — chosen   |
| V2 SwapRouter   | `0.0.1414040` | 29 hours ago               |
| V2 **QuoterV2** | `0.0.1390002` | **105 days ago** — avoided |

That survey found QuoterV2 dormant despite its documented address. The template
therefore uses V1 RouterV3, whose quote endpoint is exercised again in the latest
read evidence. The historical survey does not establish today's V2 activity.

### Quote from the router, never from the price feed

An earlier measurement for HBAR → SAUCE:

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
If cleanup fails, the encrypted recovery key remains on disk. If you choose to recover unused test funds, run
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

The September 26 native and EVM runs are complete. Do not use `--resume` for
those completed runs. The earlier gas-price rejection was addressed with explicit
relay fee selection; the later EVM report verifies both association and swaps.

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
[`NOTES-failures.md`](../NOTES-failures.md).

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
yarn harness:validate   # the gate itself, allow time for installation, builds and browser startup
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
[`.harness/acceptance-contract.json`](../.harness/acceptance-contract.json):
thirteen assertions, ten verifiable with no credentials, and exactly one
flagged `executableWithTestSigner` so a run completes one real transaction
rather than thirteen.

```bash
yarn harness:tier35     # decrypts the keystore in memory, never prints the key
```

That script refuses up front if the spec cannot support Tier 3.5, rather than
running and reporting a pass that proves nothing.

