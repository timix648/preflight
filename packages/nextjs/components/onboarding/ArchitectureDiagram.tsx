/**
 * The design, for the reader who will not read 2,000 words of README.
 *
 * Deliberately built from DaisyUI classes and plain layout rather than an SVG
 * or a diagramming dependency: it stays theme-aware and legible on a phone for
 * free, and there is nothing to keep in sync with the stylesheet.
 *
 * A Server Component — no hooks, no interactivity, no JavaScript shipped.
 */

const SOURCES = [
  { name: "Mirror node", detail: "accounts, tokens, association state" },
  { name: "JSON-RPC relay", detail: "live balances, limits from /config" },
  { name: "SaucerSwap REST", detail: "token list, decimals, prices" },
  { name: "SaucerSwap router", detail: "real quotes, the swap itself" },
];

const TRAPS = [
  { n: 1, name: "association", file: "association.ts" },
  { n: 2, name: "address duality", file: "address.ts" },
  { n: 3, name: "key types", file: "keys.ts" },
  { n: 4, name: "key rotation", file: "keys.ts" },
  { n: 5, name: "decimals", file: "units.ts" },
  { n: 6, name: "read consistency", file: "consistency.ts" },
  { n: 7, name: "status codes", file: "status.ts" },
  { n: 8, name: "relay limits", file: "relay.ts" },
];

export const ArchitectureDiagram = () => (
  <div className="card bg-base-100 shadow">
    <div className="card-body gap-5">
      {/* ---------------------------- the layers ---------------------------- */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch">
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wider opacity-50 mb-2">Read from</div>
          <div className="flex flex-col gap-1.5">
            {SOURCES.map(source => (
              <div key={source.name} className="rounded border border-base-300 px-3 py-2">
                <div className="text-sm font-medium">{source.name}</div>
                <div className="text-xs opacity-60">{source.detail}</div>
              </div>
            ))}
          </div>
          <div className="text-xs opacity-50 mt-2">All public. No wallet, no key.</div>
        </div>

        <div className="flex lg:flex-col items-center justify-center text-2xl opacity-30 shrink-0" aria-hidden>
          <span className="hidden lg:inline">→</span>
          <span className="lg:hidden">↓</span>
        </div>

        <div className="flex-[1.4]">
          <div className="text-xs uppercase tracking-wider opacity-50 mb-2">lib/onboarding — framework-free</div>
          <div className="rounded border-2 border-primary/40 bg-primary/5 px-3 py-2.5">
            <div className="text-sm font-medium mb-1">selectStrategy()</div>
            <div className="text-xs opacity-70 leading-relaxed">
              Pure. No network, no SDK, no signer. Given a situation it returns one of four association mechanisms{" "}
              <em>and a sentence explaining the choice</em>. Seven invariants hold across all 192 possible inputs.
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 mt-2">
            {TRAPS.map(trap => (
              <div
                key={trap.n}
                className="text-xs rounded bg-base-200 px-2 py-1 flex items-baseline gap-1.5"
                title={`Trap ${trap.n}: ${trap.name} — handled in lib/onboarding/${trap.file}`}
              >
                <span className="opacity-40 tabular-nums">{trap.n}</span>
                <span className="truncate">{trap.name}</span>
                <span className="ml-auto opacity-40 font-mono hidden sm:inline">{trap.file}</span>
              </div>
            ))}
          </div>
          <div className="text-xs opacity-50 mt-2">Nothing here imports React.</div>
        </div>

        <div className="flex lg:flex-col items-center justify-center text-2xl opacity-30 shrink-0" aria-hidden>
          <span className="hidden lg:inline">→</span>
          <span className="lg:hidden">↓</span>
        </div>

        <div className="flex-1">
          <div className="text-xs uppercase tracking-wider opacity-50 mb-2">Routes</div>
          <div className="flex flex-col gap-1.5">
            <div className="rounded border border-base-300 px-3 py-2">
              <div className="text-sm font-mono">/</div>
              <div className="text-xs opacity-60">Server Component · no wallet</div>
            </div>
            <div className="rounded border border-base-300 px-3 py-2">
              <div className="text-sm font-mono">/diagnose</div>
              <div className="text-xs opacity-60">Server Component · no wallet</div>
            </div>
            <div className="rounded border border-warning/40 px-3 py-2">
              <div className="text-sm font-mono">/acquire</div>
              <div className="text-xs opacity-60">quote is free · only signing needs a wallet</div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------- the journey ---------------------------- */}
      <div className="border-t border-base-300 pt-4">
        <div className="text-xs uppercase tracking-wider opacity-50 mb-2">The journey, and its order</div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="badge badge-ghost">quote</span>
          <span className="opacity-30" aria-hidden>
            →
          </span>
          <span className="badge badge-primary">associate</span>
          <span className="opacity-30" aria-hidden>
            →
          </span>
          <span className="badge badge-ghost">swap</span>
        </div>
        <p className="text-xs opacity-60 mt-2 leading-relaxed">
          That order is enforced, not suggested. SaucerSwap&apos;s own documentation warns that a swap to an account
          without the output token associated fails with <code>TOKEN_NOT_ASSOCIATED_TO_ACCOUNT</code>, so the swap stays
          disabled until the account can actually hold the token.
        </p>
      </div>
    </div>
  </div>
);
