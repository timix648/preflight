# Handover — Preflight

Everything needed to run this, read it, and finish it. Source only: no
`node_modules`, no build output, no credentials.

Updated 20 September 2026.

## Run it

```bash
# Yarn 3 is vendored in .yarn/releases, so no global install is needed.
node .yarn/releases/yarn-3.2.3.cjs install
node .yarn/releases/yarn-3.2.3.cjs next:dev
```

Open <http://localhost:3000>. First compile takes a few minutes; after that it
is fast.

**You need nothing else for the frontend.** No wallet, no key, no `.env`. The
home page and `/diagnose` are Server Components reading live Hedera testnet
data, and the router quote on `/acquire` is a plain `eth_call`. Only *signing*
needs a wallet.

If `yarn` is already on your PATH at v3+, plain `yarn install` works too. On
Windows `corepack enable` needs Administrator rights — the vendored binary
above avoids that.

## What this is

**Preflight** — *"Run preflight before the transfer."* A scaffold-hbar external
template. Users acquire and hold any Hedera token without ever hitting
`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`.

The product is **not** "association is hard". Hedera shipped three protocol
changes at that problem and produced **four mechanisms with no guidance on
which to use when**. This template implements all four behind one API that
picks correctly and explains its choice in a sentence the UI renders.

| Route | Wallet? | What it does |
| --- | --- | --- |
| `/` | no | Relay limits from the undocumented `/config`, SaucerSwap stats, a decimals histogram over 587 tokens, the architecture, and **the three-beat proof** |
| `/diagnose` | no | Paste an account — try `0.0.2`, then `0.0.10608004`. Address form, ECRECOVER safety, key type, slots, and **all four mechanisms judged against that account** |
| `/acquire` | to sign | Token picker, real router quote, then associate → swap |
| `/debug` | yes | Ships with scaffold-hbar; kept deliberately |

## Where the code lives

```
packages/nextjs/lib/onboarding/    the core. NOTHING here imports React.
packages/nextjs/app/               routes
packages/nextjs/components/onboarding/
packages/hardhat/contracts/        AssociationProbe.sol
.harness/                          validator recipes
```

Start with `lib/onboarding/association.ts`. Two functions matter:

- **`selectStrategy()`** — pure. Picks one of four mechanisms and returns a
  sentence explaining the choice, which the UI renders verbatim.
- **`evaluateStrategies()`** — pure. Judges *all four* against a situation for
  `/diagnose`, including the ones that do not apply and why.

They share one `StrategyContext` and are cross-checked by tests, so the
recommendation and the four-candidate panel cannot drift apart.

## Before you change anything

Read `AGENTS.md`. It is short and it is the briefing — hook names, the
framework-free rule, system contract addresses, SDK choice, the SaucerSwap
gotchas, and the non-goals. Every trap it lists was actually hit.

`NOTES-failures.md` is 21 real failures with causes and fixes. If something
behaves strangely, check there first.

**Note the non-goals, particularly the last one: never `git push`, create a
remote, open a PR, or change repository visibility. Publication is the project
owner's decision alone.**

## Checks — all four must pass

```bash
node .yarn/releases/yarn-3.2.3.cjs lint
node .yarn/releases/yarn-3.2.3.cjs next:test        # 113 unit tests, offline
node .yarn/releases/yarn-3.2.3.cjs hardhat:test:ci  # 17 contract tests
node .yarn/releases/yarn-3.2.3.cjs next:build
```

Live-endpoint tests are deliberately separate so the normal suite never fails
because testnet was slow:

```bash
node .yarn/releases/yarn-3.2.3.cjs workspace @sh/nextjs test:live
```

All four passed as of 20 September 2026.

## State of play

### Done

- Core library, all eight traps, framework-free, 113 tests
- All four association mechanisms, each proven on-chain
- `AssociationProbe.sol` deployed and Sourcify-verified, 17 tests
- 18 verifiable testnet transactions in `EVIDENCE.md`, including the failures
- Three-beat proof panel on `/` — elapsed time derived from consensus
  timestamps at render, never hard-coded
- Four-candidate panel on `/diagnose`
- Signal theme (single-file DaisyUI replacement, fonts embedded as WOFF2)
- README, `AGENTS.md`, `NOTES-failures.md`
- Harness recipe, Tiers 0–2
- Git initialised, 9 commits, **no remote**

### Outstanding, and who can do it

| # | Item | Blocked on |
| --- | --- | --- |
| 1 | **README create command** says `<org>/preflight`. The GitHub repo must be created with **exactly** that name or gate item G1 fails. | the org name |
| 2 | **Logo** — `preflight-mark.svg` and `-dark.svg` are placeholders (concept 03). The approved flowing check-arrow needs exporting from the design tool. | design export |
| 3 | **Demo video** — not started. Highest-value remaining item. The brief names "the demo recording" as a deliverable but states **no required length**, so pick one that suits the material; the fail → associate → succeed sequence is already captured. | anyone |
| 4 | **`/acquire` end-to-end evidence** — a real swap signed in a browser with a funded wallet. `EVIDENCE.md` lists it as outstanding. | a funded wallet |
| 5 | **Harness Tier 3.5** — more than the two env vars this row used to claim. `chainValidation` only executes under `validate-semantic`; plain `validate` never reaches it. That path also requires `validator.enabled: true` and `spec.contract` — absent here — and runs the agent, which is billed. The operator vars are necessary but nowhere near sufficient. | a decision about scope and cost |
| 6 | **Debug Contracts** and the wallet modal have had no visual pass under the new theme. | anyone |
| 7 | **Clean-machine scaffold test** — the real G1 check. Impossible until the repo is public. | the public repo |
| 8 | Hedera's official **self-check script** for the gate was promised for the week before the build window. Watch for it and run it before submitting. | Hedera |

## If you want to deploy or sign

You need your own **ECDSA** account from <https://portal.hedera.com> — not
ED25519, which has no EVM address and fails against every EVM tool. Fund it at
the faucet, then:

```bash
node .yarn/releases/yarn-3.2.3.cjs hardhat:account:import
```

That prompts for the key and a password and stores it **encrypted** in
`packages/hardhat/.env`, which is gitignored. No key is in this archive and
none should ever be committed.

The contracts are already deployed and source-verified on testnet, so you only
need this to deploy your own:

- working: [`0.0.10620620`](https://hashscan.io/testnet/contract/0.0.10620620)
- the broken predecessor, kept on purpose:
  [`0.0.10620483`](https://hashscan.io/testnet/contract/0.0.10620483)

Both are verified and differ by one line. `NOTES-failures.md` #16 explains why
that pair is the most interesting thing in the repository.

## What was left out of this archive

`node_modules`, `.next`, `.yarn/cache`, Hardhat `artifacts`/`cache`,
`typechain-types` — all regenerated by `install` and `build`. Also `.env`,
which is gitignored and local to each machine.

**Git history is NOT in this archive.** It was produced with `git archive`,
which exports the committed tree and nothing else — that is deliberate, since
it cannot leak an ignored file by accident. The source repository has ten
commits and **no remote configured**; it has never been pushed anywhere.

If you want the history, ask for the `.git` directory separately. Otherwise
start a fresh repository:

```bash
git init
git add -A && git commit -m "Import Preflight handover"
```

Whichever you do: **do not add a remote or push.** Publication is the project
owner's decision, and the repository name matters — the README's create
command points at `<org>/preflight`, and the GitHub repo must be created with
exactly that name or eligibility gate item G1 fails.
