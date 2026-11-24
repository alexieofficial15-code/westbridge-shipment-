"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { ClientPicker } from "@/components/admin/ClientPicker";
import { Button, Card, Field, Notice, PageHeader, inputClass } from "@/components/admin/ui";
import { SERVICE_LABELS, type ServiceType } from "@/lib/api";
import type { AdminShipment, Client } from "@/lib/admin-api";
import { resizeImage } from "@/lib/resize-image";

const MAX_PHOTOS = 10;

const SERVICES: { value: ServiceType; hint: string }[] = [
  { value: "road", hint: "Office to office by truck" },
  { value: "air", hint: "Via the nearest airports" },
  { value: "sea", hint: "Via the nearest seaports" },
  { value: "door_to_door", hint: "Collected and delivered at the addresses" },
];

export default function BookShipmentPage() {
  const { api } = useAdmin();
  const router = useRouter();
  const [sender, setSender] = useState<Client | null>(null);
  const [receiver, setReceiver] = useState<Client | null>(null);
  const [service, setService] = useState<ServiceType>("road");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Photos picked before booking; uploaded right after the shipment is created.
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);

  // Free the preview images' memory when the page closes (removed ones are freed in removePhoto).
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.preview)), []);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, room)
      .map((file) => ({ file, preview: URL.createObjectURL(file) }));
    if (files.length > room) setError(`A shipment can have at most ${MAX_PHOTOS} photos; the extra ones were left out.`);
    setPhotos((current) => [...current, ...picked]);
  }

  function removePhoto(index: number) {
    const removed = photos[index];
    if (removed) URL.revokeObjectURL(removed.preview);
    setPhotos((current) => current.filter((_, position) => position !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sender || !receiver) {
      setError("Choose both a sender and a receiver.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const number = (name: string) => Number(form.get(name));
    const eta = String(form.get("estimatedDelivery") ?? "");

    setBusy(true);
    setError(null);
    setProgress("Booking…");
    try {
      const shipment = await api<AdminShipment & { emailed: boolean }>("/shipments", {
        method: "POST",
        body: {
          senderId: sender._id,
          receiverId: receiver._id,
          service,
          package: {
            weightKg: number("weightKg"),
            lengthCm: number("lengthCm"),
            widthCm: number("widthCm"),
            heightCm: number("heightCm"),
            pieces: number("pieces"),
            contents: String(form.get("contents") ?? "").trim(),
          },
          ...(eta ? { estimatedDelivery: new Date(`${eta}T17:00:00`).toISOString() } : {}),
          // With photos, the email waits until they're uploaded so they appear in it.
          sendEmail: photos.length === 0,
        },
      });
      let emailed = shipment.emailed;

      // The shipment exists now; a photo that fails doesn't undo the booking. Its page says how many made it.
      let uploaded = 0;
      for (const [index, photo] of photos.entries()) {
        setProgress(`Uploading photo ${index + 1} of ${photos.length}…`);
        try {
          const form = new FormData();
          form.append("photo", await resizeImage(photo.file), "package.jpg");
          await api(`/shipments/${shipment.trackingNumber}/photos`, { method: "POST", form });
          uploaded++;
        } catch {
          // counted below
        }
      }
      if (photos.length > 0) {
        setProgress("Emailing the receiver…");
        try {
          const sent = await api<{ emailed: boolean }>(`/shipments/${shipment.trackingNumber}/resend-email`, { method: "POST" });
          emailed = sent.emailed;
        } catch {
          emailed = false;
        }
      }
      router.push(
        `/admin/shipments/${shipment.trackingNumber}?booked=1&emailed=${emailed ? 1 : 0}&photos=${uploaded}&photosTried=${photos.length}`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't book the shipment.");
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Book a shipment"
        subtitle="The tracking number, route and delivery estimate are created automatically, and emailed to the receiver with the package photos."
        action={
          <Link href="/admin" className="text-sm text-ink/55 hover:text-navy">
            ← Back to shipments
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-2">
        <Card title="1. Sender" description="Who is sending it, and where it's collected.">
          <ClientPicker label="Sender" value={sender} onChange={setSender} excludeId={receiver?._id} />
        </Card>

        <Card title="2. Receiver" description="Who it's for, and where it's delivered.">
          <ClientPicker label="Receiver" value={receiver} onChange={setReceiver} excludeId={sender?._id} />
        </Card>

        <Card title="3. Service" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Service">
            {SERVICES.map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-2xl border p-4 transition ${
                  service === option.value ? "border-orange bg-orange/5 ring-2 ring-orange/15" : "border-ink/10 hover:border-ink/25"
                }`}
              >
                <input
                  type="radio"
                  name="service"
                  value={option.value}
                  checked={service === option.value}
                  onChange={() => setService(option.value)}
                  className="sr-only"
                />
                <span className="block font-medium text-navy">{SERVICE_LABELS[option.value]}</span>
                <span className="mt-1 block text-sm text-ink/55">{option.hint}</span>
              </label>
            ))}
          </div>
        </Card>

        <Card title="4. Package" className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <Field label="Weight (kg)">
              <input name="weightKg" type="number" min={0.01} step="any" required className={inputClass} />
            </Field>
            <Field label="Length (cm)">
              <input name="lengthCm" type="number" min={1} step="any" required className={inputClass} />
            </Field>
            <Field label="Width (cm)">
              <input name="widthCm" type="number" min={1} step="any" required className={inputClass} />
            </Field>
            <Field label="Height (cm)">
              <input name="heightCm" type="number" min={1} step="any" required className={inputClass} />
            </Field>
            <Field label="Pieces">
              <input name="pieces" type="number" min={1} step={1} defaultValue={1} required className={inputClass} />
            </Field>
            <Field label="Delivery estimate" hint="Leave empty to calculate it">
              <input name="estimatedDelivery" type="date" className={inputClass} />
            </Field>
            <Field label="Contents" className="sm:col-span-2 lg:col-span-6">
              <input name="contents" required maxLength={500} placeholder="e.g. 2 boxes of clothes and shoes" className={inputClass} />
            </Field>
          </div>
        </Card>

        <Card
          title="5. Package photos (optional)"
          description={`Shown to the customer on their tracking page, and when they click the parcel. Up to ${MAX_PHOTOS} photos; they're shrunk automatically before upload.`}
          className="lg:col-span-2"
        >
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
            {photos.map((photo, index) => (
              <li key={photo.preview} className="group relative aspect-square overflow-hidden rounded-2xl bg-ink/5">
                {/* A local preview of a file that hasn't been uploaded yet. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.preview} alt={`Photo ${index + 1}`} className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(index)}
                  disabled={busy}
                  className="absolute right-1.5 top-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-red-700 shadow"
                  aria-label={`Remove photo ${index + 1}`}
                >
                  Remove
                </button>
              </li>
            ))}
            {photos.length < MAX_PHOTOS && (
              <li>
                <label className="grid aspect-square cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-ink/15 text-center text-sm text-ink/55 transition hover:border-orange hover:text-orange">
                  <span>
                    <span className="block text-2xl leading-none">+</span>
                    <span className="mt-1 block">Add photos</span>
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    disabled={busy}
                    className="sr-only"
                    onChange={(event) => {
                      addPhotos(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
              </li>
            )}
          </ul>
          {photos.length === 0 && <p className="mt-3 text-sm text-ink/45">No photos yet. You can also add them later on the shipment&apos;s page.</p>}
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {error && <Notice kind="error">{error}</Notice>}
          <Button type="submit" disabled={busy || !sender || !receiver} className="h-12 px-8 text-base">
            {busy ? (progress ?? "Booking…") : "Book shipment and email the receiver"}
          </Button>
          {!busy && (!sender || !receiver) && (
            <p className="text-sm text-ink/55">
              To book, first choose{" "}
              {[!sender && "a sender (box 1)", !receiver && "a receiver (box 2)"].filter(Boolean).join(" and ")}. If you&apos;re
              adding a new client, press <strong>Register client</strong> to save them first.
            </p>
          )}
        </div>
      </form>
    </>
  );
}
