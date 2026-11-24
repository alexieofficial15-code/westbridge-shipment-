"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { ClientForm } from "@/components/admin/ClientForm";
import { Button, inputClass } from "@/components/admin/ui";
import { query, type Client, type Paged } from "@/lib/admin-api";

/** Search and pick a registered client, or register a new one on the spot. */
export function ClientPicker({
  label,
  value,
  onChange,
  excludeId,
}: {
  label: string;
  value: Client | null;
  onChange: (client: Client | null) => void;
  excludeId?: string;
}) {
  const { api } = useAdmin();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Client[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (value || creating) return;
    const timer = setTimeout(() => {
      api<Paged<Client>>(`/clients${query({ q: search.trim(), limit: 8 })}`).then(
        (result) => setResults(result.items.filter((client) => client._id !== excludeId)),
        () => setResults([]),
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [api, search, value, creating, excludeId]);

  if (value) {
    return (
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-orange/30 bg-orange/5 p-4">
        <div className="min-w-0 text-sm">
          <p className="font-medium text-navy">{value.name}</p>
          <p className="text-ink/60">
            {value.email} · {value.phone}
          </p>
          <p className="text-ink/50">
            {value.address.street}, {value.address.city}, {value.address.country}
          </p>
        </div>
        <Button variant="ghost" onClick={() => onChange(null)} className="h-9 px-3">
          Change
        </Button>
      </div>
    );
  }

  if (creating) {
    return (
      <div className="rounded-2xl border border-ink/10 bg-paper p-4 sm:p-5">
        <p className="mb-4 text-sm font-medium text-navy">Register a new {label.toLowerCase()}</p>
        <ClientForm
          onCancel={() => setCreating(false)}
          onSaved={(client) => {
            setCreating(false);
            onChange(client);
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={`Search for the ${label.toLowerCase()} by name, email or phone`}
        className={inputClass}
        aria-label={`Search ${label}`}
      />
      <ul className="mt-2 divide-y divide-ink/6 overflow-hidden rounded-2xl border border-ink/8">
        {results.map((client) => (
          <li key={client._id}>
            <button type="button" onClick={() => onChange(client)} className="block w-full px-4 py-3 text-left text-sm transition hover:bg-paper">
              <span className="font-medium text-navy">{client.name}</span>
              <span className="text-ink/50">
                {" "}
                · {client.address.city}, {client.address.country} · {client.email}
              </span>
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="px-4 py-3 text-sm text-ink/50">No matching clients.</li>}
      </ul>
      <button type="button" onClick={() => setCreating(true)} className="mt-3 text-sm font-medium text-orange hover:underline">
        + Register a new {label.toLowerCase()}
      </button>
    </div>
  );
}
