export type ShipmentStatus =
  | "pending"
  | "picked_up"
  | "in_transit"
  | "at_customs"
  | "out_for_delivery"
  | "ready_for_pickup"
  | "delivered"
  | "exception";

export type ServiceType = "road" | "air" | "sea" | "door_to_door";

export type TrackingEvent = {
  status: ShipmentStatus;
  location?: string;
  description?: string;
  timestamp: string;
};

export type RouteStop = {
  kind: "origin" | "hub" | "destination";
  label: string;
  location: { lat: number; lng: number } | null;
};

/** What the public tracking page receives. No names, contacts or addresses. */
export type Shipment = {
  trackingNumber: string;
  status: ShipmentStatus;
  service: ServiceType;
  pieces: number;
  weightKg: number;
  dimensionsCm: { length: number; width: number; height: number };
  /** What's inside, as entered by the admin when booking. */
  contents: string;
  /** The admin's own message for the customer; replaces the standard "What to do now" text. */
  notice: string | null;
  /** Route length stop to stop, and how much of it is done. Null if a stop isn't on the map. */
  distance: { totalKm: number; coveredKm: number } | null;
  bookedAt: string;
  origin?: string | null;
  destination?: string | null;
  route: RouteStop[];
  currentStop: number;
  estimatedDelivery?: string | null;
  events: TrackingEvent[];
  /** Where the map marker goes: the vehicle's last report, or the current route stop. */
  position: MapPosition | null;
  /** Past vehicle positions, oldest first: the line drawn behind the vehicle. */
  trail: { lat: number; lng: number; timestamp: string }[];
  /** Ids of package photos; see photoUrl(). */
  photos: string[];
  updatedAt: string;
};

export type MapPosition = {
  lat: number;
  lng: number;
  source: "manual" | "gps" | "estimate" | "stop";
  note: string | null;
  updatedAt: string;
};

export const photoUrl = (trackingNumber: string, photoId: string) =>
  `/api/v1/track/${encodeURIComponent(trackingNumber)}/photos/${photoId}`;

export const SHIPMENT_STATUSES: ShipmentStatus[] = [
  "pending",
  "picked_up",
  "in_transit",
  "at_customs",
  "out_for_delivery",
  "ready_for_pickup",
  "delivered",
  "exception",
];

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  pending: "Pending",
  picked_up: "Picked up",
  in_transit: "In transit",
  at_customs: "At customs",
  out_for_delivery: "Out for delivery",
  ready_for_pickup: "Ready for pickup",
  delivered: "Delivered",
  exception: "Delivery issue",
};

export const SERVICE_LABELS: Record<ServiceType, string> = {
  road: "Road freight",
  air: "Air freight",
  sea: "Sea freight",
  door_to_door: "Door-to-door",
};

// Admin (dashboard) requests live in admin-api.ts.

/** Returns the shipment, or null when the tracking number does not exist. */
export async function fetchShipment(trackingNumber: string, signal?: AbortSignal): Promise<Shipment | null> {
  const response = await fetch(`/api/v1/track/${encodeURIComponent(trackingNumber)}`, { signal });

  if (response.status === 404) return null;
  if (response.status === 400) throw new Error("That does not look like a valid tracking number.");
  if (response.status === 429) throw new Error("Too many requests. Please wait a moment and try again.");
  if (!response.ok) throw new Error("Something went wrong. Please try again.");

  return (await response.json()) as Shipment;
}
