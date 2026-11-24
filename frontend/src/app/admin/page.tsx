"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { Card, Notice, PageHeader, StatusBadge, formatDate, inputClass, selectClass } from "@/components/admin/ui";
import { SERVICE_LABELS, SHIPMENT_STATUSES, STATUS_LABELS, type ShipmentStatus } from "@/lib/api";
import { query, type Paged, type ShipmentListItem, type Stats } from "@/lib/admin-api";

const IN_PROGRESS: ShipmentStatus[] = ["picked_up", "in_transit", "at_customs", "out_for_delivery", "ready_for_pickup"];

export default function ShipmentsOverviewPage() {
  const { api } = useAdmin();
  const [stats, setStats] = useState<Stats | null>(null);
  const [list, setList] = useState<Paged<ShipmentListItem> | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ShipmentStatus | "">("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Stats>("/stats").then(setStats, (caught: Error) => setError(caught.message));
  }, [api]);

  // Search as you type, with a short pause so every keystroke doesn't hit the server.
  useEffect(() => {
    const timer = setTimeout(() => {
      api<Paged<ShipmentListItem>>(`/shipments${query({ q: search.trim(), status, page, limit: 20 })}`).then(
        (result) => {
          setList(result);
          setError(null);
        },
        (caught: Error) => setError(caught.message),
      );
    }, 250);
    return () => clearTimeout(timer);
  }, [api, search, status, page]);

  const inProgress = stats ? IN_PROGRESS.reduce((sum, key) => sum + stats.byStatus[key], 0) : null;
  const pages = list ? Math.max(1, Math.ceil(list.total / list.limit)) : 1;

  return (
    <>
      <PageHeader
        title="Shipments"
        subtitle="Book shipments, post updates and follow every delivery."
        action={
          <Link
            href="/admin/shipments/new"
            className="inline-flex h-11 items-center rounded-full bg-orange px-5 text-sm font-medium text-white shadow-sm shadow-orange/25 transition hover:bg-[#d9531a]"
          >
            + Book shipment
          </Link>
        }
      />

      {error && (
        <div className="mb-6">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      <dl className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "All shipments", value: stats?.total },
          { label: "Waiting for pickup", value: stats?.byStatus.pending },
          { label: "On the way", value: inProgress },
          { label: "Delivered", value: stats?.byStatus.delivered },
          { label: "Delivery issues", value: stats?.byStatus.exception, alert: true },
        ].map((card) => (
          <div key={card.label} className="rounded-3xl border border-ink/8 bg-white p-5">
            <dt className="text-sm text-ink/55">{card.label}</dt>
            <dd className={`mt-2 text-3xl font-light tracking-tight ${card.alert && card.value ? "text-red-600" : "text-navy"}`}>
              {card.value ?? "–"}
            </dd>
          </div>
        ))}
      </dl>

      <Card>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by tracking number or client name"
            className={`${inputClass} sm:flex-1`}
            aria-label="Search shipments"
          />
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ShipmentStatus | "");
              setPage(1);
            }}
            className={`${selectClass} sm:w-56`}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {SHIPMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        {!list ? (
          <div className="h-40 animate-pulse rounded-2xl bg-ink/5" />
        ) : list.items.length === 0 ? (
          <p className="py-12 text-center text-ink/55">
            {search || status ? "No shipments match." : "No shipments yet. Book the first one to get started."}
          </p>
        ) : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-ink/8 text-xs uppercase tracking-wider text-ink/45">
                <tr>
                  <th className="px-5 py-3 font-medium sm:px-6">Tracking number</th>
                  <th className="px-3 py-3 font-medium">Sender → Receiver</th>
                  <th className="px-3 py-3 font-medium">Route</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Now at</th>
                  <th className="px-5 py-3 font-medium sm:px-6">Booked</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((item) => (
                  <tr key={item._id} className="border-b border-ink/5 last:border-0 hover:bg-paper">
                    <td className="px-5 py-3.5 sm:px-6">
                      <Link href={`/admin/shipments/${item.trackingNumber}`} className="font-mono font-medium text-navy hover:text-orange">
                        {item.trackingNumber}
                      </Link>
                      <div className="text-xs text-ink/45">{SERVICE_LABELS[item.service]}</div>
                    </td>
                    <td className="px-3 py-3.5">
                      {item.sender?.name ?? "–"} <span className="text-ink/35">→</span> {item.receiver?.name ?? "–"}
                    </td>
                    <td className="px-3 py-3.5 text-ink/65">
                      {item.origin} <span className="text-ink/35">→</span> {item.destination}
                    </td>
                    <td className="px-3 py-3.5">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-3 py-3.5 text-ink/65">{item.currentLocation ?? "–"}</td>
                    <td className="px-5 py-3.5 text-ink/55 sm:px-6">{formatDate(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {list && list.total > list.limit && (
          <div className="mt-5 flex items-center justify-between text-sm text-ink/55">
            <span>
              Page {page} of {pages} · {list.total} shipments
            </span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-full px-4 py-2 hover:bg-ink/5 disabled:opacity-40">
                Previous
              </button>
              <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-full px-4 py-2 hover:bg-ink/5 disabled:opacity-40">
                Next
              </button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
