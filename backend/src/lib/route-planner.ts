import type { Types } from "mongoose";
import type { HubKind } from "../models/hub.model.js";
import type { ServiceType, ShipmentStatus } from "../models/shipment.model.js";
import { distanceKm, type LatLng } from "./geo.js";

/**
 * Plans the stops a shipment passes through, the way courier networks do:
 * sender's area -> nearest hub -> hubs along the way -> hub nearest the receiver -> receiver's area.
 *
 *  - Road and door-to-door go office to office, adding offices that lie roughly on the way.
 *  - Air goes via the airport nearest the sender and the airport nearest the receiver.
 *  - Sea does the same with seaports.
 * If a shipment's two ends share the same airport or port, it falls back to road.
 * If either end has no map position, the route is just the two ends.
 */

export type PlannerHub = { id: Types.ObjectId; name: string; kind: HubKind; location: LatLng };
export type RouteStop = { kind: "origin" | "hub" | "destination"; label: string; hub?: Types.ObjectId; location?: LatLng };
type End = { label: string; location?: LatLng };

// A hub counts as "on the way" if visiting it adds at most this share of the direct distance.
const CORRIDOR_SHARE = 0.15;
const MAX_HUBS_ON_THE_WAY = 3;

function nearest(hubs: PlannerHub[], point: LatLng): PlannerHub | undefined {
  let best: PlannerHub | undefined;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const hub of hubs) {
    const km = distanceKm(hub.location, point);
    if (km < bestKm) {
      best = hub;
      bestKm = km;
    }
  }
  return best;
}

function roadPath(pool: PlannerHub[], a: LatLng, b: LatLng): PlannerHub[] {
  const first = nearest(pool, a);
  const last = nearest(pool, b);
  if (!first || !last) return [];
  const direct = distanceKm(a, b);
  const onTheWay = pool
    .filter((hub) => hub !== first && hub !== last)
    .filter((hub) => distanceKm(a, hub.location) + distanceKm(hub.location, b) - direct <= direct * CORRIDOR_SHARE)
    .sort((x, y) => distanceKm(a, x.location) - distanceKm(a, y.location))
    .slice(0, MAX_HUBS_ON_THE_WAY);
  return [first, ...onTheWay, last];
}

export function planRoute(from: End, to: End, service: ServiceType, hubs: PlannerHub[]): RouteStop[] {
  const origin: RouteStop = { kind: "origin", label: from.label, ...(from.location ? { location: from.location } : {}) };
  const destination: RouteStop = { kind: "destination", label: to.label, ...(to.location ? { location: to.location } : {}) };
  if (!from.location || !to.location || hubs.length === 0) return [origin, destination];

  const a = from.location;
  const b = to.location;
  const offices = hubs.filter((hub) => hub.kind === "office");
  const roadPool = offices.length > 0 ? offices : hubs;

  const gatewayKind: HubKind | null = service === "air" ? "airport" : service === "sea" ? "port" : null;
  const gateways = gatewayKind ? hubs.filter((hub) => hub.kind === gatewayKind) : [];
  const gwA = nearest(gateways, a);
  const gwB = nearest(gateways, b);

  let path: PlannerHub[];
  if (gwA && gwB && !gwA.id.equals(gwB.id)) {
    path = [nearest(offices, a), gwA, gwB, nearest(offices, b)].filter((hub): hub is PlannerHub => Boolean(hub));
  } else {
    path = roadPath(roadPool, a, b);
  }

  // The same hub twice in a row (e.g. the sender's nearest office is also the receiver's) is one stop.
  const stops = path.filter((hub, index) => index === 0 || !hub.id.equals(path[index - 1]!.id));

  return [
    origin,
    ...stops.map((hub): RouteStop => ({ kind: "hub", label: hub.name, hub: hub.id, location: hub.location })),
    destination,
  ];
}

/** A rough delivery estimate in days from the route's length and the service. The admin can override it. */
export function estimateTransitDays(stops: RouteStop[], service: ServiceType): number {
  const points = stops.map((stop) => stop.location).filter((point): point is LatLng => Boolean(point));
  let km = 0;
  for (let i = 1; i < points.length; i++) km += distanceKm(points[i - 1]!, points[i]!);

  switch (service) {
    case "air":
      return 2 + Math.ceil(km / 5000);
    case "sea":
      return 7 + Math.ceil(km / 700);
    default:
      // Road: about 500 km a day, plus a day for collection and sorting.
      return 1 + Math.ceil(km / 500);
  }
}

/**
 * Where on the route a status update puts the shipment, unless the admin picks a stop.
 * It never moves the shipment backwards by itself.
 */
export function defaultStopFor(status: ShipmentStatus, current: number, routeLength: number): number {
  const last = Math.max(0, routeLength - 1);
  const lastHub = Math.max(0, last - 1);
  switch (status) {
    case "pending":
    case "picked_up":
      return current;
    case "in_transit":
      // On to the next hub, but not past the last one: arriving at the receiver is "delivered".
      return Math.min(current + 1, Math.max(lastHub, current));
    case "out_for_delivery":
    case "ready_for_pickup":
      return Math.max(current, lastHub);
    case "delivered":
      return last;
    default:
      // at_customs, exception: stays where it is.
      return current;
  }
}

/** The wording used for a status update when the admin doesn't write one. */
export function defaultDescription(status: ShipmentStatus, stopLabel: string): string {
  switch (status) {
    case "pending":
      return "Shipment registered";
    case "picked_up":
      return "Picked up from the sender";
    case "in_transit":
      return `Arrived at ${stopLabel}`;
    case "at_customs":
      return `Held for customs clearance at ${stopLabel}`;
    case "out_for_delivery":
      return "Out for delivery";
    case "ready_for_pickup":
      return `Ready for pickup at ${stopLabel}`;
    case "delivered":
      return "Delivered";
    case "exception":
      return "Delivery issue. We will contact you";
  }
}
