# Verified test fixtures

Real testnet data, re-probed on day 1 and day 8. Unit tests should use these
rather than invented strings — a hand-written "long-zero-looking" address does
not prove the classifier works on a real one.

## Accounts

### `0.0.2` — the free long-zero / ED25519 fixture

```
account:                          0.0.2
evm_address:                      0x0000000000000000000000000000000000000002
key type:                         ED25519
max_automatic_token_associations: 0
```

Verified against `https://testnet.mirrornode.hedera.com/api/v1/accounts/0.0.2`
on 18 September 2026.

This one account exercises four traps at once, and it is permanent — no need to
create and fund anything:

| Trap | What `0.0.2` proves |
| --- | --- |
| #2 address duality | `evm_address` is long-zero: `0x` + 12 zero bytes + account number. `classifyAddress()` must return `evm-long-zero`. |
| #2 ECRECOVER | Long-zero is derived from the account id, not a public key, so `ecrecoverCompatible` must be `false`. |
| #3 key types | `ED25519`, so `verificationRouteFor()` must return `is-authorized`, never `ecrecover`. |
| #1 association | `max_automatic_token_associations: 0` — zero free slots is the exact precondition for `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`. |

The build plan listed "long-zero test data hard to find" as a risk and budgeted
day 2 to create an account deliberately. Not needed.

### More live fixtures — found by scanning the account list

A single page of recent testnet accounts turned up every remaining case, so
nothing has to be created or funded for unit tests:

| Account | Key type | Address form | Slots | Proves |
| --- | --- | --- | --- | --- |
| `0.0.2` | ED25519 | long-zero | 0 | the negative ECRECOVER case |
| `0.0.1000` | ED25519 | long-zero | 0 | encoding: 1000 -> 0x3e8 |
| `0.0.10608004` | ECDSA_SECP256K1 | **from-key** | **-1** | the POSITIVE case: `ecrecoverCompatible: true`, and unlimited HIP-23 slots |
| `0.0.10604882` | ProtobufEncoded | long-zero | 0 | threshold/key-list keys are real |
| `0.0.10605445` | null | from-key | -1 | accounts with no readable key exist |

Two key types here are absent from the build plan's `KeyType` union and both
are common — roughly 12% of that sample. `ProtobufEncoded` matters because no
single ECRECOVER can speak for a threshold key, so it must route to
`isAuthorized` rather than be treated as ECDSA.

**Durability warning.** Low-numbered system accounts (`0.0.2`, `0.0.1000`)
survive a testnet reset because the network recreates them. High-numbered user
accounts do NOT. Unit tests therefore hardcode the *values* rather than fetching
these accounts; only the integration suite reads them live, and it uses `0.0.2`.

## Endpoints

| Endpoint | Status 18 Sep 2026 | Notes |
| --- | --- | --- |
| `testnet.mirrornode.hedera.com` | HTTP 200 | |
| `testnet.hashio.io/api` | `relay/0.78.5` | chain id 296 |
| `test-api.saucerswap.finance/stats` | HTTP 200 | 964,735 swaps, $787,719 TVL — live and growing |
| `test-api.saucerswap.finance/tokens` | HTTP 200 | real token metadata with per-token `decimals` |

## Relay limits — read live, do not hardcode

`relay.ts` must fetch these from `/config`. Values observed 18 Sep 2026:

```
PAYMASTER_ENABLED               false     <- no gasless path exists
ETH_GET_LOGS_BLOCK_RANGE_LIMIT  1000      <- not unlimited
DEFAULT_RATE_LIMIT              200
CALL_DATA_SIZE_LIMIT            131072
CHAIN_ID                        296
```

`PAYMASTER_ENABLED: false` is the evidence behind the "no gasless" non-goal.
It is switched off on the relay a judge will actually use.
