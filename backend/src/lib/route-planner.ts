import type { Types } from "mongoose";
import type { HubKind } from "../models/hub.model.js";
import type { ServiceType, ShipmentStatus } from "../models/shipment.model.js";
import { type AutoHub, autoAirport, autoCitiesOnTheWay, autoOffice, autoPort } from "./auto-hubs.js";
import { distanceKm, type LatLng } from "./geo.js";

/**
 * Plans the stops a shipment passes through, the way courier networks do:
 * sender's area -> sorting hub -> hubs along the way -> hub nearest the receiver -> receiver's area.
 *
 *  - Road and door-to-door go hub to hub, adding hubs that lie roughly on the way.
 *  - Air goes via the main airport for the sender and the main airport for the receiver.
 *  - Sea does the same with seaports.
 * Hubs come from the dashboard (Hubs page) where there is one near enough; everywhere else they
 * are picked automatically for that country (see auto-hubs.ts), so every route works worldwide.
 * If a shipment's two ends share the same airport or port, it goes by road instead.
 * If either end has no map position, the route is just the two ends.
 */

/** A hub the admin added on the Hubs page. */
export type PlannerHub = { id: Types.ObjectId; name: string; kind: HubKind; location: LatLng };
export type RouteStop = { kind: "origin" | "hub" | "destination"; label: string; hub?: Types.ObjectId; location?: LatLng };
type End = { label: string; location?: LatLng };
/** A chosen stop: one of the admin's hubs (with its id) or an automatic one. */
type Stop = { key: string; name: string; location: LatLng; id?: Types.ObjectId };

// A hub counts as "on the way" if visiting it adds at most this share of the direct distance.
const CORRIDOR_SHARE = 0.15;
const MAX_HUBS_ON_THE_WAY = 3;
// The admin's own hubs are used when they're this close; otherwise an automatic one is picked.
const OWN_OFFICE_KM = 100;
const OWN_GATEWAY_KM = 150;

const fromAdmin = (hub: PlannerHub): Stop => ({ key: String(hub.id), name: hub.name, location: hub.location, id: hub.id });
const fromAuto = (hub: AutoHub): Stop => ({ key: hub.key, name: hub.name, location: hub.location });

function nearestWithin(hubs: PlannerHub[], point: LatLng, maxKm: number): PlannerHub | undefined {
  let best: PlannerHub | undefined;
  let bestKm = maxKm;
  for (const hub of hubs) {
    const km = distanceKm(hub.location, point);
    if (km <= bestKm) {
      best = hub;
      bestKm = km;
    }
  }
  return best;
}

export function planRoute(from: End, to: End, service: ServiceType, hubs: PlannerHub[]): RouteStop[] {
  const origin: RouteStop = { kind: "origin", label: from.label, ...(from.location ? { location: from.location } : {}) };
  const destination: RouteStop = { kind: "destination", label: to.label, ...(to.location ? { location: to.location } : {}) };
  if (!from.location || !to.location) return [origin, destination];

  const a = from.location;
  const b = to.location;
  const offices = hubs.filter((hub) => hub.kind === "office");
  const office = (point: LatLng): Stop => {
    const own = nearestWithin(offices, point, OWN_OFFICE_KM);
    return own ? fromAdmin(own) : fromAuto(autoOffice(point));
  };
  const gateway = (kind: "airport" | "port", point: LatLng): Stop => {
    const own = nearestWithin(
      hubs.filter((hub) => hub.kind === kind),
      point,
      OWN_GATEWAY_KM,
    );
    return own ? fromAdmin(own) : fromAuto(kind === "airport" ? autoAirport(point) : autoPort(point));
  };

  const first = office(a);
  const last = office(b);
  let path: Stop[] = [];
  const gatewayKind = service === "air" ? "airport" : service === "sea" ? "port" : null;
  if (gatewayKind) {
    const gwA = gateway(gatewayKind, a);
    const gwB = gateway(gatewayKind, b);
    // Two different gateways a reasonable way apart; otherwise it goes by road.
    if (gwA.key !== gwB.key && distanceKm(gwA.location, gwB.location) > 50) path = [first, gwA, gwB, last];
  }
  if (path.length === 0) {
    const direct = distanceKm(a, b);
    const inCorridor = (point: LatLng) => distanceKm(a, point) + distanceKm(point, b) - direct <= direct * CORRIDOR_SHARE;
    const ownOnTheWay = offices
      .filter((hub) => String(hub.id) !== first.key && String(hub.id) !== last.key && inCorridor(hub.location))
      .map(fromAdmin);
    const avoid = [a, b, first.location, last.location, ...ownOnTheWay.map((stop) => stop.location)];
    const autoOnTheWay = autoCitiesOnTheWay(a, b, CORRIDOR_SHARE, MAX_HUBS_ON_THE_WAY, avoid).map(fromAuto);
    const onTheWay = [...ownOnTheWay, ...autoOnTheWay]
      .sort((x, y) => distanceKm(a, x.location) - distanceKm(a, y.location))
      .slice(0, MAX_HUBS_ON_THE_WAY);
    path = [first, ...onTheWay, last];
  }

  // The same hub twice in a row (e.g. both ends share a sorting hub) is one stop.
  const stops = path.filter((stop, index) => index === 0 || stop.key !== path[index - 1]!.key);

  return [
    origin,
    ...stops.map((stop): RouteStop => ({ kind: "hub", label: stop.name, ...(stop.id ? { hub: stop.id } : {}), location: stop.location })),
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
