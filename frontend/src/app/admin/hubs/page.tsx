"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { Button, Card, Field, Notice, PageHeader, inputClass, selectClass } from "@/components/admin/ui";
import { TrackingMap } from "@/components/TrackingMap";
import type { Hub, HubKind, Point } from "@/lib/admin-api";

const KIND_LABELS: Record<HubKind, string> = { office: "Office / warehouse", airport: "Airport", port: "Seaport" };

export default function HubsPage() {
  const { api } = useAdmin();
  const [hubs, setHubs] = useState<Hub[] | null>(null);
  const [picked, setPicked] = useState<Point | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(
    () => api<{ items: Hub[] }>("/hubs").then((result) => setHubs(result.items), (caught: Error) => setNotice({ kind: "error", text: caught.message })),
    [api],
  );
  useEffect(() => void load(), [load]);

  const markers = useMemo(
    () => (hubs ?? []).map((hub) => ({ ...hub.location, label: `${hub.name} (${KIND_LABELS[hub.kind]})`, muted: !hub.active })),
    [hubs],
  );

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    setBusy(true);
    setNotice(null);
    try {
      const hub = await api<Hub>("/hubs", {
        method: "POST",
        body: {
          name: value("name"),
          kind: value("kind"),
          city: value("city"),
          country: value("country"),
          ...(picked ? { location: picked } : {}),
        },
      });
      setNotice({ kind: "success", text: `${hub.name} was added. New shipments will be routed through it.` });
      setPicked(null);
      setFormKey((key) => key + 1);
      void load();
    } catch (caught) {
      setNotice({ kind: "error", text: caught instanceof Error ? caught.message : "Couldn't add the hub." });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(hub: Hub) {
    try {
      await api(`/hubs/${hub._id}`, { method: "PATCH", body: { active: !hub.active } });
      void load();
    } catch (caught) {
      setNotice({ kind: "error", text: caught instanceof Error ? caught.message : "Couldn't update the hub." });
    }
  }

  async function remove(hub: Hub) {
    if (!window.confirm(`Delete ${hub.name}? Existing shipments keep their routes.`)) return;
    try {
      await api(`/hubs/${hub._id}`, { method: "DELETE" });
      void load();
    } catch (caught) {
      setNotice({ kind: "error", text: caught instanceof Error ? caught.message : "Couldn't delete the hub." });
    }
  }

  return (
    <>
      <PageHeader
        title="Hubs"
        subtitle="Your offices, warehouses, airports and ports. New shipments are routed through the nearest ones automatically."
      />

      {notice && (
        <div className="mb-6">
          <Notice kind={notice.kind}>{notice.text}</Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Map" description="Click the map to place a new hub exactly, or leave it and we'll find the city.">
          <TrackingMap markers={markers} picked={picked} onPick={setPicked} />
        </Card>

        <Card title="Add a hub">
          <form key={formKey} onSubmit={handleAdd} className="space-y-4">
            <Field label="Name" hint='e.g. "Douala Hub" or "Douala International Airport"'>
              <input name="name" required maxLength={120} className={inputClass} />
            </Field>
            <Field label="Type">
              <select name="kind" required className={selectClass} defaultValue="office">
                {(Object.keys(KIND_LABELS) as HubKind[]).map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="City">
                <input name="city" required maxLength={100} className={inputClass} />
              </Field>
              <Field label="Country">
                <input name="country" required maxLength={100} className={inputClass} />
              </Field>
            </div>
            <p className="text-sm text-ink/55">
              {picked ? `Position picked on the map: ${picked.lat}, ${picked.lng}` : "No position picked: we'll look the place up."}
            </p>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Adding…" : "Add hub"}
            </Button>
          </form>
        </Card>
      </div>

      <Card title="All hubs" className="mt-6">
        {!hubs ? (
          <div className="h-32 animate-pulse rounded-2xl bg-ink/5" />
        ) : hubs.length === 0 ? (
          <p className="py-10 text-center text-ink/55">No hubs yet. Add your offices first, then airports and ports.</p>
        ) : (
          <ul className="divide-y divide-ink/6">
            {hubs.map((hub) => (
              <li key={hub._id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-medium ${hub.active ? "text-navy" : "text-ink/40"}`}>{hub.name}</span>
                    <span className="rounded-full bg-ink/6 px-2.5 py-1 text-xs text-ink/60">{KIND_LABELS[hub.kind]}</span>
                    {!hub.active && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800">Not used for new shipments</span>}
                  </div>
                  <p className="mt-1 text-sm text-ink/50">
                    {hub.city}, {hub.country} · {hub.location.lat.toFixed(4)}, {hub.location.lng.toFixed(4)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => void toggle(hub)}>
                    {hub.active ? "Pause" : "Use again"}
                  </Button>
                  <Button variant="danger" onClick={() => void remove(hub)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
