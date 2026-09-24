# Preflight — a walkthrough

Written for a developer picking this up cold. Follow it top to bottom and you
will have seen everything the template does and why.

**What it is:** a scaffold-hbar template for Hedera testnet. Users acquire and
hold any token without ever hitting `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`.

Hedera shipped three protocol changes at the association problem and produced
**four mechanisms with no guidance on which to use when**. This implements all
four behind one API that picks correctly and says why, in a sentence the UI
renders.

---

## Setup

**`yarn` is almost certainly not on your PATH, and that is fine.** Yarn 3 is
vendored in the repository. Use this form everywhere you would write `yarn`:

```bash
node .yarn/releases/yarn-3.2.3.cjs install
node .yarn/releases/yarn-3.2.3.cjs next:dev
```

Open <http://localhost:3000>. First compile takes a few minutes.

Do **not** run `corepack enable` on Windows — it writes into the Node install
directory and needs Administrator.

### Dev server or production server

Once built, `next:serve` starts in about three seconds and is better if you
only want to look at the app. The script names are the reverse of what they
sound like, which has already caused a bug here:

| Script           | What it actually runs         |
| ---------------- | ----------------------------- |
| `next:dev`       | `next dev`                    |
| **`next:serve`** | **`next start`** — production |
| `next:start`     | `next dev`, despite the name  |

**Nothing below needs a wallet, a key or a `.env` until you reach signing.**

---

## 1. Home — `/`

**The three-beat proof** is the first thing on the page: the same transfer
failing, the kit associating, then the same transfer succeeding — 2.4 seconds
apart. Each links to HashScan. Open the first one: it moved **zero** tokens and
the sender still paid the fee. That is the problem this template removes,
stated by the ledger rather than by a README.

The elapsed time is computed from the consensus timestamps at render, not
hard-coded.

**Scroll down.** Numbers count up from zero, histogram bars grow.

**"What this relay will actually let you do"** is read live from the relay's
undocumented `/config` endpoint. None of those values appear in Hedera's
documentation.

Worth testing: the `relay/0.78.5` badge appears **only** when the relay
genuinely answered. Turn off your network and reload — the badge disappears
and the prose changes to say these are last-observed values and **not** a live
reading. That honesty is deliberate; the page previously claimed "read live"
while showing compiled-in constants, which is the exact mistake the template
argues against.

---

## 2. Diagnose — `/diagnose`

Paste any Hedera account id or EVM address. No wallet. Four examples are one
click away:

| Account        | What it demonstrates                                         |
| -------------- | ------------------------------------------------------------ |
| `0.0.2`        | ED25519, long-zero address, ECRECOVER unsafe, zero slots     |
| `0.0.10608004` | ECDSA, key-derived address, unlimited slots                  |
| `0.0.10604882` | Threshold key — no single recovered address can speak for it |
| `0.0.10622718` | **`0 free of 1`** — the ceiling is used up                   |

**Start with `0.0.2`.** Note that ECRECOVER does not _fail_ on it — it returns
a **different, valid-looking address**. Code comparing the two rejects a
legitimate signature and cannot explain why.

**Then `0.0.10622718`, which is the important one.** Its ceiling is 1 and the
slot is already occupied, so it reads `0 free of 1` and the kit must **not**
choose auto-slot. The other three all have ceiling equal to free, which is
precisely why a bug reporting the ceiling as availability stayed invisible.

**Scroll down on any account.** All four mechanisms are judged against that
specific account — including the ones that do not apply, and why. Exactly one
is marked chosen.

---

## 3. Acquire — `/acquire`

Everything up to the quote works with **no wallet connected**.

1. Pick **SAUCE** (`0.0.1183558`), enter `1`. You get roughly **54.96 SAUCE**.
2. Read the comparison: **"Router (what you will actually get)"** against
   **"Published price feed says"**, and the divergence between them — measured
   above 10% at times. Quotes come from the router, never the feed. Quoting one
   and executing the other looks like a bug in your code.
3. **Change 1 to 10.** The previous figure is never relabelled with the new
   amount — you get a pending state, then the correct quote. It used to show
   `10 ℏ → <the 1 HBAR answer>`, a plausible number that was wrong by 10×.
4. **Try token `0.0.1418651`.** No direct pool exists, so it says so in a
   sentence rather than surfacing `INVALID_PATH`.

Note the picker shows `SYMBOL · 0.0.x · Ndp` for every token. Symbols are not
unique on Hedera: the testnet list contains **five** tokens whose symbol is
`HBAR`, one of them at **0 decimals** and actually named something else.

### To sign

Connect an EVM wallet — MetaMask or OKX. Add the network:

| Field    | Value                           |
| -------- | ------------------------------- |
| Network  | Hedera Testnet                  |
| Chain ID | **296**                         |
| RPC      | `https://testnet.hashio.io/api` |
| Symbol   | HBAR                            |
| Decimals | **18**                          |
| Explorer | `https://hashscan.io/testnet`   |

The account must be **ECDSA**. ED25519 has no EVM address and cannot sign
here — that is what `/diagnose?account=0.0.2` is showing you.

Then **associate**, then **swap**. Step 2 stays disabled until step 1
completes, because calling the router before associating is the exact failure
this template removes — it is enforced, not advised.

The swap reports success only once the **receipt** exists. "The wallet returned
a hash" is a different claim, and a reverted swap would look identical.

---

## 4. Debug Contracts — `/debug`

Scaffold's contract console, kept because `AssociationProbe`
([`0.0.10620620`](https://hashscan.io/testnet/contract/0.0.10620620)) is worth
poking at directly.

### Reads — no wallet needed

`isLongZero`:

| Paste                                        | Result                                   |
| -------------------------------------------- | ---------------------------------------- |
| `0x0000000000000000000000000000000000000002` | **`true`** — resolves to `0.0.2`         |
| `0x574c17b6d34ffb8e2993645b32f773963fc77a53` | **`false`** — resolves to `0.0.10608004` |

The contract reaches the same conclusion on-chain that `/diagnose` renders in
prose.

### Writes — about 0.79 HBAR each

Use SAUCE as an EVM address: `0x0000000000000000000000000000000000120f46`

The interesting pair, and the reason this contract exists:

- **`associateSelf`** checks the HTS response code and reverts on failure.
- **`associateUnchecked`** does not. HTS returns an `int64` rather than
  reverting, so a **failed association produces a successful transaction that
  did nothing at all**. Green in the explorer, and wrong.

Run both and compare them on HashScan. Two green transactions, one of which
accomplished nothing — indistinguishable without reading the return value.

It associates the token to **the contract**, not to you. A contract cannot
associate a token to someone else's account without their signature.

**Ignore** the warning _"No Hedera account found for this EVM address"_. SAUCE
is a token, so it will never appear under `/accounts/`. It does not block Send.
If Send is greyed out, your wallet is not connected on that page.

### System contracts

The panel also lists **HAS at `0x16a`** and **HTS at `0x167`**. `isAuthorized`
lives on HAS, not HTS — a confusion that produces code calling the wrong
contract entirely.

---

## 5. Block Explorer — `/blockexplorer`

Scaffold's explorer indexes a **local** chain by reading blocks over RPC. There
is no local chain here, and a browser tab cannot index Hedera — the mirror node
is the index and HashScan is its UI. So the page says so.

Rather than stop there, it lists what this template has actually put on
testnet, every row linking to HashScan:

- the deployed contracts, read from `deployedContracts` so they cannot go stale
- the three-beat proof with each transaction's real status — the failure in
  red, the two successes in green
- both evidence accounts

It is a "do not take our word for it" page.

---

## Checks

```bash
node .yarn/releases/yarn-3.2.3.cjs lint
node .yarn/releases/yarn-3.2.3.cjs next:test        # 144 unit, offline
node .yarn/releases/yarn-3.2.3.cjs hardhat:test:ci  # 17 contract
node .yarn/releases/yarn-3.2.3.cjs next:build
node .yarn/releases/yarn-3.2.3.cjs workspace @sh/nextjs test:live   # 14 live
```

Live-endpoint tests are a separate suite on purpose. A unit suite that fails
because testnet was slow teaches people to ignore red.

### The bounty's own gate

Currently `passed=true`, 0 findings, 7/7 routes.

```bash
node .yarn/releases/yarn-3.2.3.cjs harness:validate
```

Three things that will otherwise cost you an afternoon:

1. **Stop the dev server.** The gate starts its own production server on port 3000. If something holds that port, it fails with only `routes=0`, which
   reads like a broken app.
2. **Move `packages/hardhat/.env` aside.** The static gate lists that path as
   forbidden and scans the **working tree**, not what git tracks. Put it back
   after.
3. **If Chromium will not launch** — Windows SmartScreen commonly blocks the
   downloaded binary with `spawn UNKNOWN` — run with
   `PLAYWRIGHT_BROWSERS_PATH=<an empty directory>` to take the system-Chrome
   fallback.

---

## Rules

- **Never `git push`, add a remote, open a PR, or change repository
  visibility.** Publication is the project owner's decision alone. Local
  commits are always fine.
- **`lib/onboarding/` must never import React, Next.js or wagmi.** That is what
  lets the core run from a route handler, a script, a test, or another
  framework. Violating it is the worst thing you can do to this codebase.
- The SDK is **`@hiero-ledger/sdk`**, not `@hashgraph/sdk`.
- Hooks are `useScaffoldReadContract` / `useScaffoldWriteContract` — **not**
  the older `useScaffoldContractRead` naming most models emit from memory.

## Read these

| File                | Why                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `AGENTS.md`         | The briefing. Short, and every trap in it was actually hit.                                |
| `NOTES-failures.md` | 21 real failures with causes and fixes. Check here first when something behaves strangely. |
| `EVIDENCE.md`       | Every claim backed by a transaction you can open.                                          |
| `README.md`         | The full picture, including a table that lets you falsify each claim.                      |
