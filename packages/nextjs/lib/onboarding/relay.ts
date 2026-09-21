/**
 * Trap #8 — relay limits.
 *
 * The JSON-RPC relay publishes its real configuration at an undocumented,
 * unauthenticated /config endpoint. Nothing in the Hedera docs lists these
 * values, and several of them contradict what a developer coming from
 * Ethereum would assume:
 *
 *   ETH_GET_LOGS_BLOCK_RANGE_LIMIT  1000    not unlimited
 *   DEFAULT_RATE_LIMIT              200     per IP, per window
 *   CALL_DATA_SIZE_LIMIT            131072  128 KiB
 *   PAYMASTER_ENABLED               false   there is no gasless path
 *
 * Reading them live rather than hardcoding them means the template stays
 * correct against a self-hosted relay, and it means the app can TELL a
 * developer why their eth_getLogs over 5000 blocks came back empty.
 *
 * ---------------------------------------------------------------------------
 * EVERY VALUE IN /config IS A STRING.
 *
 * PAYMASTER_ENABLED is the string "false", and "false" is truthy in
 * JavaScript. `if (config.PAYMASTER_ENABLED)` is true on a relay where the
 * paymaster is switched off. That is the exact shape of bug this module
 * exists to absorb.
 * ---------------------------------------------------------------------------
 *
 * Framework-free. See AGENTS.md.
 */
import { explain } from "./status";
import { OnboardingError, type RelayLimits } from "./types";

export const RELAY_TESTNET = "https://testnet.hashio.io";
export const RELAY_MAINNET = "https://mainnet.hashio.io";

/** Values observed on Hashio testnet, used only when /config is unreachable. */
const FALLBACK: Omit<RelayLimits, "version"> = {
  chainId: 296,
  getLogsBlockRangeLimit: 1000,
  defaultRateLimit: 200,
  callDataSizeLimit: 131072,
  paymasterEnabled: false,
};

export interface RelayOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Parse a /config value that is always a string.
 *
 * "1000" -> 1000. Anything unparseable falls back rather than producing NaN,
 * because NaN silently poisons every comparison it touches.
 */
export function configNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/**
 * Parse a /config boolean that is always a string.
 *
 * The whole reason this function exists: Boolean("false") === true.
 */
export function configBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalised = value.trim().toLowerCase();
    if (normalised === "true") return true;
    if (normalised === "false") return false;
  }
  return fallback;
}

/** The raw /config map. 146 keys on Hashio testnet as of 18 Sep 2026. */
export async function fetchRelayConfig(options: RelayOptions = {}): Promise<Record<string, unknown>> {
  const { baseUrl = RELAY_TESTNET, timeoutMs = 8_000, fetchImpl = fetch } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${baseUrl}/config`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (response.status === 429) {
      throw new OnboardingError(explain("RELAY_RATE_LIMITED"), { baseUrl });
    }
    if (!response.ok) {
      throw new OnboardingError(explain("RELAY_UNAVAILABLE"), {
        baseUrl,
        status: response.status,
      });
    }
    return (await response.json()) as Record<string, unknown>;
  } catch (cause) {
    if (cause instanceof OnboardingError) throw cause;
    throw new OnboardingError(explain("RELAY_UNAVAILABLE"), cause);
  } finally {
    clearTimeout(timer);
  }
}

/** The relay's version string, e.g. "relay/0.78.5". */
export async function fetchRelayVersion(options: RelayOptions = {}): Promise<string> {
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
        method: "web3_clientVersion",
        params: [],
      }),
    });
    const body = (await response.json()) as { result?: string };
    return body.result ?? "unknown";
  } catch {
    // A missing version string is cosmetic; never fail a page over it.
    return "unknown";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The relay's limits, typed and coerced.
 *
 * Works against any relay, including a self-hosted one, which is why nothing
 * here is hardcoded. Falls back to observed Hashio values rather than throwing:
 * the home route must still render when the relay is down.
 */
export async function relayLimits(options: RelayOptions = {}): Promise<RelayLimits> {
  const [config, version] = await Promise.all([
    fetchRelayConfig(options).catch(() => ({}) as Record<string, unknown>),
    fetchRelayVersion(options),
  ]);

  return {
    version,
    chainId: configNumber(config.CHAIN_ID, FALLBACK.chainId),
    getLogsBlockRangeLimit: configNumber(config.ETH_GET_LOGS_BLOCK_RANGE_LIMIT, FALLBACK.getLogsBlockRangeLimit),
    defaultRateLimit: configNumber(config.DEFAULT_RATE_LIMIT, FALLBACK.defaultRateLimit),
    callDataSizeLimit: configNumber(config.CALL_DATA_SIZE_LIMIT, FALLBACK.callDataSizeLimit),
    // Note configBoolean, not Boolean. See the header.
    paymasterEnabled: configBoolean(config.PAYMASTER_ENABLED, FALLBACK.paymasterEnabled),
  };
}

/**
 * Turn each limit into a sentence explaining what it means for the developer.
 * Rendered on the credential-free home route.
 */
export function describeLimits(limits: RelayLimits): {
  label: string;
  value: string;
  meaning: string;
}[] {
  return [
    {
      label: "Chain id",
      value: String(limits.chainId),
      meaning:
        limits.chainId === 296
          ? "Hedera testnet. Safe to write to."
          : limits.chainId === 295
            ? "Hedera MAINNET. This template is not intended to write here."
            : "A relay this template has not seen before.",
    },
    {
      label: "eth_getLogs block range",
      value: `${limits.getLogsBlockRangeLimit} blocks`,
      meaning:
        "Queries wider than this return empty rather than erroring, which looks exactly like 'there were no events'. Page your log queries.",
    },
    {
      label: "Rate limit",
      value: `${limits.defaultRateLimit} requests`,
      meaning: "Per IP, per window. Shared with everyone else on this public relay.",
    },
    {
      label: "Call data size",
      value: `${Math.round(limits.callDataSizeLimit / 1024)} KiB`,
      meaning: "Transactions with larger calldata are rejected before execution.",
    },
    {
      label: "Paymaster",
      value: limits.paymasterEnabled ? "enabled" : "disabled",
      meaning: limits.paymasterEnabled
        ? "This relay sponsors gas. Unusual — confirm before relying on it."
        : "No gasless transactions. The relay ships a paymaster and has it switched off, so every user needs their own HBAR for fees.",
    },
  ];
}
