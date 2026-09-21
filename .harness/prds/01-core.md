# PRD 01 — Core library

Build `packages/nextjs/lib/onboarding/` against the interface contract already
committed at `lib/onboarding/types.ts`. **That file is the contract. Import
from it; do not redefine its shapes.**

## Hard rule

This directory must stay framework-free. No React, no Next.js, no wagmi, no
hooks. It must run from a route handler, a script, or a plain test.

## Modules

| Module | Exports | Notes |
| --- | --- | --- |
| `address.ts` | `toEvmAddress`, `toAccountId`, `classifyAddress` | Must detect long-zero form and set `ecrecoverCompatible: false`. Tests need a real long-zero example. |
| `keys.ts` | `detectKeyType`, `verificationRouteFor` | Reads key type from the mirror node. **Never caches** — keys rotate. |
| `association.ts` | `associationState`, `ensureAssociated`, one function per path | The centrepiece. Each of the four paths needs its own testnet integration test. |
| `units.ts` | `tinybarToHbar`, `hbarToWei`, `toTokenUnits`, `fromTokenUnits` | Branded types, so an 8-decimal value cannot be passed where 18 is expected. |
| `status.ts` | `explain(code) => StatusExplanation` | Start with the eight codes actually hit. Do not enumerate the protocol. |
| `consistency.ts` | `readBalance() => Reading<T>` | Returns value + source + `mayBeStale`. |
| `relay.ts` | `fetchRelayConfig`, `relayLimits` | One fetch of `/config`. Must work against any relay. |

## The four association paths

1. **Explicit** — `TokenAssociateTransaction`. Recipient signs and pays. 2 approvals.
2. **Auto-slot** — HIP-23 `setMaxAutomaticTokenAssociations(-1)` for unlimited.
3. **Airdrop** — HIP-904 `TokenAirdropTransaction`; the **sender** pays. Falls
   back to a pending airdrop that the recipient `TokenClaimAirdropTransaction`
   accepts or `TokenRejectTransaction` declines.
4. **Batch** — HIP-551 atomic associate + transfer, one approval.

### SDK support — VERIFIED 18 September 2026

The SDK is **`@hiero-ledger/sdk` ^2.80.0**, not `@hashgraph/sdk`. Hiero is the
Linux Foundation's renamed Hedera SDK and is what scaffold-hbar ships. Use the
Hiero package name everywhere.

Every class all four paths need is exported by 2.80.0, checked against the
published type surface:

| Class | Path | Present |
| --- | --- | --- |
| `TokenAssociateTransaction` | 1 explicit | yes |
| `AccountUpdateTransaction` | 2 auto-slot | yes |
| `TokenAirdropTransaction` | 3 airdrop | yes |
| `TokenClaimAirdropTransaction` | 3 airdrop | yes |
| `TokenRejectTransaction` | 3 airdrop | yes |
| `TokenCancelAirdropTransaction` | 3 airdrop | yes |
| `PendingAirdropId` | 3 airdrop | yes |
| `BatchTransaction` | 4 batch | yes |

No path needs to be documented as a limitation. `TokenCancelAirdropTransaction`
is a bonus the plan did not account for — the sender withdrawing a pending
airdrop is a sixth evidence link and a real case the decision tree should cover.

## Acceptance

- `ensureAssociated()` picks a strategy and populates `reason` with a human
  sentence explaining why, every time.
- Every thrown error is an `OnboardingError` carrying a `StatusExplanation`.
- No module imports React.
