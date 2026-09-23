"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckBadgeIcon, ChevronUpDownIcon, ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import type { SaucerToken } from "~~/lib/onboarding";

/**
 * Token picker with a real verified badge.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT A <select>
 *
 * A native <option> renders text and nothing else — no SVG, no colour, no
 * markup. The verified state was therefore a Unicode "✓", which reads as a
 * tick someone typed rather than as a mark the DEX awards. Showing it
 * properly means owning the list.
 *
 * Owning the list brings an obligation the native control was discharging for
 * free: SaucerSwap lists ~587 tokens, and a 587-row listbox with no search is
 * worse than the select it replaced, because browsers give <select> typeahead
 * and a custom div gives nothing. Hence the filter — this is a combobox, not
 * a dropdown.
 * ---------------------------------------------------------------------------
 *
 * The id and decimals stay visible next to every symbol on purpose. Symbols
 * are not unique on Hedera: testnet carries five tokens whose symbol is
 * "HBAR", one of them at 0 decimals and actually named something else. The
 * symbol alone cannot identify what you are about to buy.
 */
export const TokenPicker = ({
  tokens,
  value,
  onChange,
  id,
  totalListed,
}: {
  tokens: SaucerToken[];
  value: string;
  onChange: (tokenId: string) => void;
  id?: string;
  /** How many tokens the DEX lists in total, which is more than are shown. */
  totalListed?: number;
}) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(() => tokens.find(t => t.tokenId === value) ?? null, [tokens, value]);

  const matches = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return tokens;
    // Match the id as well as the symbol: when two tokens share a symbol the
    // id is the only way to ask for the one you mean.
    return tokens.filter(
      t =>
        t.symbol.toLowerCase().includes(needle) || t.tokenId.includes(needle) || t.name?.toLowerCase().includes(needle),
    );
  }, [tokens, filter]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setFilter("");
  }, [open]);

  // Keep the highlighted row in view when arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (tokenId: string) => {
    onChange(tokenId);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive(i => {
        const next = event.key === "ArrowDown" ? i + 1 : i - 1;
        return Math.max(0, Math.min(matches.length - 1, next));
      });
      return;
    }
    if (event.key === "Enter" && open && matches[active]) {
      event.preventDefault();
      choose(matches[active].tokenId);
    }
  };

  const Row = ({ token }: { token: SaucerToken }) => (
    <>
      <span className="font-mono text-sm">{token.symbol}</span>
      {token.dueDiligenceComplete && (
        // The badge SaucerSwap awards, not a tick in a string.
        <CheckBadgeIcon className="h-4 w-4 shrink-0 text-success" title="Due diligence complete on SaucerSwap" />
      )}
      {token.isFeeOnTransfer && (
        <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-warning" title="Fee-on-transfer token" />
      )}
      <span className="font-mono text-xs opacity-60">
        {token.tokenId} · {token.decimals}dp
      </span>
    </>
  );

  return (
    <div className="relative" ref={rootRef}>
      <button
        id={id}
        type="button"
        className="select select-bordered w-full flex items-center gap-2 text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKeyDown}
      >
        {selected ? <Row token={selected} /> : <span className="opacity-60">Choose a token</span>}
        <ChevronUpDownIcon className="h-4 w-4 ml-auto shrink-0 opacity-50" aria-hidden />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-box border border-base-300 bg-base-100 shadow-lg">
          <input
            ref={inputRef}
            type="text"
            className="input input-sm input-bordered w-full rounded-b-none font-mono text-xs"
            placeholder="Filter by symbol, name or 0.0.x id"
            value={filter}
            onChange={e => {
              setFilter(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            aria-label="Filter tokens"
          />
          <ul ref={listRef} className="max-h-64 overflow-y-auto py-1" role="listbox" aria-label="Tokens">
            {matches.length === 0 && (
              <li className="px-3 py-2 text-xs opacity-60">
                No token here matches “{filter}”.
                {totalListed && totalListed > tokens.length
                  ? ` Only the ${tokens.length} tokens with a published price are selectable; SaucerSwap lists ${totalListed}.`
                  : ""}
              </li>
            )}
            {matches.map((token, index) => (
              <li key={token.tokenId} data-index={index}>
                <button
                  type="button"
                  role="option"
                  aria-selected={token.tokenId === value}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-base-200 ${
                    index === active ? "bg-base-200" : ""
                  }`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(token.tokenId)}
                >
                  <Row token={token} />
                </button>
              </li>
            ))}
          </ul>
          <p className="border-t border-base-300 px-3 py-2 text-xs opacity-60">
            {matches.length} of {tokens.length} shown
            {totalListed && totalListed > tokens.length
              ? ` · ${totalListed} listed on SaucerSwap, those without a published price are omitted`
              : ""}
          </p>
        </div>
      )}
    </div>
  );
};
