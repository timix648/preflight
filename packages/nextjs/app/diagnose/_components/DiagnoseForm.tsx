"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * The only client-side JavaScript on this route.
 *
 * It navigates; it does not fetch. The diagnosis itself is rendered on the
 * server from the `account` query parameter, which means the page works with
 * JavaScript disabled, survives a refresh, and — the part that matters for a
 * demo — produces a shareable URL. A judge can be sent straight to a finding.
 */
export const DiagnoseForm = ({ suggestions }: { suggestions: { id: string; note: string }[] }) => {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("account") ?? "");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed) router.push(`/diagnose?account=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <label htmlFor="account" className="sr-only">
          Hedera account id or EVM address
        </label>
        <input
          id="account"
          name="account"
          className="input input-bordered grow font-mono"
          placeholder="0.0.2 or 0x574c17b6…"
          value={value}
          onChange={event => setValue(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
          Diagnose
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="opacity-60">Try:</span>
        {suggestions.map(suggestion => (
          <button
            key={suggestion.id}
            type="button"
            className="badge badge-outline badge-sm hover:badge-primary cursor-pointer"
            title={suggestion.note}
            onClick={() => {
              setValue(suggestion.id);
              router.push(`/diagnose?account=${encodeURIComponent(suggestion.id)}`);
            }}
          >
            {suggestion.id}
          </button>
        ))}
      </div>
    </div>
  );
};
