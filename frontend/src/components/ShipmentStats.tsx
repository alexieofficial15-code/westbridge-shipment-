"use client";

import { CountUp } from "@/components/CountUp";
import type { Shipment } from "@/lib/api";

const DAY = 86_400_000;

const wholeDays = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY));

/** "Your shipment in numbers": distance, progress and timing. Package facts are in the details card. */
export function ShipmentStats({ shipment }: { shipment: Shipment }) {
  const now = new Date();
  const delivered = shipment.status === "delivered";
  const deliveredAt = delivered ? new Date(shipment.events.findLast((event) => event.status === "delivered")?.timestamp ?? shipment.updatedAt) : null;
  const daysOnTheWay = wholeDays(new Date(shipment.bookedAt), deliveredAt ?? now);
  const eta = shipment.estimatedDelivery ? new Date(shipment.estimatedDelivery) : null;
  const daysLeft = eta ? Math.ceil((eta.getTime() - now.getTime()) / DAY) : null;

  const distance = shipment.distance;
  const progress = distance && distance.totalKm > 0 ? Math.round((distance.coveredKm / distance.totalKm) * 100) : delivered ? 100 : null;

  const big: { label: string; value: string; unit?: string; note?: string; bar?: number }[] = [
    {
      label: "Distance covered",
      value: distance ? distance.coveredKm.toLocaleString("en-US") : "–",
      unit: distance ? "km" : undefined,
      note: distance ? `of about ${distance.totalKm.toLocaleString("en-US")} km` : "Route not on the map yet",
      bar: progress ?? undefined,
    },
    {
      label: "Journey complete",
      value: progress === null ? "–" : String(progress),
      unit: progress === null ? undefined : "%",
      note: delivered ? "Arrived" : "Updates as it moves",
    },
    {
      label: delivered ? "Days it took" : "Days on the way",
      value: String(daysOnTheWay),
      unit: daysOnTheWay === 1 ? "day" : "days",
      note: `Booked ${new Date(shipment.bookedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`,
    },
    delivered
      ? {
          label: "Delivered on",
          value: deliveredAt!.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
          note: "Thank you for shipping with us",
        }
      : {
          label: "Arrives in",
          value: daysLeft === null ? "–" : String(Math.max(0, daysLeft)),
          unit: daysLeft === null ? undefined : Math.max(0, daysLeft) === 1 ? "day" : "days",
          note: eta ? (daysLeft !== null && daysLeft < 0 ? "Running late, we're on it" : `Expected ${eta.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`) : "Date to be confirmed",
        },
  ];

  return (
    <section className="rounded-3xl border border-ink/10 bg-white p-6 sm:p-8" aria-labelledby="stats-heading">
      <h2 id="stats-heading" className="text-2xl font-light tracking-tight text-navy">
        Your shipment in numbers
      </h2>

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {big.map((item) => (
          <div key={item.label} className="flex flex-col rounded-2xl bg-paper p-4 sm:p-5">
            <dt className="text-xs font-medium uppercase tracking-[0.14em] text-ink/50">{item.label}</dt>
            <dd className="mt-2 flex items-baseline gap-1.5 text-navy">
              <span className="text-3xl font-light tracking-tight sm:text-4xl">
                {/* Only plain numbers count up; dates and dashes are shown as they are. */}
                {/^[\d,]+$/.test(item.value) ? <CountUp value={item.value} /> : item.value}
              </span>
              {item.unit && <span className="text-sm text-ink/55">{item.unit}</span>}
            </dd>
            {item.bar !== undefined && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10" aria-hidden>
                <div className="h-full rounded-full bg-orange transition-[width] duration-1000" style={{ width: `${item.bar}%` }} />
              </div>
            )}
            {item.note && <p className="mt-auto pt-2 text-xs text-ink/50">{item.note}</p>}
          </div>
        ))}
      </dl>
    </section>
  );
}
