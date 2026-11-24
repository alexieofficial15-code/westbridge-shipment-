import { env } from "../config/env.js";
import type { LatLng } from "./geo.js";

/**
 * Turns an address into map coordinates using OpenStreetMap's Nominatim service
 * (free, no key). Its usage policy allows at most one request per second, which is
 * plenty for an admin registering clients, and asks callers to identify their app.
 * Set GEOCODER_URL to use a different Nominatim-compatible server.
 *
 * Returns null when the address can't be found or the service is unreachable;
 * the caller decides what to do then.
 */

let nextSlot = 0;

async function waitForSlot(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + 1100;
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
}

export async function geocode(query: string): Promise<LatLng | null> {
  if (!query.trim()) return null;
  await waitForSlot();

  const url = new URL("/search", env.GEOCODER_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "tracking-backend/0.1", "Accept-Language": "en" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const results = (await response.json()) as { lat: string; lon: string }[];
    const first = results[0];
    if (!first) return null;
    const point = { lat: Number(first.lat), lng: Number(first.lon) };
    return Number.isFinite(point.lat) && Number.isFinite(point.lng) ? point : null;
  } catch {
    return null;
  }
}

/** Tries the full address first, then just the city, so a typo in the street still lands in the right city. */
export async function geocodeAddress(address: {
  street: string;
  city: string;
  country: string;
  postalCode?: string | null;
}): Promise<{ point: LatLng; precision: "address" | "city" } | null> {
  const full = [address.street, address.postalCode, address.city, address.country].filter(Boolean).join(", ");
  const exact = await geocode(full);
  if (exact) return { point: exact, precision: "address" };
  const city = await geocode(`${address.city}, ${address.country}`);
  return city ? { point: city, precision: "city" } : null;
}
