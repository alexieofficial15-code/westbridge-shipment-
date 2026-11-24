"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";

/**
 * OpenStreetMap map of a shipment: its planned route (dashed), the stops (filled once passed),
 * the line the vehicle has driven, and the vehicle itself. Used on the customer's page and in
 * the admin dashboard, where clicking the map can pick a point (`onPick`).
 *
 * Leaflet only runs in the browser, so it is loaded after the page has rendered.
 */

type Point = { lat: number; lng: number };

export type MapStop = { kind: "origin" | "hub" | "destination"; label: string; location?: Point | null };

export type MapProps = {
  route?: MapStop[];
  currentStop?: number;
  vehicle?: (Point & { note?: string | null; source?: string }) | null;
  trail?: Point[];
  /** Extra plain markers, e.g. all hubs on the hubs page. */
  markers?: (Point & { label: string; muted?: boolean })[];
  /** A point the admin has picked but not saved yet. */
  picked?: Point | null;
  onPick?: (point: Point) => void;
  className?: string;
};

const NAVY = "#182a48";
const ORANGE = "#eb5f1e";
const GREY = "#9aa3ad";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function TrackingMap({ route = [], currentStop = 0, vehicle, trail = [], markers = [], picked, onPick, className = "" }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const onPickRef = useRef(onPick);
  const fittedKeyRef = useRef<string>("");
  const [ready, setReady] = useState(false);

  onPickRef.current = onPick;

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((module) => {
      const L = module.default ?? module;
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      map.setView([4, 10], 5);
      // Scroll-zoom only after the map is clicked, so scrolling the page doesn't get stuck on it.
      map.on("click", (event: Leaflet.LeafletMouseEvent) => {
        map.scrollWheelZoom.enable();
        onPickRef.current?.({ lat: Number(event.latlng.lat.toFixed(5)), lng: Number(event.latlng.lng.toFixed(5)) });
      });
      map.on("mouseout", () => map.scrollWheelZoom.disable());
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Redraw everything that's on top of the map whenever the data changes.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;
    layer.clearLayers();

    const located = route
      .map((stop, index) => ({ ...stop, index }))
      .filter((stop): stop is MapStop & { index: number; location: Point } => Boolean(stop.location));
    const latLngs = located.map((stop) => [stop.location.lat, stop.location.lng] as [number, number]);

    // Planned route.
    if (latLngs.length > 1) {
      L.polyline(latLngs, { color: NAVY, weight: 3, opacity: 0.55, dashArray: "6 8" }).addTo(layer);
      // The part already travelled, stop to stop.
      const done = located.filter((stop) => stop.index <= currentStop).map((stop) => [stop.location.lat, stop.location.lng] as [number, number]);
      if (done.length > 1) L.polyline(done, { color: ORANGE, weight: 4, opacity: 0.85 }).addTo(layer);
    }

    // Where the vehicle has actually been.
    if (trail.length > 1) {
      L.polyline(
        trail.map((point) => [point.lat, point.lng] as [number, number]),
        { color: ORANGE, weight: 3, opacity: 0.9 },
      ).addTo(layer);
    }

    // Stops.
    for (const stop of located) {
      const passed = stop.index <= currentStop;
      const isEnd = stop.kind !== "hub";
      L.circleMarker([stop.location.lat, stop.location.lng], {
        radius: isEnd ? 8 : 6,
        color: "#ffffff",
        weight: 2,
        fillColor: passed ? ORANGE : isEnd ? NAVY : GREY,
        fillOpacity: 1,
      })
        .bindTooltip(escapeHtml(stop.label), { direction: "top", offset: [0, -6] })
        .addTo(layer);
    }

    // Plain markers (hubs page).
    for (const marker of markers) {
      L.circleMarker([marker.lat, marker.lng], {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: marker.muted ? GREY : NAVY,
        fillOpacity: 1,
      })
        .bindTooltip(escapeHtml(marker.label), { direction: "top", offset: [0, -6] })
        .addTo(layer);
    }

    // The vehicle.
    if (vehicle) {
      L.marker([vehicle.lat, vehicle.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div class="map-vehicle"><span class="map-vehicle-pulse"></span><span class="map-vehicle-dot">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5h11v9.5H2zM13 10h4l3 3v3h-7z"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/></svg>
          </span></div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
        zIndexOffset: 1000,
      })
        .bindTooltip(escapeHtml(vehicle.note || "Current position"), { direction: "top", offset: [0, -16] })
        .addTo(layer);
    }

    // A point picked by the admin but not saved yet.
    if (picked) {
      L.circleMarker([picked.lat, picked.lng], { radius: 9, color: ORANGE, weight: 3, fillColor: "#ffffff", fillOpacity: 1, dashArray: "3 3" })
        .bindTooltip("New position (not saved yet)", { direction: "top", offset: [0, -8], permanent: true })
        .addTo(layer);
    }

    // Zoom to fit the route once per route (not on every refresh, so the view doesn't jump while someone is looking).
    const everything = [...latLngs, ...markers.map((m) => [m.lat, m.lng] as [number, number]), ...(vehicle ? [[vehicle.lat, vehicle.lng] as [number, number]] : [])];
    const key = JSON.stringify([latLngs, markers.length]);
    if (everything.length > 0 && fittedKeyRef.current !== key) {
      fittedKeyRef.current = key;
      if (everything.length === 1) map.setView(everything[0]!, 11);
      else map.fitBounds(L.latLngBounds(everything), { padding: [40, 40], maxZoom: 12 });
    }
  }, [ready, route, currentStop, vehicle, trail, markers, picked]);

  return <div ref={containerRef} className={`z-0 h-80 w-full overflow-hidden rounded-2xl bg-[#e8e6e1] sm:h-[26rem] ${className}`} />;
}
