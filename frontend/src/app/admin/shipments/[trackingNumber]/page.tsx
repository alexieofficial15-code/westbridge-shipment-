"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { Button, Card, Field, Notice, PageHeader, StatusBadge, formatDate, formatDateTime, inputClass, selectClass } from "@/components/admin/ui";
import { TrackingMap } from "@/components/TrackingMap";
import { photoUrl, SERVICE_LABELS, SHIPMENT_STATUSES, STATUS_LABELS, type ServiceType, type ShipmentStatus } from "@/lib/api";
import type { AdminShipment, Client, Hub, PhotoInfo, Point } from "@/lib/admin-api";
import { resizeImage } from "@/lib/resize-image";

type Flash = { kind: "success" | "error" | "info"; text: string } | null;

export default function ShipmentDetailPage() {
  const { api } = useAdmin();
  const router = useRouter();
  const trackingNumber = String(useParams<{ trackingNumber: string }>().trackingNumber).toUpperCase();
  const [shipment, setShipment] = useState<AdminShipment | null>(null);
  const [photos, setPhotos] = useState<PhotoInfo[]>([]);
  const [flash, setFlash] = useState<Flash>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const say = (kind: NonNullable<Flash>["kind"], text: string) => setFlash({ kind, text });
  const fail = (caught: unknown, fallback: string) => say("error", caught instanceof Error ? caught.message : fallback);

  const load = useCallback(async () => {
    try {
      const [detail, photoList] = await Promise.all([
        api<AdminShipment>(`/shipments/${trackingNumber}`),
        api<{ items: PhotoInfo[] }>(`/shipments/${trackingNumber}/photos`),
      ]);
      setShipment(detail);
      setPhotos(photoList.items);
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "Couldn't load the shipment.");
    }
  }, [api, trackingNumber]);

  useEffect(() => {
    void load();
    // Arriving straight from the booking form.
    const params = new URLSearchParams(window.location.search);
    if (params.get("booked") === "1") {
      const added = Number(params.get("photos") ?? 0);
      const tried = Number(params.get("photosTried") ?? 0);
      const photoText =
        tried === 0
          ? ""
          : added === tried
            ? ` ${added} ${added === 1 ? "photo was" : "photos were"} added.`
            : ` Only ${added} of ${tried} photos uploaded; add the rest under "Package photos" below.`;
      const emailed = params.get("emailed") === "1";
      setFlash({
        kind: (tried > 0 && added < tried) || !emailed ? "info" : "success",
        text: `Shipment booked. ${emailOutcome(emailed)}${photoText}`,
      });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [load]);

  // While the automatic simulation runs, refresh every 20 seconds so the map and progress move.
  const simulating = Boolean(shipment?.simulationInfo);
  useEffect(() => {
    if (!simulating) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      api<AdminShipment>(`/shipments/${trackingNumber}`).then(setShipment, () => {});
    }, 20_000);
    return () => clearInterval(timer);
  }, [simulating, api, trackingNumber]);

  if (loadError) {
    return (
      <div className="space-y-4">
        <Notice kind="error">{loadError}</Notice>
        <Link href="/admin" className="text-sm text-orange hover:underline">
          ← Back to shipments
        </Link>
      </div>
    );
  }
  if (!shipment) return <div className="h-96 animate-pulse rounded-3xl bg-ink/5" />;

  function emailOutcome(emailed: boolean) {
    return emailed
      ? "The tracking number was emailed to the receiver, with any package photos at the bottom."
      : "The email to the receiver couldn't be sent. Check the receiver's email address, then use \"Resend email\".";
  }

  async function resendEmail() {
    try {
      const result = await api<{ emailed: boolean }>(`/shipments/${trackingNumber}/resend-email`, { method: "POST" });
      say(result.emailed ? "success" : "info", emailOutcome(result.emailed));
    } catch (caught) {
      fail(caught, "Couldn't send the email.");
    }
  }

  async function remove() {
    if (!window.confirm(`Delete shipment ${trackingNumber}? Its tracking page will stop working. This can't be undone.`)) return;
    try {
      await api(`/shipments/${trackingNumber}`, { method: "DELETE" });
      router.push("/admin");
    } catch (caught) {
      fail(caught, "Couldn't delete the shipment.");
    }
  }

  return (
    <>
      <PageHeader
        title={shipment.trackingNumber}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={shipment.status} />
            <span>
              {SERVICE_LABELS[shipment.service]} · {shipment.route[0]?.label} → {shipment.route.at(-1)?.label}
            </span>
          </span>
        }
        action={
          <div className="flex flex-wrap gap-2">
            <a
              href={`/track/${shipment.trackingNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center rounded-full border border-ink/15 bg-white px-5 text-sm font-medium text-navy transition hover:bg-ink/5"
            >
              Customer page ↗
            </a>
            <Button variant="secondary" onClick={() => void resendEmail()}>
              Resend email
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              Delete
            </Button>
          </div>
        }
      />

      {flash && (
        <div className="mb-6">
          <Notice kind={flash.kind}>{flash.text}</Notice>
        </div>
      )}

      <SimulationCard shipment={shipment} onUpdated={setShipment} say={say} fail={fail} />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <VehiclePosition shipment={shipment} onUpdated={setShipment} say={say} fail={fail} />
        <StatusUpdate shipment={shipment} onUpdated={setShipment} say={say} fail={fail} />
      </div>

      <NoticeCard shipment={shipment} onUpdated={setShipment} say={say} fail={fail} />

      <Photos trackingNumber={trackingNumber} photos={photos} onChange={setPhotos} say={say} fail={fail} />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <ClientCard title="Sender" client={shipment.sender} />
        <ClientCard title="Receiver" client={shipment.receiver} />
        <PackageCard shipment={shipment} onUpdated={setShipment} say={say} fail={fail} />
      </div>

      <RouteCard shipment={shipment} onUpdated={setShipment} say={say} fail={fail} />
    </>
  );
}

type SectionProps = {
  shipment: AdminShipment;
  onUpdated: (shipment: AdminShipment) => void;
  say: (kind: "success" | "error" | "info", text: string) => void;
  fail: (caught: unknown, fallback: string) => void;
};

/** What "Move to next step" will do from here, worded for the button. */
function nextStepLabel(shipment: AdminShipment): string | null {
  const lastStop = shipment.route.length - 1;
  const lastHub = lastStop - 1;
  if (shipment.status === "delivered" || shipment.currentStop >= lastStop) return null;
  if (shipment.status === "pending") return "Mark as picked up";
  if (shipment.currentStop < lastHub) return `Move to ${shipment.route[shipment.currentStop + 1]?.label ?? "next hub"}`;
  if (shipment.status !== "out_for_delivery" && shipment.status !== "ready_for_pickup") return "Send out for delivery";
  return "Mark as delivered";
}

const UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440 } as const;

/**
 * Full control of the delivery simulation: step it along by hand, or let it run by itself so the
 * shipment arrives in a chosen time. The server keeps it going with nobody on the site.
 */
function SimulationCard({ shipment, onUpdated, say, fail }: SectionProps) {
  const { api } = useAdmin();
  const [notify, setNotify] = useState(true);
  const [amount, setAmount] = useState("3");
  const [unit, setUnit] = useState<keyof typeof UNIT_MINUTES>("days");
  const [busy, setBusy] = useState<"step" | "start" | "stop" | null>(null);
  const info = shipment.simulationInfo;
  const stepLabel = nextStepLabel(shipment);
  const arrived = stepLabel === null;

  async function step() {
    if (info && !window.confirm("The automatic simulation is running. Moving it by hand stops it. Continue?")) return;
    setBusy("step");
    try {
      const updated = await api<AdminShipment>(`/shipments/${shipment.trackingNumber}/next-stop`, { method: "POST", body: { notify } });
      onUpdated(updated);
      say("success", `Done: now "${STATUS_LABELS[updated.status]}" at ${updated.route[updated.currentStop]?.label}.`);
    } catch (caught) {
      fail(caught, "Couldn't move the shipment on.");
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    const minutes = Number(amount) * UNIT_MINUTES[unit];
    if (!Number.isFinite(minutes) || minutes < 5) return say("error", "Choose at least 5 minutes.");
    setBusy("start");
    try {
      const updated = await api<AdminShipment>(`/shipments/${shipment.trackingNumber}/simulation`, {
        method: "POST",
        body: { durationMinutes: minutes, notify },
      });
      onUpdated(updated);
      say(
        "success",
        `Simulation started. It arrives ${updated.simulationInfo ? formatDateTime(updated.simulationInfo.endsAt) : "on time"}, and keeps going even when you close the dashboard.`,
      );
    } catch (caught) {
      fail(caught, "Couldn't start the simulation.");
    } finally {
      setBusy(null);
    }
  }

  async function stop() {
    if (!window.confirm("Stop the simulation? The vehicle stays where it is now.")) return;
    setBusy("stop");
    try {
      onUpdated(await api<AdminShipment>(`/shipments/${shipment.trackingNumber}/simulation`, { method: "DELETE" }));
      say("success", "Simulation stopped. The vehicle stays where it was.");
    } catch (caught) {
      fail(caught, "Couldn't stop the simulation.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title="Delivery simulation"
      description="Until GPS trackers are fitted: move the shipment on step by step, or set how long it should take and let it run by itself."
      className="mb-6"
    >
      {info ? (
        <div className="rounded-2xl border border-orange/30 bg-orange/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2.5 font-medium text-navy">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-orange opacity-70" />
                <span className="relative inline-flex size-2.5 rounded-full bg-orange" />
              </span>
              Running by itself{info.nextStop ? `, heading for ${info.nextStop}` : ""}
            </p>
            <Button variant="danger" onClick={() => void stop()} disabled={busy !== null}>
              {busy === "stop" ? "Stopping…" : "Stop simulation"}
            </Button>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink/10">
            <div className="h-full rounded-full bg-orange transition-[width] duration-1000" style={{ width: `${info.progress}%` }} />
          </div>
          <p className="mt-2 text-sm text-ink/60">
            {info.progress}% · started {formatDateTime(info.startedAt)} · arrives <strong className="text-navy">{formatDateTime(info.endsAt)}</strong>
            {info.notify ? " · emails the receiver at pickup, out for delivery and delivery" : ""}
          </p>
          <p className="mt-1 text-xs text-ink/45">
            Hub arrivals are posted automatically as their time comes. It keeps going when the dashboard is closed. A manual update or position stops it.
          </p>
        </div>
      ) : arrived ? (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">This shipment has been delivered. Nothing left to simulate.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-ink/10 p-5">
            <p className="font-medium text-navy">Step by step</p>
            <p className="mt-1 text-sm text-ink/55">Moves it to the next stop and posts the update, e.g. &quot;Arrived at …&quot;.</p>
            <Button onClick={() => void step()} disabled={busy !== null} className="mt-4 w-full">
              {busy === "step" ? "Moving…" : `${stepLabel} →`}
            </Button>
          </div>
          <div className="rounded-2xl border border-ink/10 p-5">
            <p className="font-medium text-navy">Automatic</p>
            <p className="mt-1 text-sm text-ink/55">Delivers in the time you choose, moving along the route by itself.</p>
            <div className="mt-4 flex gap-2">
              <label className="sr-only" htmlFor="sim-amount">
                Delivery time
              </label>
              <input
                id="sim-amount"
                type="number"
                min={1}
                step="any"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={`${inputClass} w-20! shrink-0`}
              />
              <select
                value={unit}
                onChange={(event) => setUnit(event.target.value as keyof typeof UNIT_MINUTES)}
                className={`${selectClass} min-w-28 flex-1`}
                aria-label="Unit"
              >
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
              <Button onClick={() => void start()} disabled={busy !== null}>
                {busy === "start" ? "Starting…" : "Start"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {!arrived && (
        <label className="mt-4 flex items-center gap-2.5 text-sm text-ink/70">
          <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} className="size-4 accent-orange" />
          Email the receiver (each step by hand; pickup, out for delivery and delivery when automatic)
        </label>
      )}
    </Card>
  );
}

/** The GPS simulation: set where the vehicle is, from the driver's reports. */
function VehiclePosition({ shipment, onUpdated, say, fail }: SectionProps) {
  const { api } = useAdmin();
  const [picked, setPicked] = useState<Point | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const vehicle = shipment.vehicle ? { ...shipment.vehicle.location, note: shipment.vehicle.note } : null;
  const trail = useMemo(() => shipment.trail.map(({ lat, lng }) => ({ lat, lng })), [shipment.trail]);

  async function save(point: Point) {
    setBusy(true);
    try {
      const result = await api<{ vehicle: AdminShipment["vehicle"]; trail: AdminShipment["trail"] }>(`/shipments/${shipment.trackingNumber}/position`, {
        method: "POST",
        body: { ...point, note: note.trim() || undefined },
      });
      onUpdated({ ...shipment, vehicle: result.vehicle, trail: result.trail });
      setPicked(null);
      setNote("");
      say("success", "Position saved. The customer's map shows it within 15 seconds.");
    } catch (caught) {
      fail(caught, "Couldn't save the position.");
    } finally {
      setBusy(false);
    }
  }

  function useDeviceLocation() {
    if (!navigator.geolocation) return say("error", "This device can't share its location.");
    navigator.geolocation.getCurrentPosition(
      (position) => setPicked({ lat: Number(position.coords.latitude.toFixed(5)), lng: Number(position.coords.longitude.toFixed(5)) }),
      () => say("error", "Location permission was refused, or the location isn't available."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function clear(withTrail: boolean) {
    const question = withTrail
      ? "Remove the vehicle marker and the line it has driven? The map will show only the planned route."
      : "Remove the vehicle marker? The map will show the current route stop instead.";
    if (!window.confirm(question)) return;
    try {
      const result = await api<{ trail: AdminShipment["trail"] }>(`/shipments/${shipment.trackingNumber}/position${withTrail ? "?trail=1" : ""}`, {
        method: "DELETE",
      });
      onUpdated({ ...shipment, vehicle: null, trail: result.trail });
      say("success", withTrail ? "Vehicle marker and driven line removed." : "Vehicle marker removed.");
    } catch (caught) {
      fail(caught, "Couldn't remove the marker.");
    }
  }

  function submitTyped(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (picked) void save(picked);
  }

  return (
    <Card
      title="Vehicle position"
      description="GPS simulation: click the map where the driver says the vehicle is, add a note, and save. A GPS tracker will update this automatically later."
    >
      <TrackingMap route={shipment.route} currentStop={shipment.currentStop} vehicle={vehicle} trail={trail} picked={picked} onPick={setPicked} />

      <form onSubmit={submitTyped} className="mt-4 grid gap-3 sm:grid-cols-[7rem_7rem_1fr_auto]">
        <Field label="Latitude">
          <input
            type="number"
            step="any"
            min={-90}
            max={90}
            required
            value={picked?.lat ?? ""}
            onChange={(event) => setPicked({ lat: Number(event.target.value), lng: picked?.lng ?? 0 })}
            className={inputClass}
          />
        </Field>
        <Field label="Longitude">
          <input
            type="number"
            step="any"
            min={-180}
            max={180}
            required
            value={picked?.lng ?? ""}
            onChange={(event) => setPicked({ lat: picked?.lat ?? 0, lng: Number(event.target.value) })}
            className={inputClass}
          />
        </Field>
        <Field label="Driver's note (shown to the customer)">
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} placeholder="e.g. Passing Edea, on schedule" className={inputClass} />
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={busy || !picked} className="w-full">
            {busy ? "Saving…" : "Save position"}
          </Button>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <button type="button" onClick={useDeviceLocation} className="font-medium text-orange hover:underline">
          Use this device&apos;s location
        </button>
        {shipment.vehicle && (
          <button type="button" onClick={() => void clear(false)} className="text-ink/55 hover:text-red-700">
            Remove vehicle marker
          </button>
        )}
        {shipment.trail.length > 0 && (
          <button type="button" onClick={() => void clear(true)} className="text-ink/55 hover:text-red-700">
            Clear driven line
          </button>
        )}
        <span className="text-ink/45">
          {shipment.vehicle
            ? `Last position ${formatDateTime(shipment.vehicle.updatedAt)} (${shipment.vehicle.source === "gps" ? "GPS" : "entered by hand"})`
            : "No vehicle position yet: the map shows the current stop."}
        </span>
      </div>
    </Card>
  );
}

function StatusUpdate({ shipment, onUpdated, say, fail }: SectionProps) {
  const { api } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const events = [...shipment.events].reverse();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const stop = String(form.get("stopIndex") ?? "");
    const description = String(form.get("description") ?? "").trim();
    const status = String(form.get("status")) as ShipmentStatus;
    const notify = form.get("notify") === "on";
    if (shipment.simulationInfo && !window.confirm("The automatic simulation is running. Posting an update by hand stops it. Continue?")) return;
    setBusy(true);
    try {
      const updated = await api<AdminShipment>(`/shipments/${shipment.trackingNumber}/events`, {
        method: "POST",
        body: { status, notify, ...(stop ? { stopIndex: Number(stop) } : {}), ...(description ? { description } : {}) },
      });
      onUpdated(updated);
      setFormKey((key) => key + 1);
      say(
        "success",
        `Status set to "${STATUS_LABELS[status]}". The customer sees it within 15 seconds${notify ? ", and it was emailed to them (if email is set up)" : ""}.`,
      );
    } catch (caught) {
      fail(caught, "Couldn't post the update.");
    } finally {
      setBusy(false);
    }
  }

  async function removeEvent(index: number, label: string) {
    if (!window.confirm(`Remove "${label}" from the timeline? The customer will no longer see it.`)) return;
    try {
      onUpdated(await api<AdminShipment>(`/shipments/${shipment.trackingNumber}/events/${index}`, { method: "DELETE" }));
      say("success", "Update removed. The status is back to the previous update.");
    } catch (caught) {
      fail(caught, "Couldn't remove the update.");
    }
  }

  return (
    <Card title="Status update" description="Moves the shipment along its route and appears on the customer's timeline.">
      <form key={formKey} onSubmit={handleSubmit} className="space-y-4">
        <Field label="New status">
          <select name="status" defaultValue={nextStatus(shipment.status)} className={selectClass}>
            {SHIPMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Where" hint="Automatic moves it to the next stop for that status.">
          <select name="stopIndex" defaultValue="" className={selectClass}>
            <option value="">Automatic</option>
            {shipment.route.map((stop, index) => (
              <option key={index} value={index}>
                {index + 1}. {stop.label}
                {index === shipment.currentStop ? " (now)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Message to the customer" hint="Optional. Leave empty for the standard wording.">
          <input name="description" maxLength={300} placeholder="e.g. Delayed by weather, new estimate tomorrow" className={inputClass} />
        </Field>
        <label className="flex items-center gap-2.5 text-sm text-ink/70">
          <input name="notify" type="checkbox" defaultChecked className="size-4 accent-orange" />
          Email this update to the receiver
        </label>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Posting…" : "Post update"}
        </Button>
      </form>

      <h3 className="mb-1 mt-8 text-sm font-medium text-navy">History</h3>
      <p className="mb-3 text-xs text-ink/50">Posted something by mistake? Remove it: the status goes back to the previous update.</p>
      <ol className="space-y-4 border-l-2 border-ink/8 pl-5">
        {events.map((event, index) => {
          // The list is newest first; the server counts from the oldest.
          const originalIndex = shipment.events.length - 1 - index;
          return (
            <li key={`${event.timestamp}-${index}`} className="group relative">
              <span className={`absolute -left-[27px] top-1.5 size-3 rounded-full ring-4 ring-white ${index === 0 ? "bg-orange" : "bg-ink/20"}`} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{event.description ?? STATUS_LABELS[event.status]}</p>
                  <p className="text-xs text-ink/50">
                    {STATUS_LABELS[event.status]} · {event.location ? `${event.location} · ` : ""}
                    {formatDateTime(event.timestamp)}
                  </p>
                </div>
                {originalIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => void removeEvent(originalIndex, event.description ?? STATUS_LABELS[event.status])}
                    className="shrink-0 rounded-full px-2.5 py-1 text-xs text-ink/45 transition hover:bg-red-50 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** The status most likely to come next, so the dropdown starts on it. */
function nextStatus(current: ShipmentStatus): ShipmentStatus {
  const order: ShipmentStatus[] = ["pending", "picked_up", "in_transit", "out_for_delivery", "delivered"];
  if (current === "at_customs") return "in_transit";
  if (current === "ready_for_pickup") return "delivered";
  const index = order.indexOf(current);
  if (index === -1) return current;
  // "In transit" usually repeats once per hub before "Out for delivery".
  if (current === "in_transit") return "in_transit";
  return order[Math.min(index + 1, order.length - 1)]!;
}

function Photos({
  trackingNumber,
  photos,
  onChange,
  say,
  fail,
}: {
  trackingNumber: string;
  photos: PhotoInfo[];
  onChange: (photos: PhotoInfo[]) => void;
  say: SectionProps["say"];
  fail: SectionProps["fail"];
}) {
  const { api } = useAdmin();
  const [uploading, setUploading] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    let current = photos;
    let added = 0;
    try {
      for (const [index, file] of Array.from(files).entries()) {
        setUploading(`Uploading ${index + 1} of ${files.length}…`);
        const blob = await resizeImage(file);
        const form = new FormData();
        form.append("photo", blob, "package.jpg");
        const photo = await api<PhotoInfo>(`/shipments/${trackingNumber}/photos`, { method: "POST", form });
        current = [...current, photo];
        onChange(current);
        added++;
      }
      say("success", `${added} ${added === 1 ? "photo" : "photos"} added. They show on the customer's page.`);
    } catch (caught) {
      fail(caught, "Couldn't upload the photo.");
    } finally {
      setUploading(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this photo?")) return;
    try {
      await api(`/shipments/${trackingNumber}/photos/${id}`, { method: "DELETE" });
      onChange(photos.filter((photo) => photo._id !== id));
    } catch (caught) {
      fail(caught, "Couldn't delete the photo.");
    }
  }

  return (
    <Card
      title="Package photos"
      description="Shown to the customer under their shipment status. Up to 10 photos; they're shrunk automatically before upload."
      className="mt-6"
      action={
        <label className="inline-flex h-11 cursor-pointer items-center rounded-full bg-orange px-5 text-sm font-medium text-white shadow-sm shadow-orange/25 transition hover:bg-[#d9531a]">
          {uploading ?? "+ Add photos"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={Boolean(uploading) || photos.length >= 10}
            className="sr-only"
            onChange={(event) => {
              void upload(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      }
    >
      {photos.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink/50">No photos yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {photos.map((photo) => (
            <li key={photo._id} className="group relative aspect-square overflow-hidden rounded-2xl bg-ink/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(trackingNumber, photo._id)} alt="Package" className="size-full object-cover" />
              <button
                type="button"
                onClick={() => void remove(photo._id)}
                className="absolute right-2 top-2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-red-700 opacity-0 shadow transition group-hover:opacity-100 focus:opacity-100"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ClientCard({ title, client }: { title: string; client: Client }) {
  return (
    <Card title={title}>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="sr-only">Name</dt>
          <dd className="font-medium text-navy">{client.name}</dd>
        </div>
        <div>
          <dt className="sr-only">Email</dt>
          <dd>
            <a href={`mailto:${client.email}`} className="text-ink/70 hover:text-orange">
              {client.email}
            </a>
          </dd>
        </div>
        <div>
          <dt className="sr-only">Phone</dt>
          <dd>
            <a href={`tel:${client.phone.replace(/\s/g, "")}`} className="text-ink/70 hover:text-orange">
              {client.phone}
            </a>
          </dd>
        </div>
        <div>
          <dt className="sr-only">Address</dt>
          <dd className="text-ink/55">
            {client.address.street}
            <br />
            {client.address.postalCode ? `${client.address.postalCode} ` : ""}
            {client.address.city}, {client.address.country}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

/** The admin's own message on the customer's page, in place of the standard "What to do now". */
function NoticeCard({ shipment, onUpdated, say, fail }: SectionProps) {
  const { api } = useAdmin();
  const [text, setText] = useState(shipment.notice ?? "");
  const [busy, setBusy] = useState(false);

  async function save(value: string) {
    setBusy(true);
    try {
      onUpdated(await api<AdminShipment>(`/shipments/${shipment.trackingNumber}`, { method: "PATCH", body: { notice: value } }));
      setText(value);
      say("success", value ? "Message saved. The customer sees it at the top of their page." : "Message removed. The customer sees the standard text again.");
    } catch (caught) {
      fail(caught, "Couldn't save the message.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Message on the customer's page"
      description='Shown at the top of their page as "A message from our team", in place of the standard "What to do now" text.'
      className="mt-6"
    >
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={300}
        rows={2}
        placeholder="e.g. Your parcel is ready at our Douala office. Bring your ID when collecting."
        className={`${inputClass} h-auto resize-none py-3`}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={() => void save(text.trim())} disabled={busy || text.trim() === (shipment.notice ?? "")}>
          {busy ? "Saving…" : "Save message"}
        </Button>
        {shipment.notice && (
          <Button variant="ghost" onClick={() => void save("")} disabled={busy}>
            Remove message
          </Button>
        )}
        <span className="text-xs text-ink/45">{text.length}/300</span>
      </div>
    </Card>
  );
}

function PackageCard({ shipment, onUpdated, say, fail }: SectionProps) {
  const { api } = useAdmin();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const p = shipment.package;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const number = (name: string) => Number(form.get(name));
    const eta = String(form.get("estimatedDelivery") ?? "");
    const service = String(form.get("service")) as ServiceType;
    if (service !== shipment.service && !window.confirm(`Change the service to ${SERVICE_LABELS[service]}? The route will be planned again for it.`)) return;
    setBusy(true);
    try {
      const updated = await api<AdminShipment>(`/shipments/${shipment.trackingNumber}`, {
        method: "PATCH",
        body: {
          service,
          package: {
            weightKg: number("weightKg"),
            lengthCm: number("lengthCm"),
            widthCm: number("widthCm"),
            heightCm: number("heightCm"),
            pieces: number("pieces"),
            contents: String(form.get("contents") ?? "").trim(),
          },
          estimatedDelivery: eta ? new Date(`${eta}T17:00:00`).toISOString() : null,
        },
      });
      onUpdated(updated);
      setEditing(false);
      say("success", "Package details saved. The customer's page shows them within 15 seconds.");
    } catch (caught) {
      fail(caught, "Couldn't save the package details.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <Card title="Edit package">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Service">
            <select name="service" defaultValue={shipment.service} className={selectClass}>
              {(Object.keys(SERVICE_LABELS) as ServiceType[]).map((service) => (
                <option key={service} value={service}>
                  {SERVICE_LABELS[service]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Contents">
            <input name="contents" required maxLength={500} defaultValue={p.contents} className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Weight (kg)">
              <input name="weightKg" type="number" min={0.01} step="any" required defaultValue={p.weightKg} className={inputClass} />
            </Field>
            <Field label="Pieces">
              <input name="pieces" type="number" min={1} step={1} required defaultValue={p.pieces} className={inputClass} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="L (cm)">
              <input name="lengthCm" type="number" min={1} step="any" required defaultValue={p.lengthCm} className={inputClass} />
            </Field>
            <Field label="W (cm)">
              <input name="widthCm" type="number" min={1} step="any" required defaultValue={p.widthCm} className={inputClass} />
            </Field>
            <Field label="H (cm)">
              <input name="heightCm" type="number" min={1} step="any" required defaultValue={p.heightCm} className={inputClass} />
            </Field>
          </div>
          <Field label="Delivery estimate" hint="Leave empty to show “To be confirmed”.">
            <input
              name="estimatedDelivery"
              type="date"
              defaultValue={shipment.estimatedDelivery ? shipment.estimatedDelivery.slice(0, 10) : ""}
              className={inputClass}
            />
          </Field>
          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card
      title="Package"
      action={
        <Button variant="secondary" onClick={() => setEditing(true)} className="h-9 px-4">
          Edit
        </Button>
      }
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div className="col-span-2">
          <dt className="text-ink/50">Service</dt>
          <dd className="text-navy">{SERVICE_LABELS[shipment.service]}</dd>
        </div>
        <div>
          <dt className="text-ink/50">Weight</dt>
          <dd className="text-navy">{p.weightKg} kg</dd>
        </div>
        <div>
          <dt className="text-ink/50">Pieces</dt>
          <dd className="text-navy">{p.pieces}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-ink/50">Size (L × W × H)</dt>
          <dd className="text-navy">
            {p.lengthCm} × {p.widthCm} × {p.heightCm} cm
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-ink/50">Contents</dt>
          <dd className="text-navy">{p.contents}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-ink/50">Booked</dt>
          <dd className="text-navy">{formatDate(shipment.createdAt)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-ink/50">Delivery estimate</dt>
          <dd className="text-navy">{shipment.estimatedDelivery ? formatDate(shipment.estimatedDelivery) : "To be confirmed"}</dd>
        </div>
      </dl>
    </Card>
  );
}

function RouteCard({ shipment, onUpdated, say, fail }: SectionProps) {
  const { api } = useAdmin();
  const [editing, setEditing] = useState(false);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [chosen, setChosen] = useState<{ id: string; name: string }[]>([]);
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);

  async function replan() {
    if (!window.confirm("Plan the route again with the current hubs and client addresses? History is kept.")) return;
    try {
      onUpdated(await api<AdminShipment>(`/shipments/${shipment.trackingNumber}/replan`, { method: "POST" }));
      say("success", "Route planned again.");
    } catch (caught) {
      fail(caught, "Couldn't plan the route.");
    }
  }

  async function startEditing() {
    try {
      const result = await api<{ items: Hub[] }>("/hubs");
      setHubs(result.items);
      // Start from the current route's hubs, in order.
      setChosen(
        shipment.route
          .filter((stop) => stop.kind === "hub" && stop.hub)
          .map((stop) => ({ id: stop.hub!, name: stop.label })),
      );
      setAdding("");
      setEditing(true);
    } catch (caught) {
      fail(caught, "Couldn't load the hubs.");
    }
  }

  function move(index: number, delta: number) {
    setChosen((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  async function save() {
    setBusy(true);
    try {
      onUpdated(
        await api<AdminShipment>(`/shipments/${shipment.trackingNumber}/route`, {
          method: "PUT",
          body: { hubIds: chosen.map((hub) => hub.id) },
        }),
      );
      setEditing(false);
      say("success", "Route saved. The customer's map shows it within 15 seconds.");
    } catch (caught) {
      fail(caught, "Couldn't save the route.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    const origin = shipment.route[0]?.label;
    const destination = shipment.route.at(-1)?.label;
    return (
      <Card title="Edit route" description="Choose the hubs the shipment passes through, in order. The sender's and receiver's cities stay at each end." className="mt-6">
        <ol className="space-y-2 text-sm">
          <li className="rounded-2xl bg-ink/5 px-4 py-2.5 text-ink/60">Start: {origin}</li>
          {chosen.map((hub, index) => (
            <li key={`${hub.id}-${index}`} className="flex items-center gap-2 rounded-2xl border border-ink/10 px-4 py-2">
              <span className="flex-1 font-medium text-navy">
                {index + 1}. {hub.name}
              </span>
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="rounded-full px-2 py-1 text-ink/55 hover:bg-ink/5 disabled:opacity-30" aria-label="Move up">
                ↑
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === chosen.length - 1} className="rounded-full px-2 py-1 text-ink/55 hover:bg-ink/5 disabled:opacity-30" aria-label="Move down">
                ↓
              </button>
              <button
                type="button"
                onClick={() => setChosen((current) => current.filter((_, position) => position !== index))}
                className="rounded-full px-2.5 py-1 text-xs text-ink/50 hover:bg-red-50 hover:text-red-700"
              >
                Remove
              </button>
            </li>
          ))}
          {chosen.length === 0 && <li className="px-4 py-1 text-ink/45">No hubs: the shipment goes straight from start to end.</li>}
          <li className="rounded-2xl bg-ink/5 px-4 py-2.5 text-ink/60">End: {destination}</li>
        </ol>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <select value={adding} onChange={(event) => setAdding(event.target.value)} className={`${selectClass} sm:flex-1`} aria-label="Hub to add">
            <option value="">Choose a hub to add…</option>
            {hubs.map((hub) => (
              <option key={hub._id} value={hub._id}>
                {hub.name} ({hub.city}){hub.active ? "" : " – paused"}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            disabled={!adding || chosen.length >= 12}
            onClick={() => {
              const hub = hubs.find((item) => item._id === adding);
              if (hub) setChosen((current) => [...current, { id: hub._id, name: hub.name }]);
              setAdding("");
            }}
          >
            Add to route
          </Button>
        </div>

        <div className="mt-5 flex gap-2">
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save route"}
          </Button>
          <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Route"
      description="Planned automatically from the clients' addresses: the usual sorting hubs, airports or seaports for each country (or your own hubs where you've added them). You can also set the hubs by hand."
      className="mt-6"
      action={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void startEditing()}>
            Edit route
          </Button>
          <Button variant="secondary" onClick={() => void replan()}>
            Plan again
          </Button>
        </div>
      }
    >
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {shipment.route.map((stop, index) => (
          <li key={index} className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1.5 ${
                index === shipment.currentStop
                  ? "bg-orange text-white"
                  : index < shipment.currentStop
                    ? "bg-orange/12 text-[#b4440f]"
                    : "bg-ink/6 text-ink/60"
              }`}
            >
              {stop.label}
              {!stop.location && " (not on map)"}
            </span>
            {index < shipment.route.length - 1 && <span className="text-ink/30">→</span>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
