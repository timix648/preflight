/**
 * Mirror-node client.
 *
 * The one place this template talks to the mirror REST API. Everything here is
 * a wallet-free read, which is what makes the first journey work with no
 * credentials and no .env at all.
 *
 * Two things this module exists to absorb, both of which bite silently:
 *
 *   1. `decimals` arrives as a STRING ("2", not 2). `10 ** "2"` does not throw
 *      in JavaScript, so an unchecked value propagates as a wrong amount
 *      rather than as an error.
 *   2. Fungible balances come from a periodic balance file, not from live
 *      state, so a balance can legitimately lag a transfer that already
 *      succeeded. Every balance leaves here as a Reading<T> carrying its
 *      timestamp, so the UI can say where the number came from.
 *
 * Framework-free. See AGENTS.md.
 */
import { explain } from "./status";
import { type KeyType, OnboardingError, type Reading, type TokenSummary } from "./types";
import { type Tinybar, type TokenUnits, tinybar, tokenUnits } from "./units";

export const MIRROR_TESTNET = "https://testnet.mirrornode.hedera.com/api/v1";
export const MIRROR_MAINNET = "https://mainnet-public.mirrornode.hedera.com/api/v1";

/** Mirror-node balances lag by roughly this much. Used to explain staleness. */
export const BALANCE_FILE_INTERVAL_SECONDS = 15 * 60;

export interface MirrorOptions {
  /** Defaults to testnet. This template only ever writes to testnet. */
  baseUrl?: string;
  /** Abort a hung read rather than leaving the UI spinning. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** The subset of the account payload this template actually uses. */
export interface MirrorAccount {
  accountId: string;
  evmAddress: string | null;
  alias: string | null;
  keyType: KeyType;
  /** -1 means unlimited. 0 means none. */
  maxAutomaticTokenAssociations: number;
  deleted: boolean;
  hbar: Reading<Tinybar>;
}

export interface MirrorTokenRelationship {
  tokenId: string;
  balance: TokenUnits;
  /** True when the token was received into an automatic slot. */
  automaticAssociation: boolean;
  decimals: number;
}

async function get<T>(path: string, options: MirrorOptions = {}): Promise<T> {
  const { baseUrl = MIRROR_TESTNET, timeoutMs = 10_000, fetchImpl = fetch } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
  } catch (cause) {
    throw new OnboardingError(explain("MIRROR_NODE_UNAVAILABLE"), cause);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) {
    // The mirror node cannot tell us WHICH id was wrong, so the caller
    // decides between INVALID_ACCOUNT_ID and INVALID_TOKEN_ID.
    throw new OnboardingError(explain("NOT_FOUND_404"), { path });
  }
  if (response.status === 429) {
    throw new OnboardingError(explain("RELAY_RATE_LIMITED"), { path });
  }
  if (!response.ok) {
    throw new OnboardingError(explain("MIRROR_NODE_UNAVAILABLE"), {
      path,
      status: response.status,
    });
  }

  return (await response.json()) as T;
}

/**
 * Coerce a mirror-node numeric field that may arrive as a string.
 *
 * Exported because it is the single most useful three lines in this file: the
 * API is inconsistent about which numbers are quoted, and every caller that
 * assumes otherwise produces a wrong number rather than an error.
 */
export function mirrorNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/** "1789769650.947642533" -> 1789769650. Mirror timestamps are seconds.nanos. */
export function mirrorTimestampToSeconds(value: unknown): number {
  if (typeof value !== "string") return Math.floor(Date.now() / 1000);
  const seconds = Number.parseInt(value.split(".")[0] ?? "", 10);
  return Number.isFinite(seconds) ? seconds : Math.floor(Date.now() / 1000);
}

function toKeyType(raw: unknown): KeyType {
  const type = (raw as { _type?: string } | null)?._type;
  switch (type) {
    case "ECDSA_SECP256K1":
      return "ECDSA";
    case "ED25519":
      return "ED25519";
    case "ProtobufEncoded":
      // A threshold key, key list, or contract key. Real and common — roughly
      // one testnet account in ten. It is NOT "unknown": we know exactly what
      // it is, and we know a single ECRECOVER cannot speak for it.
      return "protobuf-encoded";
    default:
      return "unknown";
  }
}

/** Read one account. The backbone of the /diagnose route. */
export async function getAccount(idOrAddress: string, options: MirrorOptions = {}): Promise<MirrorAccount> {
  let raw: Record<string, unknown>;
  try {
    raw = await get<Record<string, unknown>>(`/accounts/${encodeURIComponent(idOrAddress)}?limit=1`, options);
  } catch (error) {
    if (error instanceof OnboardingError && error.explanation.code === "NOT_FOUND_404") {
      throw new OnboardingError(explain("INVALID_ACCOUNT_ID"), error);
    }
    throw error;
  }

  const balance = (raw.balance ?? {}) as Record<string, unknown>;
  const asOf = mirrorTimestampToSeconds(balance.timestamp);
  const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000) - asOf);

  return {
    accountId: String(raw.account ?? idOrAddress),
    evmAddress: (raw.evm_address as string | null) ?? null,
    alias: (raw.alias as string | null) ?? null,
    keyType: toKeyType(raw.key),
    maxAutomaticTokenAssociations: mirrorNumber(raw.max_automatic_token_associations, 0),
    deleted: raw.deleted === true,
    hbar: {
      value: tinybar(mirrorNumber(balance.balance, 0)),
      source: "mirror-node",
      asOf,
      // HBAR balances track live state more closely than token balances, but
      // they still come from the balance file. Flag it once it is genuinely old.
      mayBeStale: ageSeconds > BALANCE_FILE_INTERVAL_SECONDS,
    },
  };
}

/**
 * Is this account able to hold this token right now?
 *
 * Returns the relationship, or null when there is none — which is precisely
 * the condition that produces TOKEN_NOT_ASSOCIATED_TO_ACCOUNT on transfer.
 */
export async function getTokenRelationship(
  accountId: string,
  tokenId: string,
  options: MirrorOptions = {},
): Promise<MirrorTokenRelationship | null> {
  const raw = await get<{ tokens?: Record<string, unknown>[] }>(
    `/accounts/${encodeURIComponent(accountId)}/tokens?token.id=${encodeURIComponent(tokenId)}&limit=1`,
    options,
  );

  const entry = raw.tokens?.[0];
  if (!entry) return null;

  return {
    tokenId: String(entry.token_id ?? tokenId),
    balance: tokenUnits(mirrorNumber(entry.balance, 0)),
    automaticAssociation: entry.automatic_association === true,
    decimals: mirrorNumber(entry.decimals, 0),
  };
}

/** Token metadata, including the decimals nothing may assume. */
export async function getToken(tokenId: string, options: MirrorOptions = {}): Promise<TokenSummary> {
  let raw: Record<string, unknown>;
  try {
    raw = await get<Record<string, unknown>>(`/tokens/${encodeURIComponent(tokenId)}`, options);
  } catch (error) {
    if (error instanceof OnboardingError && error.explanation.code === "NOT_FOUND_404") {
      throw new OnboardingError(explain("INVALID_TOKEN_ID"), error);
    }
    throw error;
  }

  const id = String(raw.token_id ?? tokenId);
  return {
    tokenId: id,
    // A token's EVM address is always the long-zero form of its id.
    evmAddress: `0x${id
      .split(".")
      .map((part, index) =>
        BigInt(part)
          .toString(16)
          .padStart(index === 0 ? 8 : 16, "0"),
      )
      .join("")}`,
    symbol: String(raw.symbol ?? ""),
    name: String(raw.name ?? ""),
    // Quoted in the API response. Coerced here so no caller sees a string.
    decimals: mirrorNumber(raw.decimals, 0),
  };
}

/** Pending HIP-904 airdrops waiting for this account to claim or reject. */
export async function getPendingAirdrops(
  accountId: string,
  options: MirrorOptions = {},
): Promise<{ tokenId: string; senderId: string; amount: TokenUnits }[]> {
  const raw = await get<{ airdrops?: Record<string, unknown>[] }>(
    `/accounts/${encodeURIComponent(accountId)}/airdrops/pending?limit=25`,
    options,
  );

  return (raw.airdrops ?? []).map(entry => ({
    tokenId: String(entry.token_id ?? ""),
    senderId: String(entry.sender_id ?? ""),
    amount: tokenUnits(mirrorNumber(entry.amount, 0)),
  }));
}
