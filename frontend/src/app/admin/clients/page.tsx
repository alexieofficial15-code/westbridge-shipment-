"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { ClientForm, GeocodeBadge } from "@/components/admin/ClientForm";
import { Button, Card, Notice, PageHeader, inputClass } from "@/components/admin/ui";
import { query, type Client, type Paged } from "@/lib/admin-api";

export default function ClientsPage() {
  const { api } = useAdmin();
  const [list, setList] = useState<Paged<Client> | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Client | "new" | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(
    () =>
      api<Paged<Client>>(`/clients${query({ q: search.trim(), limit: 100 })}`).then(setList, (caught: Error) =>
        setNotice({ kind: "error", text: caught.message }),
      ),
    [api, search],
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function remove(client: Client) {
    if (!window.confirm(`Delete ${client.name}? This can't be undone.`)) return;
    try {
      await api(`/clients/${client._id}`, { method: "DELETE" });
      setNotice({ kind: "success", text: `${client.name} was deleted.` });
      void load();
    } catch (caught) {
      setNotice({ kind: "error", text: caught instanceof Error ? caught.message : "Couldn't delete the client." });
    }
  }

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="Register senders and receivers once, then pick them when booking."
        action={!editing && <Button onClick={() => setEditing("new")}>+ Register client</Button>}
      />

      {notice && (
        <div className="mb-6">
          <Notice kind={notice.kind}>{notice.text}</Notice>
        </div>
      )}

      {editing && (
        <Card title={editing === "new" ? "Register a client" : `Edit ${editing.name}`} className="mb-6">
          <ClientForm
            client={editing === "new" ? undefined : editing}
            onCancel={() => setEditing(null)}
            onSaved={(saved) => {
              setEditing(null);
              setNotice({
                kind: saved.geocodeStatus === "failed" ? "error" : "success",
                text:
                  saved.geocodeStatus === "failed"
                    ? `${saved.name} was saved, but the address wasn't found on the map. Edit the client to enter coordinates, or routes will only show city level.`
                    : `${saved.name} was saved and placed on the map.`,
              });
              void load();
            }}
          />
        </Card>
      )}

      <Card>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, email or phone"
          className={`${inputClass} mb-5`}
          aria-label="Search clients"
        />
        {!list ? (
          <div className="h-40 animate-pulse rounded-2xl bg-ink/5" />
        ) : list.items.length === 0 ? (
          <p className="py-12 text-center text-ink/55">{search ? "No clients match." : "No clients yet."}</p>
        ) : (
          <ul className="divide-y divide-ink/6">
            {list.items.map((client) => (
              <li key={client._id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-navy">{client.name}</span>
                    <GeocodeBadge status={client.geocodeStatus} />
                  </div>
                  <p className="mt-1 text-sm text-ink/60">
                    {client.email} · {client.phone}
                  </p>
                  <p className="text-sm text-ink/45">
                    {client.address.street}, {client.address.city}, {client.address.country}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setEditing(client)}>
                    Edit
                  </Button>
                  <Button variant="danger" onClick={() => void remove(client)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {list && list.total > list.items.length && (
          <p className="mt-4 text-sm text-ink/50">Showing {list.items.length} of {list.total}. Search to find others.</p>
        )}
      </Card>
    </>
  );
}
