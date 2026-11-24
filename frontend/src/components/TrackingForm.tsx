"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { GLASS_BUTTON } from "@/components/Button";
import { fetchShipment } from "@/lib/api";

/**
 * The tracking number box (glass style, for photo or dark backgrounds). Checks that
 * the shipment exists, then takes the visitor to their portal at /track/<number>.
 * No account or sign-in.
 */
export function TrackingForm({ id, size = "md" }: { id: string; size?: "md" | "lg" }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trackingNumber = value.trim().toUpperCase();
    if (loading) return;
    if (!trackingNumber) {
      setError("Enter your tracking number first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const shipment = await fetchShipment(trackingNumber);
      if (!shipment) {
        setError(`We couldn't find ${trackingNumber}. Check the number and try again.`);
        setLoading(false);
        return;
      }
      // Stay in the loading state while the portal page opens.
      router.push(`/track/${encodeURIComponent(shipment.trackingNumber)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const big = size === "lg";

  return (
    <div>
      {/* The visible instruction doubles as the input's label. */}
      <label
        htmlFor={id}
        className={big ? "mb-3 block text-base font-medium text-white sm:text-lg" : "sr-only"}
      >
        Enter your tracking number
      </label>

      <form onSubmit={handleSubmit} className={`flex ${big ? "flex-col gap-3 sm:flex-row" : "gap-2"}`}>
        <input
          id={id}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          placeholder={big ? "e.g. WB7K4M9QX2TP" : "Tracking number from your email"}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={[big ? `${id}-help` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined}
          className={`glass min-w-0 rounded-full sm:flex-1 ${big ? "w-full sm:w-auto" : "flex-1"} font-mono uppercase tracking-wider text-white outline-none transition placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-white/70 focus:border-orange ${
            big ? "h-16 px-7 text-lg sm:text-xl" : "h-12 px-5 text-base"
          }`}
        />
        <button
          type="submit"
          disabled={loading}
          className={
            big
              ? // Big, orange-tinted glass: still see-through, but the one thing on the hero you can't miss.
                "inline-flex h-16 shrink-0 items-center justify-center gap-3 rounded-full border border-orange/70 bg-orange/80 px-10 text-lg font-semibold text-white shadow-lg shadow-orange/30 backdrop-blur-md transition hover:bg-orange active:scale-[0.98] disabled:opacity-70"
              : `${GLASS_BUTTON} shrink-0 px-6 disabled:opacity-70`
          }
        >
          {loading ? "Opening…" : big ? "Track shipment" : "Track"}
          {big && !loading && (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" className="size-5" aria-hidden>
              <path d="M4 10h12M11 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </form>

      {big && (
        <ol id={`${id}-help`} className="mt-4 flex flex-col gap-2 text-sm text-white/85 sm:flex-row sm:gap-5">
          {["Find it in your booking email", "Type or paste it above", "Press Track shipment"].map((step, index) => (
            <li key={step} className="flex items-center gap-2">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/15 text-[11px] font-semibold">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      )}

      {/* The small form keeps room for the message so the page doesn't jump; the big one only grows when needed. */}
      <div className={big ? (error ? "mt-3" : "") : "mt-2 min-h-10"} role="alert">
        {error && (
          <p id={`${id}-error`} className="glass-dark inline-block rounded-2xl px-4 py-2 text-sm text-white">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
