/**
 * Where a value came from, and whether to trust its freshness.
 *
 * Trap #6 made visible. Mirror-node fungible balances are built from a
 * periodic balance file and can lag a transfer that already succeeded, so this
 * template never renders a bare number as if it were settled fact. Every value
 * carries its provenance.
 *
 * This is the single most distinctive piece of polish in the build, and it is
 * a typed concept rather than a cosmetic label: the `source` prop comes
 * straight off `Reading<T>`, so a value cannot be displayed without one.
 */
import type { Reading } from "~~/lib/onboarding";

export const SourceBadge = ({
  source,
  mayBeStale = false,
  label,
  asOf,
}: {
  source: Reading<unknown>["source"];
  mayBeStale?: boolean;
  /** Optional override, e.g. the relay version string. */
  label?: string;
  /** Unix seconds, when the value was observed. */
  asOf?: number;
}) => {
  const isLive = source === "json-rpc" && !mayBeStale;

  const text =
    label ?? (source === "json-rpc" ? "live · JSON-RPC" : mayBeStale ? "mirror node · may lag" : "mirror node");

  const title = isLive
    ? "Read from live consensus state through the JSON-RPC relay."
    : mayBeStale
      ? "Read from the mirror node, which builds fungible balances from a periodic file. A very recent transfer may not appear here yet — this is normal, not a bug."
      : "Read from the mirror node's REST API. No wallet required.";

  return (
    <span
      className={`badge badge-sm gap-1 ${isLive ? "badge-success" : mayBeStale ? "badge-warning" : "badge-ghost"}`}
      title={title}
    >
      {text}
      {asOf ? <span className="opacity-70">· {new Date(asOf * 1000).toLocaleTimeString()}</span> : null}
    </span>
  );
};
