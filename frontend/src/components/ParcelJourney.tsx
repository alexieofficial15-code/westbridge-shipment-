"use client";

import { useEffect, useRef, useState } from "react";
import { photoUrl, STATUS_LABELS, type ShipmentStatus } from "@/lib/api";

/**
 * The progress track with an animated parcel on it. When the page opens the parcel drops in,
 * its lid pops open and shut, then it rides along the track to the shipment's current step
 * and bobs gently there. Delivered shows a green tick; a delivery issue makes it wobble.
 * Animations live in globals.css (.parcel-*) and switch off for "reduce motion".
 */

export const JOURNEY: ShipmentStatus[] = ["pending", "picked_up", "in_transit", "out_for_delivery", "delivered"];

// "At customs" happens during transit; "Ready for pickup" replaces the final delivery run.
const JOURNEY_STEP: Partial<Record<ShipmentStatus, ShipmentStatus>> = {
  at_customs: "in_transit",
  ready_for_pickup: "out_for_delivery",
};
export const journeyIndex = (status: ShipmentStatus) => JOURNEY.indexOf(JOURNEY_STEP[status] ?? status);

const SHORT_LABELS: Record<string, string> = {
  pending: "Booked",
  picked_up: "Picked up",
  in_transit: "On the way",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};

export function ParcelJourney({
  status,
  reached,
  trackingNumber,
  photos,
}: {
  status: ShipmentStatus;
  reached: number;
  trackingNumber: string;
  photos: string[];
}) {
  // Start at the beginning, then move to the real step once the drop-in has played.
  const [shownStep, setShownStep] = useState(0);
  const [open, setOpen] = useState(false);
  // The parcel only becomes clickable, with its "Click here" label, once the admin has added photos.
  const hasPhotos = photos.length > 0;
  useEffect(() => {
    if (!hasPhotos) setOpen(false);
  }, [hasPhotos]);
  useEffect(() => {
    const timer = setTimeout(() => setShownStep(reached), 1100);
    return () => clearTimeout(timer);
  }, [reached]);

  const percent = (shownStep / (JOURNEY.length - 1)) * 100;
  const mood = status === "delivered" ? "delivered" : status === "exception" ? "issue" : "moving";

  return (
    <div className="relative pt-32 sm:pt-36">
      <p className="sr-only">Progress: {STATUS_LABELS[status]}</p>
      {/* Track, inset by half a step so the parcel never hangs off either end. */}
      <div className="relative mx-[10%]">
        <div className="h-1.5 rounded-full bg-white/15" />
        <div className="parcel-progress absolute inset-y-0 left-0 rounded-full bg-orange" style={{ width: `${percent}%` }} />

        {/* The parcel. With photos, clicking it pops them up right above it. */}
        <div className="parcel-ride absolute bottom-3 z-10 -translate-x-1/2" style={{ left: `${percent}%` }}>
          {open && hasPhotos && <PhotoPopover trackingNumber={trackingNumber} photos={photos} onClose={() => setOpen(false)} />}
          {!open && hasPhotos && (
            <span className="parcel-hint pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-orange px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg shadow-orange/30">
              Click here
              <span className="absolute left-1/2 top-full -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-orange" />
            </span>
          )}
          {hasPhotos ? (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-label={open ? "Hide package photos" : "Show package photos"}
              className="block cursor-pointer rounded-2xl outline-none transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-orange"
            >
              <ParcelBody mood={mood} />
            </button>
          ) : (
            <span className="block" aria-hidden>
              <ParcelBody mood={mood} />
            </span>
          )}
          <div className="parcel-shadow mx-auto mt-1 h-1.5 w-12 rounded-[100%] bg-black/40 blur-[3px]" />
        </div>

        {/* Step dots */}
        {JOURNEY.map((step, index) => (
          <span
            key={step}
            className={`absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors duration-700 ${
              index <= shownStep ? "border-orange bg-orange" : "border-white/40 bg-ink"
            }`}
            style={{ left: `${(index / (JOURNEY.length - 1)) * 100}%` }}
            aria-hidden
          />
        ))}
      </div>

      <ol className="mt-5 grid grid-cols-5 text-center">
        {JOURNEY.map((step, index) => (
          <li
            key={step}
            className={`px-0.5 text-[10px] font-medium leading-tight transition-colors duration-700 sm:text-sm ${
              index <= shownStep ? "text-white" : "text-white/45"
            }`}
          >
            {SHORT_LABELS[step]}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The parcel with its drop-in and bob (or wobble) animations. */
function ParcelBody({ mood }: { mood: "moving" | "delivered" | "issue" }) {
  return (
    <span className="parcel-drop block">
      <span className={`block ${mood === "issue" ? "parcel-wobble" : "parcel-bob"}`}>
        <Parcel mood={mood} />
      </span>
    </span>
  );
}

/** The package photos, in a card that pops up above the parcel. Arrows when there are several. */
function PhotoPopover({ trackingNumber, photos, onClose }: { trackingNumber: string; photos: string[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Close on Escape or a tap anywhere outside the card (the parcel button toggles it itself).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current && !ref.current.contains(target) && !ref.current.parentElement?.querySelector("button[aria-expanded]")?.contains(target)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [onClose]);

  const many = photos.length > 1;
  const step = (delta: number) => setIndex((current) => (current + delta + photos.length) % photos.length);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Package photos"
      className="parcel-pop absolute bottom-full left-1/2 mb-3 w-64 -translate-x-1/2 sm:w-72"
    >
      <div className="overflow-hidden rounded-3xl bg-white p-2 text-ink shadow-2xl shadow-black/40">
        {photos.length > 0 && (
          <>
            <a href={photoUrl(trackingNumber, photos[index]!)} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={photos[index]}
                src={photoUrl(trackingNumber, photos[index]!)}
                alt={`Your package, photo ${index + 1} of ${photos.length}`}
                className="aspect-[4/3] w-full rounded-2xl object-cover"
              />
            </a>
            <div className="flex items-center justify-between px-2 pb-1 pt-2 text-xs text-ink/55">
              {many ? (
                <button type="button" onClick={() => step(-1)} className="rounded-full px-2 py-1 font-medium text-navy hover:bg-ink/5" aria-label="Previous photo">
                  ←
                </button>
              ) : (
                <span />
              )}
              <span>{many ? `Photo ${index + 1} of ${photos.length}` : "Your package"} · tap to enlarge</span>
              {many ? (
                <button type="button" onClick={() => step(1)} className="rounded-full px-2 py-1 font-medium text-navy hover:bg-ink/5" aria-label="Next photo">
                  →
                </button>
              ) : (
                <span />
              )}
            </div>
          </>
        )}
      </div>
      {/* Little pointer down to the parcel */}
      <span className="absolute left-1/2 top-full -translate-x-1/2 border-x-[10px] border-t-[10px] border-x-transparent border-t-white" />
    </div>
  );
}

/** A cardboard box with tape and a shipping label, drawn in SVG. */
export function Parcel({ mood = "moving", className = "size-20 sm:size-24" }: { mood?: "moving" | "delivered" | "issue"; className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={`${className} drop-shadow-[0_10px_14px_rgb(0_0_0/0.35)]`}>
      {/* Side face */}
      <path d="M58 30 70 22v34l-12 10z" fill="#a8682e" />
      {/* Front face */}
      <path d="M12 30h46v36H12z" fill="#cf8a45" />
      {/* Tape down the front */}
      <path d="M31 30h8v36h-8z" fill="#e9c28c" />
      {/* Shipping label */}
      <rect x="16" y="46" width="12" height="9" rx="1.5" fill="#fff" />
      <path d="M18 49h8M18 52h5" stroke="#182a48" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="49" cy="51" r="3" fill="#eb5f1e" />
      {/* Lid: opens and closes once when the parcel lands */}
      <g className="parcel-lid">
        <path d="M12 30 24 22h46l-12 8z" fill="#e0a565" />
        <path d="M31 30 43 22h8l-12 8z" fill="#f0cf9c" />
      </g>
      {mood === "delivered" && (
        <g>
          <circle cx="64" cy="18" r="11" fill="#10b981" stroke="#fff" strokeWidth="2.5" />
          <path d="m59 18 3.5 3.5L69 15" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {mood === "issue" && (
        <g>
          <circle cx="64" cy="18" r="11" fill="#ef4444" stroke="#fff" strokeWidth="2.5" />
          <path d="M64 12v7.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          <circle cx="64" cy="24" r="1.7" fill="#fff" />
        </g>
      )}
    </svg>
  );
}
