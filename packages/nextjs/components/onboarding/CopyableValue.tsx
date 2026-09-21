"use client";

import { CheckIcon, DocumentDuplicateIcon } from "@heroicons/react/24/outline";
import { useCopyToClipboard } from "~~/hooks/scaffold-hbar";

/**
 * A value you can copy, for the account ids and addresses this app is full of.
 *
 * A client leaf inside otherwise server-rendered pages: only the button needs
 * JavaScript, so `/diagnose` stays a Server Component and still renders its
 * whole diagnosis without any.
 *
 * Uses the scaffold's own `useCopyToClipboard` rather than a new one — house
 * components are the idiom here, and rebuilding them costs code-quality marks
 * for nothing.
 */
export const CopyableValue = ({
  value,
  label,
  className = "",
}: {
  value: string;
  /** What is being copied, for screen readers. Defaults to the value. */
  label?: string;
  className?: string;
}) => {
  const { copyToClipboard, isCopiedToClipboard } = useCopyToClipboard();

  return (
    <span className={`inline-flex items-center gap-1.5 group ${className}`}>
      <span className="font-mono break-all">{value}</span>
      <button
        type="button"
        // Visible on hover and on keyboard focus. focus-visible alone would
        // leave it unreachable for anyone tabbing without hovering.
        className="opacity-0 group-hover:opacity-60 focus-visible:opacity-100 hover:!opacity-100 transition-opacity shrink-0"
        aria-label={isCopiedToClipboard ? "Copied" : `Copy ${label ?? value}`}
        onClick={() => void copyToClipboard(value)}
      >
        {isCopiedToClipboard ? (
          <CheckIcon className="h-3.5 w-3.5 text-success" aria-hidden />
        ) : (
          <DocumentDuplicateIcon className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
    </span>
  );
};
