import type { Types } from "mongoose";
import { cacheDelete } from "../cache/redis.js";
import { Client } from "../models/client.model.js";
import { Hub, type HubKind } from "../models/hub.model.js";
import { Photo } from "../models/photo.model.js";
import {
  MAX_TRAIL_POINTS,
  Shipment,
  type PositionSource,
  type ServiceType,
  type ShipmentStatus,
} from "../models/shipment.model.js";
import { blurPoint, distanceKm, type LatLng } from "./geo.js";
import { sendMail, statusUpdateEmail, trackingNumberEmail } from "./mailer.js";
import { estimateTransitDays, planRoute, type RouteStop } from "./route-planner.js";
import { simulationAt } from "./simulation-math.js";
import { generateTrackingNumber } from "./tracking-number.js";

// Plain shapes of what comes back from `.lean()` queries.
export type ClientRecord = {
  _id: Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  address: { street: string; city: string; country: string; postalCode?: string | null };
  location?: LatLng | null;
};

export type ShipmentRecord = {
  _id: Types.ObjectId;
  trackingNumber: string;
  sender: Types.ObjectId;
  receiver: Types.ObjectId;
  service: ServiceType;
  package: { weightKg: number; lengthCm: number; widthCm: number; heightCm: number; pieces: number; contents: string };
  status: ShipmentStatus;
  route: RouteStop[];
  currentStop: number;
  estimatedDelivery?: Date | null;
  notice?: string | null;
  events: { status: ShipmentStatus; location?: string; description?: string; timestamp: Date; stopIndex?: number }[];
  vehicle?: { location: LatLng; note?: string; source: PositionSource; updatedAt: Date } | null;
  trail?: { lat: number; lng: number; timestamp: Date; source: PositionSource }[];
  simulation?: {
    active: boolean;
    startedAt: Date;
    endsAt: Date;
    fromStop: number;
    startPoint?: LatLng | null;
    appliedStop: number;
    pickedUpApplied: boolean;
    outForDeliveryApplied: boolean;
    notify: boolean;
    rev: number;
  } | null;
  createdAt: Date;
  updatedAt: Date;
};

export const cityLabel = (client: Pick<ClientRecord, "address">) => `${client.address.city}, ${client.address.country}`;

export const trackCacheKey = (trackingNumber: string) => `track:${trackingNumber}`;

/** Plans a route between two clients using the active hubs. */
export async function routeBetween(sender: ClientRecord, receiver: ClientRecord, service: ServiceType) {
  const hubs = (await Hub.find({ active: true }).lean()) as unknown as {
    _id: Types.ObjectId;
    name: string;
    kind: HubKind;
    location: LatLng;
  }[];
  return planRoute(
    { label: cityLabel(sender), location: sender.location ?? undefined },
    { label: cityLabel(receiver), location: receiver.location ?? undefined },
    service,
    hubs.map((hub) => ({ id: hub._id, name: hub.name, kind: hub.kind, location: hub.location })),
  );
}

const isDuplicateKey = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;

export async function createShipment(input: {
  senderId: string;
  receiverId: string;
  service: ServiceType;
  package: ShipmentRecord["package"];
  estimatedDelivery?: Date;
  sendEmail?: boolean;
}): Promise<{ shipment: ShipmentRecord; emailed: boolean } | { error: string }> {
  const [sender, receiver] = (await Promise.all([
    Client.findById(input.senderId).lean(),
    Client.findById(input.receiverId).lean(),
  ])) as unknown as [ClientRecord | null, ClientRecord | null];
  if (!sender) return { error: "Sender not found" };
  if (!receiver) return { error: "Receiver not found" };

  const route = await routeBetween(sender, receiver, input.service);
  const estimatedDelivery =
    input.estimatedDelivery ?? new Date(Date.now() + estimateTransitDays(route, input.service) * 86_400_000);

  // A clash between two random 12-character numbers is astronomically unlikely, but retry just in case.
  let created: ShipmentRecord | undefined;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    try {
      const doc = await Shipment.create({
        trackingNumber: generateTrackingNumber(),
        sender: sender._id,
        receiver: receiver._id,
        service: input.service,
        package: input.package,
        status: "pending",
        route,
        currentStop: 0,
        estimatedDelivery,
        events: [
          { status: "pending", location: route[0]!.label, description: "Shipment registered", timestamp: new Date(), stopIndex: 0 },
        ],
      });
      created = doc.toObject() as unknown as ShipmentRecord;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }
  if (!created) return { error: "Could not generate a unique tracking number, please try again" };

  const emailed = input.sendEmail === false ? false : await emailTrackingNumber(created, sender, receiver);
  return { shipment: created, emailed };
}

/**
 * Emails the tracking number, shipment details and package photos to the receiver (only the
 * receiver is emailed). Never throws; returns whether the email was accepted.
 */
export async function emailTrackingNumber(shipment: ShipmentRecord, sender: ClientRecord, receiver: ClientRecord) {
  let photoIds: string[] = [];
  try {
    const photos = await Photo.find({ shipment: shipment._id }, { _id: 1 }).sort({ createdAt: 1 }).lean();
    photoIds = photos.map((photo) => String(photo._id));
  } catch {
    // Send without photos rather than not at all.
  }
  const details = {
    trackingNumber: shipment.trackingNumber,
    from: cityLabel(sender),
    to: cityLabel(receiver),
    service: shipment.service,
    pieces: shipment.package.pieces,
    weightKg: shipment.package.weightKg,
    contents: shipment.package.contents,
    estimatedDelivery: shipment.estimatedDelivery ?? null,
    senderName: sender.name,
    receiverName: receiver.name,
    photoIds,
  };
  return sendMail({ to: receiver.email, ...trackingNumberEmail({ ...details, name: receiver.name, role: "receiver" }) });
}

// Within this distance of the sender's or receiver's real address, the vehicle's exact
// position isn't shown publicly, so the map never leads strangers to a customer's door.
const PRIVATE_RADIUS_KM = 2;

/**
 * What anyone with the tracking number may see. Deliberately leaves out names, emails,
 * phone numbers, street addresses and package contents; the two ends of the route are
 * shown at city level only, with their map position blurred to about 11 km.
 */
/**
 * While a simulation is running, the vehicle's position and the line it has driven are worked
 * out from the clock rather than stored. This returns the shipment with them filled in.
 */
export function withSimulationView(shipment: ShipmentRecord, now = new Date()): ShipmentRecord {
  const sim = shipment.simulation;
  if (!sim?.active) return shipment;
  const snapshot = simulationAt(shipment.route, sim, now);
  if (!snapshot.position) return shipment;
  const next = snapshot.nextStop === null ? null : shipment.route[snapshot.nextStop];
  return {
    ...shipment,
    vehicle: {
      location: snapshot.position,
      source: "estimate",
      note: next ? `On the way to ${next.label}` : undefined,
      updatedAt: now,
    },
    trail: [...(shipment.trail ?? []), ...snapshot.driven.map((point) => ({ ...point, source: "estimate" as const, timestamp: now }))],
  };
}

/** Simulation progress for the dashboard. */
export function simulationInfo(shipment: ShipmentRecord, now = new Date()) {
  const sim = shipment.simulation;
  if (!sim?.active) return null;
  const snapshot = simulationAt(shipment.route, sim, now);
  return {
    startedAt: sim.startedAt,
    endsAt: sim.endsAt,
    notify: sim.notify,
    progress: Math.round(snapshot.progress * 100),
    nextStop: snapshot.nextStop === null ? null : (shipment.route[snapshot.nextStop]?.label ?? null),
  };
}

export function toPublicShipment(rawShipment: ShipmentRecord, photoIds: string[] = []) {
  const shipment = withSimulationView(rawShipment);
  const ends = [shipment.route[0]?.location, shipment.route.at(-1)?.location].filter((point): point is LatLng => Boolean(point));
  const isPrivate = (point: LatLng) => ends.some((end) => distanceKm(end, point) < PRIVATE_RADIUS_KM);

  const route = shipment.route.map((stop) => ({
    kind: stop.kind,
    label: stop.label,
    location: stop.location ? (stop.kind === "hub" ? stop.location : blurPoint(stop.location)) : null,
  }));

  // The marker on the map: the vehicle's last reported position if it's newer than the last
  // status update (and not next to a customer's address), otherwise the current route stop.
  const lastEvent = shipment.events.at(-1);
  const vehicle = shipment.vehicle;
  const vehicleIsLatest =
    vehicle && !isPrivate(vehicle.location) && (!lastEvent || new Date(vehicle.updatedAt) >= new Date(lastEvent.timestamp));
  const stop = route[shipment.currentStop];
  const position = vehicleIsLatest
    ? { ...vehicle.location, source: vehicle.source, note: vehicle.note ?? null, updatedAt: vehicle.updatedAt }
    : stop?.location
      ? { ...stop.location, source: "stop" as const, note: stop.label, updatedAt: lastEvent?.timestamp ?? shipment.updatedAt }
      : null;

  // Route distance, straight line stop to stop (so a little shorter than by road). "Covered" counts
  // the legs already completed, plus the part of the next leg the vehicle has reported driving.
  const legs: number[] = [];
  for (let i = 1; i < shipment.route.length; i++) {
    const a = shipment.route[i - 1]?.location;
    const b = shipment.route[i]?.location;
    legs.push(a && b ? distanceKm(a, b) : Number.NaN);
  }
  const hasDistance = legs.length > 0 && legs.every(Number.isFinite);
  const totalKm = hasDistance ? legs.reduce((sum, km) => sum + km, 0) : null;
  let coveredKm: number | null = null;
  if (totalKm !== null) {
    const done = legs.slice(0, shipment.currentStop).reduce((sum, km) => sum + km, 0);
    const from = shipment.route[shipment.currentStop]?.location;
    const nextLeg = legs[shipment.currentStop] ?? 0;
    const partial = vehicleIsLatest && from ? Math.min(distanceKm(from, vehicle.location), nextLeg) : 0;
    coveredKm = shipment.status === "delivered" ? totalKm : Math.min(totalKm, done + partial);
  }

  return {
    trackingNumber: shipment.trackingNumber,
    status: shipment.status,
    service: shipment.service,
    pieces: shipment.package.pieces,
    weightKg: shipment.package.weightKg,
    dimensionsCm: { length: shipment.package.lengthCm, width: shipment.package.widthCm, height: shipment.package.heightCm },
    // Shown on the customer's page by the business's choice. Tracking numbers are random and
    // unguessable, so only people the number was shared with can see it.
    contents: shipment.package.contents,
    // The admin's own message for the customer, if any (replaces the standard "What to do now").
    notice: shipment.notice ?? null,
    distance: totalKm === null ? null : { totalKm: Math.round(totalKm), coveredKm: Math.round(coveredKm ?? 0) },
    bookedAt: shipment.createdAt,
    origin: route[0]?.label ?? null,
    destination: route.at(-1)?.label ?? null,
    route,
    currentStop: shipment.currentStop,
    estimatedDelivery: shipment.estimatedDelivery ?? null,
    events: shipment.events.map(({ status, location, description, timestamp }) => ({ status, location, description, timestamp })),
    position,
    trail: (shipment.trail ?? []).filter((point) => !isPrivate(point)).map(({ lat, lng, timestamp }) => ({ lat, lng, timestamp })),
    photos: photoIds,
    updatedAt: shipment.updatedAt,
  };
}

/**
 * Emails a status update to the receiver (only the receiver is emailed). Never throws; returns
 * whether the email was accepted (false when email isn't set up).
 */
export async function emailStatusUpdate(
  shipment: Pick<ShipmentRecord, "trackingNumber" | "sender" | "receiver">,
  event: { status: ShipmentStatus; description?: string; location?: string; timestamp: Date },
) {
  const receiver = (await Client.findById(shipment.receiver).lean()) as unknown as ClientRecord | null;
  if (!receiver) return false;
  return sendMail({
    to: receiver.email,
    ...statusUpdateEmail({
      name: receiver.name,
      trackingNumber: shipment.trackingNumber,
      status: event.status,
      description: event.description ?? "",
      location: event.location,
      timestamp: event.timestamp,
    }),
  });
}

export async function forgetCachedShipment(trackingNumber: string) {
  await cacheDelete(trackCacheKey(trackingNumber));
}

/**
 * Records where the vehicle is. Used both by the admin (entering the driver's reports by hand)
 * and, later, by a GPS tracker; the customer's map treats them the same way.
 */
export async function recordPosition(trackingNumber: string, point: LatLng, source: PositionSource, note?: string) {
  const now = new Date();
  const updated = await Shipment.findOneAndUpdate(
    { trackingNumber },
    {
      $set: { vehicle: { location: point, source, updatedAt: now, ...(note ? { note } : {}) } },
      $push: { trail: { $each: [{ ...point, source, timestamp: now }], $slice: -MAX_TRAIL_POINTS } },
    },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (updated) await forgetCachedShipment(trackingNumber);
  return updated;
}
