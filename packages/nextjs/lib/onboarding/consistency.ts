/**
 * Trap #6 — read consistency.
 *
 * Hedera exposes the same balance through two sources that disagree, and the
 * disagreement is normal rather than a bug:
 *
 *   mirror node   REST, wallet-free, but fungible balances are built from a
 *                 periodic balance file. A balance can lag a transfer that
 *                 already succeeded.
 *   JSON-RPC      live consensus state, but needs a relay, is rate limited,
 *                 and speaks weibar (18dp) rather than tinybar (8dp).
 *
 * A developer who reads the mirror node straight after a successful transfer
 * sees the OLD balance, concludes the transfer failed, and retries — which is
 * how double-spends get written. This module makes the disagreement visible
 * instead of hiding it: every value carries its source and whether it may be
 * stale, and the UI shows a badge rather than asserting a number.
 *
 * Framework-free. See AGENTS.md.
 */
import { type MirrorOptions, getAccount, getTokenRelationship } from "./mirror";
import { RELAY_TESTNET, type RelayOptions } from "./relay";
import type { Reading } from "./types";
import { type Tinybar, type TokenUnits, tokenUnits, weibar, weibarToTinybar } from "./units";

/** A reading from each source, plus whether they agree. */
export interface Reconciliation<T> {
  mirror: Reading<T> | null;
  rpc: Reading<T> | null;
  /** True when both answered and agreed exactly. */
  agree: boolean;
  /**
   * The value to show. Prefers the live source when they disagree, because a
   * user acting on a balance needs the current one.
   */
  preferred: Reading<T>;
  /** One sentence for the UI explaining what the reader is looking at. */
  explanation: string;
}

/** HBAR balance from the mirror node. Wallet-free; may lag. */
export async function readHbarFromMirror(accountId: string, options: MirrorOptions = {}): Promise<Reading<Tinybar>> {
  const account = await getAccount(accountId, options);
  return account.hbar;
}

/** HBAR balance from the relay. Live, but needs a relay and speaks weibar. */
export async function readHbarFromRpc(evmAddress: string, options: RelayOptions = {}): Promise<Reading<Tinybar>> {
  const { baseUrl = RELAY_TESTNET, timeoutMs = 8_000, fetchImpl = fetch } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${baseUrl}/api`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [evmAddress, "latest"],
      }),
    });

    const body = (await response.json()) as { result?: string };
    // eth_getBalance returns weibar (18dp). Converting to tinybar is lossy by
    // construction, so the remainder is discarded deliberately here: sub-tinybar
    // dust cannot exist on Hedera and only appears through this conversion.
    const raw = BigInt(body.result ?? "0x0");
    const { value } = weibarToTinybar(weibar(raw));

    return {
      value,
      source: "json-rpc",
      asOf: Math.floor(Date.now() / 1000),
      mayBeStale: false, // live consensus state
    };
  } finally {
    clearTimeout(timer);
  }
}

/** A token balance from the mirror node. */
export async function readTokenFromMirror(
  accountId: string,
  tokenId: string,
  options: MirrorOptions = {},
): Promise<Reading<TokenUnits>> {
  const [account, relationship] = await Promise.all([
    getAccount(accountId, options),
    getTokenRelationship(accountId, tokenId, options),
  ]);

  return {
    value: relationship?.balance ?? tokenUnits(0n),
    source: "mirror-node",
    asOf: account.hbar.asOf,
    // Always true, and not a placeholder. Unlike HBAR, fungible TOKEN balances
    // are only ever published through the periodic balance file, so there is no
    // age at which this reading becomes authoritative. The honest answer is
    // that it may lag, every time.
    mayBeStale: true,
  };
}

/**
 * Read HBAR from both sources and say plainly whether they agree.
 *
 * Never throws when only one source answers — a page that cannot render
 * because the relay is rate limited is worse than a page that says which
 * source it used.
 */
export async function reconcileHbar(
  accountId: string,
  evmAddress: string,
  options: { mirror?: MirrorOptions; relay?: RelayOptions } = {},
): Promise<Reconciliation<Tinybar>> {
  const [mirrorResult, rpcResult] = await Promise.allSettled([
    readHbarFromMirror(accountId, options.mirror),
    readHbarFromRpc(evmAddress, options.relay),
  ]);

  const mirror = mirrorResult.status === "fulfilled" ? mirrorResult.value : null;
  const rpc = rpcResult.status === "fulfilled" ? rpcResult.value : null;

  if (!mirror && !rpc) {
    throw (mirrorResult as PromiseRejectedResult).reason ?? (rpcResult as PromiseRejectedResult).reason;
  }

  const agree = Boolean(mirror && rpc) && (mirror!.value as bigint) === (rpc!.value as bigint);

  // Prefer live state when the two disagree: a user about to spend needs the
  // balance that will actually be checked.
  const preferred = rpc ?? mirror!;

  return {
    mirror,
    rpc,
    agree,
    preferred,
    explanation: describeReconciliation(mirror, rpc, agree),
  };
}

function describeReconciliation<T>(mirror: Reading<T> | null, rpc: Reading<T> | null, agree: boolean): string {
  if (mirror && rpc && agree) {
    return "Mirror node and JSON-RPC agree. This balance is settled.";
  }
  if (mirror && rpc && !agree) {
    return "The mirror node and the relay disagree. This is normal shortly after a transfer: mirror-node balances come from a periodic file, while the relay reads live state. Showing the live value.";
  }
  if (rpc && !mirror) {
    return "Live value from the relay. The mirror node did not answer, so there is nothing to reconcile against.";
  }
  return "From the mirror node, which builds fungible balances from a periodic file. A very recent transfer may not appear here yet.";
}

/** Short badge text for a value, so the UI never asserts an unqualified number. */
export function sourceBadge<T>(reading: Reading<T>): {
  text: string;
  tone: "live" | "lagging";
} {
  if (reading.source === "json-rpc") {
    return { text: "live", tone: "live" };
  }
  return {
    text: reading.mayBeStale ? "mirror node · may lag" : "mirror node",
    tone: reading.mayBeStale ? "lagging" : "live",
  };
}
