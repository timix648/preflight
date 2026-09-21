# Failure notes

Three lines per failure: symptom, cause, fix. Written when it happens, not
remembered later. The best five become README section 14.

---

## 1. `npm create scaffold-hbar` silently ignores every flag

**Symptom.** `npm create scaffold-hbar@latest --template hedera-demo` exits 1.
npm's own log shows it ran `create-scaffold-hbar form2 hedera-demo` — the
`--template` flag and its value arrived as bare positional arguments, and
every other flag vanished.

**Cause.** `npm create` consumes flags itself unless they follow `--`.

**Fix.** The `--` is mandatory:
`npm create scaffold-hbar@latest -- --template owner/repo`.
This is the only form that works. Print exactly this in the README; a judge
who copies a broken command may not try twice.

---

## 2. `corepack enable` fails with EPERM on Windows

**Symptom.** `EPERM: operation not permitted, open 'C:\Program Files\nodejs\pnpm'`,
then `yarn: command not found`.

**Cause.** Corepack writes its shims into the Node install directory, which
needs Administrator rights on Windows.

**Fix.** Point it at a user-writable directory already on `PATH`:
`corepack enable --install-directory "$APPDATA\npm"`.
Or skip corepack entirely — this repo vendors Yarn at
`.yarn/releases/yarn-3.2.3.cjs`, so `node .yarn/releases/yarn-3.2.3.cjs install`
always works.

---

## 3. Scaffold dies with `Z_BUF_ERROR` / `TAR_ABORT`

**Symptom.** `code: 'Z_BUF_ERROR'`, `tarCode: 'TAR_ABORT'` naming a
`.tar.gz` under the `giget` cache.

**Cause.** An earlier scaffold run was interrupted mid-download and left a
truncated tarball behind. `giget` reuses the cached file and cannot unpack it.

**Fix.** Delete the cache and retry: `rm -rf ~/.cache/giget`
(or `$XDG_CACHE_HOME/giget`).

---

## 4. Scaffold retries fail with `mkdir: File exists`

**Symptom.** After any failed scaffold, every retry exits with
`mkdir: cannot create directory '<name>': File exists`.

**Cause.** The CLI creates the project directory before it downloads the
template, and does not clean up when a later step fails. The empty directory
then blocks every retry.

**Fix.** `rm -rf <name>` before retrying. On Windows, make sure no shell has
that directory as its working directory or the delete silently fails.

---

## 5. `yarn install` hangs forever with no output

**Symptom.** `yarn install` produces nothing and never exits. No
`node_modules` appears.

**Cause.** Corepack is waiting on an interactive "download Yarn 3.2.3?"
prompt that never arrives in a non-TTY shell.

**Fix.** `export COREPACK_ENABLE_DOWNLOAD_PROMPT=0`, or invoke the vendored
binary directly: `node .yarn/releases/yarn-3.2.3.cjs install`.

---

## 6. `yarn install` fails with `YN0028` in CI

**Symptom.** `The lockfile would have been modified by this install, which is
explicitly forbidden.`

**Cause.** Yarn enables `--immutable` automatically when `CI` is set, and the
scaffolded `yarn.lock` does not match its own `package.json`.

**Fix.** RESOLVED 18 Sep 2026. The regenerated lockfile is committed (54 stale
lines removed). `CI=1 yarn install` now completes with exit 0, so the harness
recipe runs a plain `yarn install` with no workaround flag.

If you ever add a dependency, commit the resulting `yarn.lock` in the same
commit or this regresses silently — the failure only appears under CI.

---

## 7. `yarn lint` warns that `next lint` is deprecated

**Symptom.** ``next lint` is deprecated and will be removed in Next.js 16.``

**Cause.** The scaffold's lint script still calls `next lint`. Next.js is
moving projects to the ESLint CLI directly.

**Fix.** Nothing today — it is a warning, and gate item G5 tolerates warnings.
But once a judge scaffolds on Next.js 16 this becomes a hard failure of G5.
Migrate before submission: `npx @next/codemod@canary next-lint-to-eslint-cli .`
**Re-check on day 13 against whatever Next.js version resolves then.**

---

## 8. Build warns that `@import` must precede all rules

**Symptom.** During `yarn next:build`:
`@import rules must precede all rules aside from @charset and @layer statements`,
pointing at the Google Fonts `@import` in the stylesheet.

**Cause.** The scaffold's CSS puts `@import url(...)` for Montserrat after
Tailwind's `@layer` statements. CSS requires `@import` first.

**Fix.** Not blocking — the build completes and G5 tolerates warnings. Move the
`@import` to the top of the file, or better, load the font through
`next/font/google`, which is the idiomatic Next.js route and removes the
render-blocking network request. Worth doing during day 11 polish.

---

## 9. `try/catch` does not reliably detect a missing system contract

**Symptom.** `AssociationProbe.associateSelf` reverted with a clean
`SystemContractUnreachable` error off Hedera, but `isAuthorized` — written the
same way, with the same `try/catch` — reverted with **no reason data at all**.
Hardhat reported `function returned an unexpected amount of data`.

**Cause.** When a call is expected to return data, Solidity may skip the
`extcodesize` check and rely on a returndata-size check instead. That check
reverts in the **calling** frame rather than propagating from the callee, so
`try/catch` never sees it. Which of the two the compiler emits varies by
function signature, so the behaviour differed between two nearly identical
functions.

**Fix.** Check explicitly before calling: `if (target.code.length == 0) revert
SystemContractUnreachable(target);`. Do not infer "the contract is missing" from
a caught failure.

Two follow-on lessons, both learned the same evening:

- **Order matters.** Validate the caller's own inputs *first*, then the
  environment. A zero address is the caller's bug on every network; answering
  "you are not on Hedera" to it points them at the wrong problem.
- **The optimizer can erase the check.** In a function that does nothing else
  with the result, the optimizer collapsed the explicit guard back into the
  compiler's own empty revert. `associateUnchecked` was therefore left
  deliberately naive instead, which is better documentation anyway: it is
  careless in all three ways the careful version is careful, and the contrast
  is the lesson.

---

## 11. A contract test that passed alone but failed under `yarn hardhat:test`

**Symptom.** `npx hardhat test` passed 16/16. `yarn hardhat:test` failed one.
Then fixing that one broke a different one. The contract had not changed.

**Cause.** Two things at once.

`yarn hardhat:test` sets `HEDERA_FORKING=true`, which loads the Hedera system
contracts forking plugin. That plugin makes `0x167` and `0x16a` *sometimes*
present, so tests written as "there is no precompile here" became order
dependent — the first test to touch `0x167` saw it empty, a later one did not.

Worse, the two layers disagree. `ethers.provider.getCode("0x...167")` returns
code, while the EVM's own `extcodesize` inside the contract sees none. So
detecting the environment gave a different answer depending on which layer was
asked, and branching on it was no more reliable than the original assumption.

**Fix.** Stop testing the environment and test the guarantee instead. The
contract never promised "the precompile is absent" — it promised **the caller
is never handed a bare revert with no reason data**. That holds in both worlds:
the call either succeeds, or it fails with `SystemContractUnreachable` or
`HtsCallFailed`, both of which name themselves.

The general lesson, which cost two rounds to learn: when a test is flaky across
environments, the assertion is usually describing the environment rather than
the behaviour. Assert what must always be true, not what happened to be true on
the machine where it was written.

---

## 13. A brand-new wallet looks like "account does not exist"

**Symptom.** `/acquire` with a freshly generated burner wallet connected: the
profile lookup returned 404 and the UI reported `INVALID_ACCOUNT_ID` — "that
account does not exist on this network". The address was perfectly valid.

**Cause.** On Hedera an EVM address is **not an account** until it first
*receives* HBAR. The network then creates a hollow account for it lazily. Until
that happens the mirror node genuinely has no record, so a new wallet reads as
missing rather than as "balance 0" — which is the opposite of what an Ethereum
developer expects, where any address is queryable and simply returns zero.

**Fix.** Detect it: a 404 for something matching `^0x[0-9a-fA-F]{40}$` is
almost never a typo, it is an unfunded wallet. Surfaced as
`ACCOUNT_NOT_YET_CREATED` with the actual remedy — send it some HBAR.

Worth keeping because it is the first thing a reviewer opening this template
with an empty wallet will hit, and "does not exist" would send them looking for
a bug that is not there.

---

## 14. The wallet-free promise was broken by an early return

**Symptom.** `/acquire` told visitors "the token list, the decimals, and the
live router quote below — needed no wallet at all", while showing none of them.

**Cause.** The component returned early when no wallet was connected, hiding
the picker and the quote behind a connect button. The copy described the
intent; the code did the opposite.

**Fix.** Removed the early return. The quote is a pure `eth_call` and needs no
wallet, so it renders for everyone; only the two buttons that actually sign are
gated. This is the harness rule — *"make the first journey work with no wallet
and no .env"* — and it is easy to violate accidentally, because gating the
whole component is the path of least resistance.

---

## 15. /diagnose recommended a strategy that contradicted its own page

**Symptom.** For account `0.0.2` the page reported "cannot sign EVM
transactions", then recommended a HIP-551 **batch** on the grounds that "the
recipient can sign and pay".

**Cause.** The route passed `recipientCanSign: keyType !== "unknown"` — a proxy
for whether the account *has* a usable key. But `/diagnose` inspects an account
the viewer does **not** control. Whether that account's key works is irrelevant;
what matters is that you cannot ask a stranger to sign anything.

**Fix.** Model it from the sender's side: `recipientCanSign: false`. The
recommendation becomes an HIP-904 airdrop — sender pays, recipient claims —
which is both correct and the more interesting path to demonstrate. The panel
now states the framing explicitly rather than leaving it implicit.

The lesson generalises: a decision function is only as good as the perspective
its inputs are gathered from, and that perspective is rarely stated anywhere.

---

## 16. `extcodesize` is zero for Hedera system contracts — the guard broke everything

**Symptom.** `AssociationProbe` deployed successfully to testnet, and then
every call touching a system contract reverted — including `inspectToken` on
SAUCE, USDC and WHBAR, tokens that obviously exist. All 17 local tests passed.

Decoding the revert data gave the answer immediately:

```
0x4f5aa285 0000…0167   →   SystemContractUnreachable(0x167)
```

The contract was rejecting its own calls.

**Cause.** Hedera's system contracts are **precompiles, not deployed
bytecode**. Inside the EVM, `address(0x167).code.length` is `0` on a live
Hedera network, so the `extcodesize` guard added in #9 rejected every
legitimate call.

What makes this genuinely nasty is that three layers disagree:

| Source | 0x167 | 0x16a |
| --- | --- | --- |
| `eth_getCode` (RPC) | 1 byte | empty |
| `extcodesize` (in EVM) | 0 | 0 |
| Reality | works | works |

Calling `isToken(SAUCE)` directly through `eth_call` returned
`(22 SUCCESS, true)` perfectly. Only the in-contract path failed, which is why
this survived every off-chain probe.

**Fix.** Never test for a Hedera system contract by code size. Use the chain
id, which is the only reliable signal that the precompiles exist:

```solidity
uint256 id = block.chainid;               // 295 mainnet, 296 testnet,
if (id != 295 && id != 296 &&             // 297 previewnet, 298 local
    id != 297 && id != 298) revert SystemContractUnreachable(service);
```

**The wider lesson, which cost two separate bugs.** #11 recorded that
`eth_getCode` and `extcodesize` disagreed under the Hardhat forking plugin, and
it was written off as a plugin quirk. It was not — it was this, showing up
early in a place where it looked harmless. A surprising observation that gets
explained away as a local-tooling artefact is worth one more question, because
the same surprise usually reappears later somewhere expensive.

It also shows the limit of local testing: this contract had 17 passing tests,
full revert-path coverage, and a clean deploy, and was still completely
non-functional on the network it was written for.

---

## 17. `yarn hardhat:verify:testnet` is broken — Sourcify retired the V1 API

**Symptom.**

```
hardhat-verify found one or more errors during the verification process:
Sourcify: A network request failed. This is an error from the block explorer,
not Hardhat. Error: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

The message blames the explorer, so it reads like a Sourcify outage.

**Cause.** It is not an outage. The bundled `@nomicfoundation/hardhat-verify`
2.x calls Sourcify's **V1** API, which has been retired:

```
GET https://sourcify.dev/server/check-all-by-addresses
  -> <!DOCTYPE html> ... Cannot GET /check-all-by-addresses
```

Sourcify's V2 API is healthy and does know about Hedera —
`/v2/contract/296/<address>` returns proper JSON. Only the plugin's route is
gone. The HTML 404 is what the plugin fails to parse, producing the misleading
error above.

The scaffold's own `hardhat.config.ts` comment says verification works "out of
the box" with no custom verifier URL. That was true when it was written.

**Fix.** `yarn hardhat:verify:sourcify <address>` — `scripts/verifySourcify.ts`
posts the Hardhat build-info straight to Sourcify V2 and polls the async job.
Verified `exact_match` on chain 296.

Upgrading the plugin is the other option, but `hardhat-verify` 3.x targets
Hardhat 3, which is a far larger change than one script.

Two details worth keeping:

- **Pick the right build-info.** A project accumulates one per compilation, and
  choosing the wrong one produces a bytecode mismatch rather than an error. The
  script matches on source path and prefers the smallest compilation unit.
- **"Already verified" arrives as a job error**, not as a 409 on submission, so
  it has to be special-cased or an idempotent re-run looks like a failure.

---

## 18. Transaction ids are not in chronological order

**Symptom.** The evidence table came out looking wrong: the airdrop appeared to
happen *after* the claim that depended on it. Reading the transaction ids:

```
airdrop   0.0.10505627@1789836095.256339668
claim     0.0.10505627@1789836093.628534669   <- earlier?
```

**Cause.** A Hedera transaction id embeds the **valid-start timestamp the
client assigned** when it built the transaction, not the moment the network
reached consensus. With transactions built back to back, and the SDK's retry
and node-selection behaviour in between, those client timestamps do not follow
submission order.

The consensus timestamps from the mirror node are strictly ordered, and tell
the true story:

```
1789836099.458  TOKENAIRDROP       transfers = 0   <- pending, nothing moves
1789836100.204  TOKENCLAIMAIRDROP  transfers = 2   <- the claim moves it
```

**Fix.** Order anything user-facing by **consensus timestamp**, read from the
mirror node, never by transaction id. Ids are for addressing a transaction, not
for sequencing.

Worth knowing because the mistake is invisible until someone reads the evidence
carefully — and a table that appears to show an effect preceding its cause is
exactly the kind of thing a reviewer notices and a builder does not.

---

## 19. The harness needs peer dependencies the project must supply

**Symptom.** Tier 2 is configured and `spec.yaml` looks right, but the
Playwright gate cannot run.

**Cause.** `hedera-harness` declares both of the heavy things it needs as
**peerDependencies**, not dependencies:

```json
"peerDependencies": {
  "@hiero-ledger/sdk": "^2.86.2",
  "playwright": "^1.61.1"
}
```

So `npx hedera-harness` installs the harness and none of what the higher tiers
actually use. Tier 2 additionally needs a browser binary, which is a separate
download from the npm package:

```bash
yarn add -D playwright
npx playwright install chromium
```

**Worth knowing.** The harness wants `@hiero-ledger/sdk ^2.86.2` and
scaffold-hbar pins `^2.80.0`, which the committed lockfile resolves to exactly
2.80.0. The caret would permit a satisfying version, but a lockfile install —
what CI and a judge both get — will not move. Nothing is broken today, because
Tier 3.5 is the only tier that touches the SDK and it is not enabled, but
turning that tier on means reconciling the two ranges first rather than
discovering the mismatch inside a run.

**Also.** The gate starts its own dev server on the configured port. A dev
server already running on 3000 from ordinary development makes it fail with a
port conflict that reads like a harness bug.

### And the part that actually blocked it: `npx` cannot see peer dependencies

With `playwright` installed and the config correct, the gate still reported:

```
playwrightGate=false routes=0
- Playwright gate failed before route checks completed
```

No route ever ran, and nothing said why.

The cause is module resolution. `npx hedera-harness` installs the harness into
an npx cache directory, and Node resolves a package's imports from where that
package lives — not from the current working directory. So the harness looks
for `playwright` next to itself in the cache and does not find it:

```
cd <npx cache>/node_modules
node -e "require.resolve('playwright')"
  -> Cannot find module 'playwright'
```

A peer dependency installed in the project is invisible to a package running
out of the npx cache. Tiers 2 and 3.5 can therefore **never** run under
`npx hedera-harness`, no matter how they are configured.

**Fix.** Install the harness in the project so it resolves peers normally:

```bash
yarn add -D hedera-harness
yarn harness:validate
```

`npx hedera-harness` remains fine for Tier 0–1, which needs no peers — and
that is exactly why the failure is easy to miss. The command appears to work,
runs the static checks and every baseline command, reports a tidy summary, and
silently never gets as far as opening a browser.

---

## 20. The contract tests are network-dependent, and only fail under load

**Symptom.** `yarn hardhat:test` passed 17/17 on its own, then failed inside a
harness run minutes later with nothing changed. Re-running by hand passed
again. Classic flake.

The timings gave it away:

```
alone, idle        17 passing (15s)   associateUnchecked... 43ms
inside the harness 17 passing (29s)   associateUnchecked... 5279ms
```

**Cause.** The scaffold's script is:

```
"test": "HEDERA_FORKING=true REPORT_GAS=true hardhat test"
```

`HEDERA_FORKING=true` loads the Hedera system-contracts forking plugin, which
fetches state over the network. So the "local" contract tests are quietly
network-bound. Run alongside a build and a lint they slow by two orders of
magnitude and eventually exceed the timeout.

**Fix.** These tests were deliberately rewritten to be environment-independent
(#11) — they assert that a failure is always *named*, not that a precompile is
present or absent. Forking therefore buys them nothing and costs determinism.

Added `yarn hardhat:test:ci` (`hardhat test`, no forking, no gas reporter) and
pointed the harness validator at it. `yarn hardhat:test` keeps the scaffold's
default so the convention is untouched for anyone who does want a forked chain.

**The general point.** A test suite that reaches the network is not a unit
suite, however it is labelled — and it will pass on a quiet laptop and fail in
CI. This is the second time the same principle came up here: the core library's
live-endpoint tests were split into their own suite for exactly this reason.
The contract tests had the same problem hidden inside an environment variable.

---

## 21. The Tier 2 gate cannot start a server on Windows

**Symptom.** Every Playwright gate run ends the same way:

```
playwrightGate=false routes=0
- Playwright gate failed before route checks completed
  details: Dev server did not report a Local URL within 30000ms.
           Expected output like "Local: http://localhost:3000".
```

The message points at the app, so the obvious readings are all wrong: the
server is too slow, the command is wrong, the port is busy. It is none of them.

**Cause.** `devServer.ts` spawns the server with `detached: true` alongside
`shell: true`. On Windows that combination means the child's stdout never
reaches the pipe, so the harness never sees the line it is waiting for.

Isolated with the harness's own spawn options and its own regex, changing one
flag:

```
detached=false   MATCHED in 4s     175 bytes on stdout
detached=true    NO MATCH in 25s     0 bytes on stdout
```

Two supporting observations. `yarn next:serve` prints
`- Local:        http://localhost:3000` about five seconds in, and the
harness's `/Local:\s*(https?:\/\/[^\s-]+)/i` matches it. And the harness echoes
every server line with a `[hedera-harness:...:server]` prefix — no such line
ever appeared, which is the tell that no output arrived at all rather than that
the wrong output arrived.

The flag is deliberate and reasonable on POSIX: a new process group lets
`stopDevServer` signal `-pid` and tear down the yarn and next grandchildren
together. It just does not compose with `shell: true` on Windows.

**Status.** Not worked around here. The Tier 2 configuration is committed and
correct, which is what gate item G10 asks for, and the underlying requirement —
every route renders, no console errors — was verified directly instead, by
driving a real browser over all seven routes. A judge on macOS or Linux should
find the gate runs as configured.

**Two false leads worth recording**, because both looked conclusive:

- A stale `next` process from earlier work held port 3000, so the spawned
  server failed with `EADDRINUSE` and, sure enough, never printed a Local URL.
  Fixing that changed nothing: the gate still timed out with the port free.
- `next dev` writes into the same `.next` directory as `next build`, and
  running it after a build removes `BUILD_ID`, so `next start` then refuses to
  boot at all. Real, worth knowing, and also not the cause.

**And a naming trap in the scaffold** found while switching the gate to the
production server:

```
next:dev    -> next dev
next:start  -> next dev     <-- not the production server
next:serve  -> next start   <-- this one is
```

`next:start` runs the DEV server. Pointing the gate at `next:start` looks
right, changes nothing, and reintroduces the 30-second compile window.
