"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { Button, Field, inputClass, Notice } from "@/components/admin/ui";
import type { Client, ClientInput } from "@/lib/admin-api";

/**
 * Register or edit a client. All contact fields are required. After saving, the address is
 * looked up on the map automatically; if it can't be found, coordinates can be entered by hand.
 */
export function ClientForm({
  client,
  onSaved,
  onCancel,
}: {
  client?: Client;
  onSaved: (client: Client) => void;
  onCancel?: () => void;
}) {
  const { api } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(client?.geocodeStatus === "manual" || client?.geocodeStatus === "failed");

  // Not a <form>: this sits inside the booking form, and a form inside a form makes the
  // browser submit the outer one instead. Validation and Enter-to-save are done by hand.
  const boxRef = useRef<HTMLDivElement>(null);

  async function save() {
    const box = boxRef.current;
    if (!box || busy) return;
    for (const input of Array.from(box.querySelectorAll("input"))) {
      if (!input.reportValidity()) return;
    }
    const value = (name: string) => (box.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? "").trim();
    const lat = value("lat");
    const lng = value("lng");

    const input: ClientInput = {
      name: value("name"),
      email: value("email"),
      phone: value("phone"),
      address: { street: value("street"), city: value("city"), country: value("country"), postalCode: value("postalCode") || undefined },
      ...(manual && lat && lng ? { location: { lat: Number(lat), lng: Number(lng) } } : {}),
    };

    setBusy(true);
    setError(null);
    try {
      const saved = client
        ? await api<Client>(`/clients/${client._id}`, { method: "PATCH", body: input })
        : await api<Client>("/clients", { method: "POST", body: input });
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save the client.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={boxRef}
      className="space-y-4"
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        const target = event.target as HTMLInputElement;
        if (event.key === "Enter" && target.tagName === "INPUT" && target.type !== "checkbox") {
          event.preventDefault();
          void save();
        }
      }}
    >
      {error && <Notice kind="error">{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" className="sm:col-span-2">
          <input name="name" required maxLength={120} defaultValue={client?.name} autoComplete="off" className={inputClass} />
        </Field>
        <Field label="Email" hint="The tracking number is sent here.">
          <input name="email" type="email" required maxLength={200} defaultValue={client?.email} autoComplete="off" className={inputClass} />
        </Field>
        <Field label="Phone">
          <input name="phone" type="tel" required maxLength={40} defaultValue={client?.phone} placeholder="+237 6XX XXX XXX" autoComplete="off" className={inputClass} />
        </Field>
        <Field label="Street address" className="sm:col-span-2">
          <input name="street" required maxLength={200} defaultValue={client?.address.street} autoComplete="off" className={inputClass} />
        </Field>
        <Field label="City">
          <input name="city" required maxLength={100} defaultValue={client?.address.city} autoComplete="off" className={inputClass} />
        </Field>
        <div className="grid grid-cols-[1fr_7rem] gap-4">
          <Field label="Country">
            <input name="country" required maxLength={100} defaultValue={client?.address.country} autoComplete="off" className={inputClass} />
          </Field>
          <Field label="Postcode">
            <input name="postalCode" maxLength={20} defaultValue={client?.address.postalCode} autoComplete="off" className={inputClass} />
          </Field>
        </div>
      </div>

      <label className="flex items-center gap-2.5 text-sm text-ink/70">
        <input type="checkbox" checked={manual} onChange={(event) => setManual(event.target.checked)} className="size-4 accent-orange" />
        Enter map coordinates by hand (only if the address isn&apos;t found automatically)
      </label>
      {manual && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Latitude" hint="e.g. 4.0511">
            <input name="lat" type="number" step="any" min={-90} max={90} required defaultValue={client?.location?.lat} className={inputClass} />
          </Field>
          <Field label="Longitude" hint="e.g. 9.7679">
            <input name="lng" type="number" step="any" min={-180} max={180} required defaultValue={client?.location?.lng} className={inputClass} />
          </Field>
        </div>
      )}

      <div className="flex flex-wrap gap-3 pt-1">
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? "Saving and finding the address…" : client ? "Save changes" : "Register client"}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

/** Small label showing whether the client's address was found on the map. */
export function GeocodeBadge({ status }: { status: Client["geocodeStatus"] }) {
  const map = {
    ok: { text: "On map", style: "bg-emerald-100 text-emerald-800" },
    manual: { text: "On map (manual)", style: "bg-emerald-100 text-emerald-800" },
    failed: { text: "Not on map", style: "bg-amber-100 text-amber-800" },
  }[status];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${map.style}`}>{map.text}</span>;
}
