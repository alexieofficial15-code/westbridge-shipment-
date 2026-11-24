"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts up to the number inside `value` once, the first time it scrolls into view.
 * Text around the number is kept ("10,000+", "80%"). `from` sets the starting number
 * (handy for years, so 2019 counts up from 2000 rather than from 0).
 *
 * The final value is rendered on the server, so search engines and visitors without
 * JavaScript see the real figure. The section fades in with <Reveal>, so the swap to
 * the starting number happens while it is still invisible.
 */
export function CountUp({ value, from = 0, duration = 1600 }: { value: string; from?: number; duration?: number }) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const match = /^(\D*)(\d[\d,]*)(.*)$/.exec(value);
    const node = ref.current;
    if (!match || !node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const [, prefix, digits, suffix] = match as unknown as [string, string, string, string];
    const target = Number(digits.replace(/,/g, ""));
    const withCommas = digits.includes(",");
    const format = (n: number) => `${prefix}${withCommas ? n.toLocaleString("en-US") : String(n)}${suffix}`;

    setText(format(from));

    let frame = 0;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          if (cancelled) return;
          const progress = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3); // fast start, gentle finish
          setText(format(Math.round(from + (target - from) * eased)));
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(node);

    return () => {
      cancelled = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      setText(value);
    };
  }, [value, from, duration]);

  // tabular-nums keeps every digit the same width, so the number doesn't jitter while counting.
  return (
    <span ref={ref} className="tabular-nums">
      {text}
    </span>
  );
}
