"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that counts up to its value when it scrolls into view.
 *
 * ---------------------------------------------------------------------------
 * THE FINAL VALUE IS SERVER-RENDERED.
 *
 * `children` is the already-formatted number, rendered by the server and
 * present in the HTML. If JavaScript never runs, if the observer is
 * unsupported, or if the user prefers reduced motion, the correct value is
 * simply there. The animation only ever replaces a number that was already
 * right — it can never leave a 0 or a blank where a real figure belongs.
 *
 * That matters more here than on a marketing site: every number on this page
 * is a live on-chain reading, and a decorative animation must not be able to
 * misreport one.
 * ---------------------------------------------------------------------------
 *
 * The only client component on the home page. The page itself stays a Server
 * Component; this is a leaf.
 */
export const CountUp = ({
  value,
  children,
  durationMs = 1100,
  className,
}: {
  /** The true numeric value to count to. */
  value: number;
  /** The server-formatted display string — the fallback and the final state. */
  children: React.ReactNode;
  durationMs?: number;
  className?: string;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState<string | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;

    // Match the server's formatting exactly, so the handover from animated to
    // final value is invisible. Intl gives the same grouping toLocaleString did.
    const format = new Intl.NumberFormat("en-US").format;
    let frame = 0;

    const observer = new IntersectionObserver(
      entries => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();

        const started = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - started) / durationMs);
          // Same easing as the scroll reveals, so motion feels of a piece.
          const eased = 1 - Math.pow(1 - t, 3);
          setDisplay(format(Math.round(value * eased)));
          if (t < 1) {
            frame = requestAnimationFrame(step);
          } else {
            // Hand back to the server-rendered node: whatever the server said
            // is the truth, including any prefix or suffix around the digits.
            setDisplay(null);
          }
        };
        frame = requestAnimationFrame(step);
      },
      { rootMargin: "0px 0px -15% 0px" },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {display ?? children}
    </span>
  );
};
