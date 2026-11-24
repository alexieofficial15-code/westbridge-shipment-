"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { LogoRow } from "@/components/Logo";
import { Parcel, ParcelJourney, journeyIndex } from "@/components/ParcelJourney";
import { ShipmentStats } from "@/components/ShipmentStats";
import { WhatsAppAnchor, WhatsAppLink } from "@/components/WhatsAppButton";
import { TrackingMap } from "@/components/TrackingMap";
import { fetchShipment, photoUrl, SERVICE_LABELS, STATUS_LABELS, type Shipment, type ShipmentStatus } from "@/lib/api";
import { site } from "@/lib/site";

// How often an open portal checks for new tracking updates.
const REFRESH_INTERVAL_MS = 15_000;

/** One friendly sentence per status, the big headline at the top. */
const HEADLINES: Record<ShipmentStatus, string> = {
  pending: "We've received your booking",
  picked_up: "Your package has been picked up",
  in_transit: "Your package is on its way",
  at_customs: "Your package is at customs",
  out_for_delivery: "Your package arrives today",
  ready_for_pickup: "Your package is ready to collect",
  delivered: "Your package has been delivered",
  exception: "We need to sort something out",
};

/** What the customer should do right now. */
const WHAT_TO_DO: Record<ShipmentStatus, { icon: IconName; text: string }> = {
  pending: { icon: "clock", text: "Nothing to do yet. We'll collect your package soon, and this page updates by itself." },
  picked_up: { icon: "box", text: "Nothing to do. Check the photos below to make sure it's your package." },
  in_transit: { icon: "truck", text: "Nothing to do. Follow the truck on the map below as it moves." },
  at_customs: { icon: "shield", text: "Customs checks can take a few days. We'll contact you if anything is needed from you." },
  out_for_delivery: { icon: "home", text: "Make sure someone is at the delivery address today to receive it." },
  ready_for_pickup: { icon: "pin", text: "Collect it at the place shown on the map. Bring your tracking number and an ID." },
  delivered: { icon: "check", text: "Check that everything arrived in good condition. Any problem? Message us on WhatsApp." },
  exception: { icon: "chat", text: "Please message us on WhatsApp so we can fix this for you quickly." },
};

type State =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "error"; message: string }
  | { kind: "found"; shipment: Shipment };

const formatDate = (value: string) =>
  new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

const formatDay = (value: string) => new Date(value).toLocaleDateString(undefined, { dateStyle: "long" });

export function ShipmentPortal({ trackingNumber }: { trackingNumber: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function load(isRefresh: boolean) {
      try {
        const shipment = await fetchShipment(trackingNumber, controller.signal);
        setState(shipment ? { kind: "found", shipment } : { kind: "not_found" });
      } catch (caught) {
        if (controller.signal.aborted) return;
        // On a failed refresh keep showing the last known result; the next tick tries again.
        if (isRefresh) return;
        setState({
          kind: "error",
          message: caught instanceof Error ? caught.message : "Something went wrong. Please try again.",
        });
      }
    }

    void load(false);

    // Live updates: paused while the tab is hidden, and cheap for the servers
    // because lookups are cached.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [trackingNumber]);

  const shipment = state.kind === "found" ? state.shipment : null;

  return (
    <main className="min-h-dvh bg-paper">
      <section className="relative isolate overflow-hidden bg-ink text-white">
        <Image src="/images/port.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover opacity-50" />
        <div className="absolute inset-0 -z-10 bg-linear-to-b from-ink/70 via-ink/80 to-ink" aria-hidden />

        <TopBar trackingNumber={trackingNumber} />

        <div className="relative mx-auto max-w-4xl px-4 pb-10 pt-6 sm:px-8 sm:pb-14 sm:pt-10">
          {state.kind === "loading" && <Finding />}
          {shipment && <Welcome shipment={shipment} />}
          {(state.kind === "not_found" || state.kind === "error") && (
            <div className="py-6 text-center">
              <Parcel mood="issue" className="mx-auto size-20" />
              <p className="mt-4 font-mono text-sm tracking-wider text-white/70">{trackingNumber}</p>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-12" aria-live="polite">
        {state.kind === "loading" && (
          <div className="space-y-4">
            <div className="h-28 animate-pulse rounded-3xl bg-ink/5" />
            <div className="h-64 animate-pulse rounded-3xl bg-ink/5" />
          </div>
        )}

        {(state.kind === "not_found" || state.kind === "error") && (
          <div className="rounded-3xl border border-ink/10 bg-white p-8 text-center sm:p-12">
            <h2 className="text-3xl font-light tracking-tight">
              {state.kind === "not_found" ? "Shipment not found" : "We couldn't load this shipment"}
            </h2>
            <p className="mx-auto mt-3 max-w-md leading-relaxed text-ink/65">
              {state.kind === "not_found"
                ? "No shipment matches this tracking number. Check it for typing mistakes, or contact us and we will look it up with you."
                : state.message}
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                href="/"
                className="inline-flex h-12 items-center rounded-full border border-navy/30 bg-navy/8 px-6 text-sm font-medium text-navy backdrop-blur-md transition hover:bg-navy/15"
              >
                Try another number
              </Link>
              <WhatsAppLink trackingNumber={trackingNumber} label="Ask on WhatsApp" onLight />
            </div>
          </div>
        )}

        {shipment && (
          <div className="space-y-5">
            <ShipmentStats shipment={shipment} />
            <QuickGuide hasPhotos={shipment.photos.length > 0} />
            <PackagePhotos shipment={shipment} />
            <LiveMap shipment={shipment} />
            <ShipmentDetails shipment={shipment} />
          </div>
        )}
      </section>

      <footer className="border-t border-ink/8 py-6 text-center text-sm text-ink/45">
        © {new Date().getFullYear()} {site.name} ·{" "}
        <Link href="/privacy" className="hover:text-navy">
          Privacy
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="hover:text-navy">
          Terms
        </Link>
      </footer>
    </main>
  );
}

/** Slim bar in place of the landing page header: logo, track another, help. */
function TopBar({ trackingNumber }: { trackingNumber: string }) {
  return (
    <div className="relative mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 pt-5 sm:px-8 sm:pt-7">
      <Link href="/" aria-label={`${site.name} home`}>
        <LogoRow />
      </Link>
      <div className="flex items-center gap-2">
        <Link href="/#track" className="glass hidden h-10 items-center rounded-full px-4 text-sm text-white transition hover:bg-white/20 sm:inline-flex">
          Track another
        </Link>
        <WhatsAppAnchor
          trackingNumber={trackingNumber}
          className="glass inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm text-white transition hover:bg-white/20"
        >
          <Icon name="chat" className="size-4 text-whatsapp" />
          Help
        </WhatsAppAnchor>
      </div>
    </div>
  );
}

/** While the shipment loads: a hopping parcel. */
function Finding() {
  return (
    <div className="py-12 text-center" aria-label="Finding your shipment">
      <div className="parcel-hop mx-auto w-fit">
        <Parcel className="size-20" />
      </div>
      <p className="mt-5 text-white/75">Finding your shipment…</p>
    </div>
  );
}

/** The welcome: greeting, the headline for this status, what to do, and the parcel on its journey. */
function Welcome({ shipment }: { shipment: Shipment }) {
  const [copied, setCopied] = useState(false);
  const reached = Math.max(journeyIndex(shipment.status), ...shipment.events.map((event) => journeyIndex(event.status)), 0);
  const now = shipment.route[shipment.currentStop]?.label;
  const todo = WHAT_TO_DO[shipment.status];
  const greeting = "Hello! Here's your shipment".split(" ");

  async function copy() {
    try {
      await navigator.clipboard.writeText(shipment.trackingNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard not available: nothing to do
    }
  }

  return (
    <div>
      <p className="text-base text-orange sm:text-lg">
        {greeting.map((word, index) => (
          <span key={index} className="word-up mr-[0.3em]" style={{ animationDelay: `${150 + index * 90}ms` }}>
            {word}
          </span>
        ))}
      </p>
      <h1 className="word-up mt-2 text-4xl font-light leading-tight tracking-tight sm:text-6xl" style={{ animationDelay: "550ms" }}>
        {HEADLINES[shipment.status]}
      </h1>

      {/* .word-up makes its element inline-block, so the animation sits on a wrapper and the flex row inside. */}
      <div className="word-up mt-4 w-full" style={{ animationDelay: "700ms" }}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/70">
        <button
          type="button"
          onClick={() => void copy()}
          className="glass inline-flex h-9 items-center gap-2 rounded-full px-3.5 font-mono tracking-wider text-white transition hover:bg-white/20"
          aria-label="Copy tracking number"
        >
          {shipment.trackingNumber}
          <span className="font-sans text-xs text-white/60">{copied ? "Copied" : "Copy"}</span>
        </button>
        <span>{SERVICE_LABELS[shipment.service]}</span>
        {now && shipment.status !== "delivered" && <span>Now at {now}</span>}
        {shipment.estimatedDelivery && shipment.status !== "delivered" && (
          <span>Expected {formatDay(shipment.estimatedDelivery)}</span>
        )}
      </div>
      </div>

      <ParcelJourney status={shipment.status} reached={reached} trackingNumber={shipment.trackingNumber} photos={shipment.photos} />

      <div className="word-up mt-8 w-full" style={{ animationDelay: "1.6s" }}>
      <div
        className={`flex items-start gap-4 rounded-3xl p-5 sm:p-6 ${
          shipment.status === "exception" ? "border border-red-300/40 bg-red-500/15" : "glass"
        }`}
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-orange text-white">
          <Icon name={todo.icon} className="size-5" />
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-orange">
            {shipment.notice ? "A message from our team" : "What to do now"}
          </p>
          {/* The admin's own note (set on the shipment's dashboard page) replaces the standard text. */}
          <p className="mt-1 text-base leading-relaxed text-white sm:text-lg">{shipment.notice ?? todo.text}</p>
          {(shipment.status === "exception" || shipment.status === "delivered") && (
            <div className="mt-4">
              <WhatsAppLink trackingNumber={shipment.trackingNumber} label="Message us on WhatsApp" />
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

/** Three short pointers on how to read the page. */
function QuickGuide({ hasPhotos }: { hasPhotos: boolean }) {
  const items: { icon: IconName; title: string; text: string }[] = [
    {
      icon: "route",
      title: "The status",
      text: hasPhotos
        ? "The parcel above moves along as your shipment does. Click it to see your package."
        : "The parcel above moves along as your shipment does.",
    },
    hasPhotos
      ? { icon: "box", title: "Your package", text: "Check the photos match what you sent or expect." }
      : { icon: "calendar", title: "Delivery date", text: "Your expected delivery date is shown at the top." },
    { icon: "pin", title: "The map", text: "Shows where it is. It refreshes by itself, no need to reload." },
  ];
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <li key={item.title} className="flex items-start gap-3 rounded-3xl border border-ink/8 bg-white p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-orange/10 text-orange">
            <Icon name={item.icon} className="size-4.5" />
          </span>
          <div>
            <p className="text-sm font-medium text-navy">{item.title}</p>
            <p className="mt-0.5 text-sm leading-snug text-ink/55">{item.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function timeAgo(value: string): string {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDate(value);
}

function PackagePhotos({ shipment }: { shipment: Shipment }) {
  const [open, setOpen] = useState<string | null>(null);
  if (shipment.photos.length === 0) return null;

  return (
    <section className="rounded-3xl border border-ink/10 bg-white p-6 sm:p-8" aria-labelledby="photos-heading">
      <h2 id="photos-heading" className="text-2xl font-light tracking-tight text-navy">
        Your package
      </h2>
      <p className="mt-1 text-sm text-ink/55">Photos taken by our team when your shipment was received.</p>
      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shipment.photos.map((id, index) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => setOpen(id)}
              className="group block aspect-square w-full overflow-hidden rounded-2xl bg-ink/5"
              aria-label={`Open photo ${index + 1}`}
            >
              {/* Served by our own API, already resized, so a plain <img> is the right tool here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl(shipment.trackingNumber, id)}
                alt={`Package photo ${index + 1}`}
                loading="lazy"
                className="size-full object-cover transition duration-500 group-hover:scale-105"
              />
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Package photo"
          className="fixed inset-0 z-[60] grid place-items-center bg-ink/85 p-4 backdrop-blur-sm"
          onClick={() => setOpen(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl(shipment.trackingNumber, open)}
            alt="Package photo, enlarged"
            className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="glass absolute right-4 top-4 h-11 rounded-full px-5 text-sm font-medium text-white"
          >
            Close
          </button>
        </div>
      )}
    </section>
  );
}

function LiveMap({ shipment }: { shipment: Shipment }) {
  const position = shipment.position;
  const sourceText =
    position?.source === "gps"
      ? "Live GPS position"
      : position?.source === "manual"
        ? "Position reported by the driver"
        : position?.source === "estimate"
          ? "Estimated position"
          : "Last scanned at";

  return (
    <section className="rounded-3xl border border-ink/10 bg-white p-3 sm:p-4" aria-labelledby="map-heading">
      <div className="flex flex-wrap items-end justify-between gap-3 px-3 pb-4 pt-3 sm:px-4">
        <div>
          <h2 id="map-heading" className="text-2xl font-light tracking-tight text-navy">
            Where it is now
          </h2>
          {position && (
            <p className="mt-1 text-sm text-ink/60">
              {sourceText}
              {position.source === "stop" && position.note ? ` ${position.note}` : position.note ? `: ${position.note}` : ""}
              <span className="text-ink/40"> · {timeAgo(position.updatedAt)}</span>
            </p>
          )}
        </div>
        <ul className="flex flex-wrap gap-4 text-xs text-ink/60">
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-orange" /> Passed
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[#9aa3ad]" /> Coming up
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-0 w-5 border-t-2 border-dashed border-navy/60" /> Planned route
          </li>
        </ul>
      </div>
      <TrackingMap route={shipment.route} currentStop={shipment.currentStop} vehicle={position} trail={shipment.trail} />
      <p className="px-3 pt-3 text-xs text-ink/45 sm:px-4">
        Positions near the sender&apos;s and receiver&apos;s addresses are shown at area level only, for privacy.
      </p>
    </section>
  );
}

function ShipmentDetails({ shipment }: { shipment: Shipment }) {
  const events = [...shipment.events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return (
    <div className="space-y-5">
      <PackageDetails shipment={shipment} />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <div className="rounded-3xl border border-ink/10 bg-white p-6 sm:p-8">
          <h2 className="text-2xl font-light tracking-tight text-navy">Journey</h2>

          {events.length === 0 ? (
            <p className="mt-5 text-ink/60">No updates yet. They will appear here as soon as your shipment moves.</p>
          ) : (
            <ol className="mt-7 space-y-7 border-l-2 border-ink/10 pl-6">
              {events.map((event, index) => (
                <li key={`${event.timestamp}-${index}`} className="relative">
                  <span
                    className={`absolute -left-[31px] top-1.5 size-3 rounded-full ring-4 ring-white ${
                      index === 0 ? "bg-orange" : "bg-ink/20"
                    }`}
                  />
                  <p className="font-medium">{event.description ?? STATUS_LABELS[event.status]}</p>
                  <p className="mt-1 font-mono text-xs uppercase tracking-wider text-ink/50">
                    {event.location ? `${event.location} · ` : ""}
                    {formatDate(event.timestamp)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>

      <aside className="rounded-3xl bg-ink p-6 text-white sm:p-8">
        <h2 className="text-2xl font-light tracking-tight text-orange">Need help?</h2>
        <p className="mt-3 leading-relaxed text-mist">
          Message us on WhatsApp. Your tracking number is added to the chat for you.
        </p>
        <div className="mt-6">
          <WhatsAppLink trackingNumber={shipment.trackingNumber} label="Chat on WhatsApp" />
        </div>
        <p className="mt-8 border-t border-ink-line pt-5 font-mono text-[11px] uppercase tracking-wider text-mist">
          Last updated {formatDate(shipment.updatedAt)}
          <br />
          Refreshes by itself while open
        </p>
      </aside>
      </div>
    </div>
  );
}

/** Every detail of the package and its booking, in one card. */
function PackageDetails({ shipment }: { shipment: Shipment }) {
  const [copied, setCopied] = useState(false);
  const { length, width, height } = shipment.dimensionsCm;
  const volumeM3 = (length * width * height) / 1_000_000;
  const delivered = shipment.status === "delivered";
  const deliveredAt = delivered ? shipment.events.findLast((event) => event.status === "delivered")?.timestamp : undefined;
  const now = shipment.route[shipment.currentStop]?.label;

  const rows: { icon: IconName; label: string; value: string; wide?: boolean; mono?: boolean }[] = [
    { icon: "tag", label: "Tracking number", value: shipment.trackingNumber, mono: true },
    { icon: "route", label: "Status", value: STATUS_LABELS[shipment.status] },
    { icon: "truck", label: "Service", value: SERVICE_LABELS[shipment.service] },
    { icon: "box", label: "Contents", value: shipment.contents, wide: true },
    { icon: "scale", label: "Weight", value: `${shipment.weightKg} kg` },
    { icon: "box", label: "Pieces", value: `${shipment.pieces} ${shipment.pieces === 1 ? "piece" : "pieces"}` },
    { icon: "box", label: "Size (L × W × H)", value: `${length} × ${width} × ${height} cm` },
    { icon: "globe", label: "Volume", value: `${volumeM3 < 0.01 ? volumeM3.toFixed(3) : volumeM3.toFixed(2)} m³` },
    { icon: "pin", label: "From", value: shipment.origin ?? "–" },
    { icon: "home", label: "To", value: shipment.destination ?? "–" },
    ...(delivered || !now ? [] : [{ icon: "pin" as IconName, label: "Now at", value: now }]),
    { icon: "calendar", label: "Registered on", value: formatDate(shipment.bookedAt) },
    delivered
      ? { icon: "check" as IconName, label: "Delivered on", value: deliveredAt ? formatDate(deliveredAt) : "–" }
      : { icon: "calendar" as IconName, label: "Expected delivery", value: shipment.estimatedDelivery ? formatDay(shipment.estimatedDelivery) : "To be confirmed" },
    { icon: "clock", label: "Last update", value: formatDate(shipment.updatedAt) },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(shipment.trackingNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard not available: nothing to do
    }
  }

  return (
    <section className="rounded-3xl border border-ink/10 bg-white p-6 sm:p-8" aria-labelledby="details-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="details-heading" className="text-2xl font-light tracking-tight text-navy">
          Package details
        </h2>
        <button type="button" onClick={() => void copy()} className="text-sm font-medium text-orange hover:underline">
          {copied ? "Tracking number copied" : "Copy tracking number"}
        </button>
      </div>
      {/* Each cell draws its own 1px outline, so an incomplete last row leaves plain white space. */}
      <dl className="mt-6 grid grid-cols-1 overflow-hidden rounded-2xl border border-ink/8 bg-white sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className={`flex items-start gap-3 p-4 outline outline-1 outline-ink/8 ${row.wide ? "sm:col-span-2 lg:col-span-3" : ""}`}
          >
            <Icon name={row.icon} className="mt-0.5 size-4 shrink-0 text-orange" />
            <div className="min-w-0">
              <dt className="text-xs text-ink/50">{row.label}</dt>
              <dd className={`mt-0.5 break-words font-medium text-navy ${row.mono ? "font-mono tracking-wider" : ""}`}>{row.value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}
